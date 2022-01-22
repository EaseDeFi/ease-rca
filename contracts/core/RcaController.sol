/// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.11;
import '../general/RcaGovernable.sol';
import '../library/MerkleProof.sol';
import '../interfaces/IRcaShield.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title RCA Controller
 * @notice Controller contract for all RCA vaults.
 * This contract creates vaults, emits events when anything happens on a vault,
 * keeps track of variables relevant to vault functionality, keeps track of capacities,
 * amounts for sale on each vault, prices of tokens, and updates vaults when needed.
 * @author Robert M.C. Forster
 */

contract RcaController is RcaGovernable {

    /// @notice Address => whether or not it's a verified shield.
    mapping (address => bool) public shieldMapping;
    /// @notice Address => whether or not it's a verified zapper.
    mapping (address => bool) public zappers;

    /// @notice Percents of coverage for each protocol of a specific shield, 1000 == 10%.
    mapping (address => ProtocolPercent[]) shieldProtocolPercents;
    /**
     * @dev For a Yearn vault with a Curve token with DAI, USDC, USDT:
     * Yearn|100%, Curve|100%, DAI|33%, USDC|33%, USDT|33%
     * Just used by frontend at the moment.
    */
    struct ProtocolPercent {
        uint128 protocolId;
        uint128 percent;
    }

    /// @notice Fees for users per year for using the system. Ideally just 0 but option is here. In hundredths of %. 1000 == 10%.
    uint256 public apr;
    /// @notice Amount of time users must wait to withdraw tokens after requesting redemption. In seconds.
    uint256 public withdrawalDelay;
    /// @notice Discount for purchasing tokens being liquidated from a shield.
    uint256 public discount;
    /// @notice The amount of each contract that's currently paused. Only non-zero after multisig
    /// declares a hack occurred and before DAO confirms for sale amounts. 1000 == 10%.
    uint256 public percentPaused;
    /// @notice Address that funds from selling tokens is sent to.
    address payable public treasury;
    /// @notice Amount of funds for sale on a protocol, sent in by DAO after a hack occurs (in token).
    bytes32 public forSaleRoot;
    /// @notice Merkle root of the amount of capacity available for each protocol (in USD).
    bytes32 public capacitiesRoot;
    /// @notice Root of all underlying token prices--only used if the protocol is doing pricing.
    bytes32 public priceRoot;

    /// @notice Last time each individual shield was checked for update.
    mapping (address => uint256) lastShieldUpdate;
    /**
     * @dev The update variable flow works in an interesting way to optimize efficiency:
     * Each time a user interacts with a specific shield vault, it calls Controller
     * for all necessary interactions (events, updates, etc.). The general Controller function
     * will check when when the last shield update was made vs. all recent other updates.
     * If a system update is more recent than the shield update, value is changed.
     */
    struct SystemUpdates {
        uint32 forSaleUpdate;
        uint32 pausedUpdate;
        uint32 withdrawalDelayUpdate;
        uint32 discountUpdate;
        uint32 aprUpdate;
        uint32 treasuryUpdate;
    }
    SystemUpdates private systemUpdates;

    /**
     * @dev Events are used to notify the frontend of events on shields. If we have 1,000 shields,
     * a centralized event system can tell the frontend which shields to check for a specific user.
     */
    event Mint(address indexed rcaShield, address indexed user, uint256 timestamp);
    event RedeemRequest(address indexed rcaShield, address indexed user, uint256 rcaAmount, uint256 timestamp);
    event RedeemFinalize(address indexed rcaShield, address indexed user, address indexed to, uint256 rcaAmount, uint256 timestamp);
    event Purchase(address indexed rcaShield, address indexed user, uint256 timestamp);
    event ShieldCreated(address indexed rcaShield, address indexed underlyingToken, string name, string symbol, uint256 timestamp);

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////// modifiers //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Update is used before each onlyShield function to ensure the shield is up-to-date before actions.
     * @param _addForSale Additional amount for sale.
     * @param _oldCumForSale Old cumulative amount of funds for sale. Needed to ensure additional is accurate.
     * @param _forSaleProof Merkle proof for the for sale amount.
     */
    modifier update(
        uint256   _addForSale,
        uint256   _oldCumForSale,
        bytes32[] memory _forSaleProof
    )
    {
        _update(
            _addForSale,
            _oldCumForSale,
            _forSaleProof
        );
        _;
    }
    
    /**
     * @notice Ensure the sender is a shield.
     * @dev We don't want non-shield contracts creating mint, redeem, purchase events.
     */
    modifier onlyShield()
    {
        require(shieldMapping[msg.sender], "Caller must be a Shield Vault.");
        _;
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////// constructor /////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Construct with initial privileged addresses for controller.
     * @param _governor Complete control of the contracts. Can change all other owners.
     * @param _guardian Guardian multisig that can freeze percents after a hack.
     * @param _priceOracle Oracle that can submit price root to the ecosystem.
     * @param _capOracle Oracle that can submit capacity root to the ecosystem.
     */
    constructor(
        address _governor,
        address _guardian,
        address _priceOracle,
        address _capOracle,
        uint256 _apr,
        uint256 _discount,
        uint256 _withdrawalDelay,
        address payable _treasury
    )
    {
        initRcaGovernable(
            _governor,
            _guardian,
            _capOracle,
            _priceOracle
        );

        apr = _apr;
        discount = _discount;
        treasury = _treasury;
        withdrawalDelay = _withdrawalDelay;
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////// onlyShield /////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Updates contract, emits event for minting, checks capacity.
     */
    function mint(
        address   _user,
        uint256   _uAmount,
        uint256   _capacity,
        bytes32[] calldata _capacityProof,
        uint256   _addForSale,
        uint256   _oldCumForSale,
        bytes32[] calldata _forSaleProof
    )
      external
      update(
          _addForSale,
          _oldCumForSale,
          _forSaleProof
      )
      onlyShield
    {
        /** 
         * @dev Capacity isn't really bulletproof here because shields don't keep track on-chain, so 
         * between updates people can technically overload the shield if a lot of transactions suddenly 
         * happen. We don't keep track on-chain because we'll be on multiple chains without 
         * cross-communication. We've decided there's not enough risk to keep capacities fully on-chain.
         */ 
        verifyCapacity(
            msg.sender, 
            _capacity, 
            _capacityProof
        );
        require(_uAmount < _capacity, "Not enough capacity available.");
        
        emit Mint(
            msg.sender, 
            _user, 
            block.timestamp
        );
    }

    /**
     * @notice Updates contract, emits event for redeem action.
     * @param _user User that is redeeming tokens.
     * @param _rcaAmount The amount of RCAs they're redeeming.
     */
    function redeemRequest(
        address   _user,
        uint256   _rcaAmount,
        uint256   _addForSale,
        uint256   _oldCumForSale,
        bytes32[] calldata _forSaleProof
    )
      external
      update(
          _addForSale,
          _oldCumForSale,
          _forSaleProof
      )
      onlyShield
    {
        emit RedeemRequest(
            msg.sender,
            _user,
            _rcaAmount,
            block.timestamp
        );
    }

    /**
     * @notice Updates contract, emits event for redeem action.
     * @param _user User that is redeeming tokens.
     * @param _rcaAmount The amount of RCAs they're redeeming.
     */
    function redeemFinalize(
        address   _to,
        address   _user,
        uint256   _rcaAmount,
        uint256   _addForSale,
        uint256   _oldCumForSale,
        bytes32[] calldata _forSaleProof
    )
      external
      update(
          _addForSale,
          _oldCumForSale,
          _forSaleProof
      )
      onlyShield
      returns(
          bool zapper
      )
    {
        emit RedeemFinalize(
            msg.sender, 
            _user,
            _to,
            _rcaAmount,
            block.timestamp
        );

        return zappers[_to];
    }

    /**
     * @notice Updates contract, emits event for purchase action, verifies price.
     */
    function purchase(
        address   _user,
        uint256   _ethPrice,
        bytes32[] calldata _priceProof,
        uint256   _addForSale,
        uint256   _oldCumForSale,
        bytes32[] calldata _forSaleProof
    )
      external
      update(
          _addForSale,
          _oldCumForSale,
          _forSaleProof
      )
      onlyShield
    {
        verifyPrice(
            msg.sender,
            _ethPrice,
            _priceProof
        );

        emit Purchase(
            msg.sender, 
            _user,
            block.timestamp
        );
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////// internal //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice All general updating of shields for a variety of variables that could have changed
     * since the last interaction. Amount for sale, whether or not the system is paused, new
     * withdrawal delay, new discount for sales, new APR fee for general functionality.
     */
    function _update(
        uint256   _addForSale,
        uint256   _oldCumForSale,
        bytes32[] memory _forSaleProof
    )
      internal
    {
        IRcaShield shield = IRcaShield(msg.sender);
        uint32 lastUpdate = uint32(lastShieldUpdate[msg.sender]);

        // Seems kinda messy but not too bad on gas.
        SystemUpdates memory updates = systemUpdates;

        if (lastUpdate < updates.aprUpdate) shield.setApr(apr);
        if (lastUpdate < updates.treasuryUpdate) shield.setTreasury(treasury);
        if (lastUpdate < updates.discountUpdate) shield.setDiscount(discount);
        if (lastUpdate < updates.pausedUpdate) shield.setPercentPaused(percentPaused);
        if (lastUpdate < updates.withdrawalDelayUpdate) shield.setWithdrawalDelay(withdrawalDelay);
        if (lastUpdate < updates.forSaleUpdate) shield.setForSale(
                                                            getForSale(
                                                                msg.sender,
                                                                _addForSale,
                                                                _oldCumForSale,
                                                                _forSaleProof
                                                            )
                                                        );
        lastShieldUpdate[msg.sender] = uint32(block.timestamp);
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////// view ////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Get amount for sale.
     * @param _shield        Address of shield to get for sale for.
     * @param _addForSale    Additional amount for sale (in Merkle).
     * @param _oldCumForSale Old cumulative amount for sale.
     * @param _forSaleProof  Merkle proof for data.
     */
    function getForSale(
        address   _shield,
        uint256   _addForSale,
        uint256   _oldCumForSale,
        bytes32[] memory _forSaleProof
    )
      public
      view
    returns (uint256)
    {
        verifyForSale(
            _shield,
            _addForSale,
            _oldCumForSale,
            _forSaleProof
        );

        uint256 newAddForSale = _addForSale + _oldCumForSale;
        return newAddForSale;
    }

    /**
     * @notice Verify the current amount for sale.
     * @param _addForSale    Additional amount for sale.
     * @param _oldCumForSale Old cumulative amount for liquidation.
     * @param _forSaleProof  Proof of the for sale amounts.
     */
    function verifyForSale(
        address   _shield,
        uint256   _addForSale,
        uint256   _oldCumForSale,
        bytes32[] memory _forSaleProof
    )
      public
      view
    {
        bytes32 leaf = keccak256(abi.encodePacked(_shield, _addForSale, _oldCumForSale));
        require(MerkleProof.verify(_forSaleProof, forSaleRoot, leaf), "Incorrect forSale proof.");
    }

    /**
     * @notice Verify price from Ease price oracle.
     * @param _shield Address of the shield to find price of.
     * @param _value Price of the token (in Ether) for this shield.
     * @param _proof Merkle proof.
     */
    function verifyPrice(
        address   _shield,
        uint256   _value,
        bytes32[] memory _proof
    )
      public
      view
    {
        bytes32 leaf = keccak256(abi.encodePacked(_shield, _value));
        // This doesn't protect against oracle hacks, but does protect against some bugs.
        require(_value > 0, "Invalid price submitted.");
        require(MerkleProof.verify(_proof, priceRoot, leaf), "Incorrect price proof.");
    }

    /**
     * @notice Verify capacity of a shield.
     */
    function verifyCapacity(
        address   _shield,
        uint256   _capacity,
        bytes32[] memory _proof
    )
      public
      view
    {
        bytes32 leaf = keccak256(abi.encodePacked(_shield, _capacity));
        require(MerkleProof.verify(_proof, capacitiesRoot, leaf), "Incorrect capacity proof.");
    }

    /**
     * @notice Makes it easier for frontend to get the balances on many shields.
     * @param _user User to find balances of.
     * @param _shields The shields (also tokens) to find the RCA balances for.
     */
    function balanceOfs(
        address   _user,
        address[] calldata _shields
    )
      external
      view
    returns(
        uint256[] memory balances
    )
    {
        balances = new uint256[](_shields.length);

        for (uint256 i = 0; i < _shields.length; i++) {
            uint256 balance = IERC20(_shields[i]).balanceOf(_user);
            balances[i] = balance;
        }
    }

    /**
     * @notice Create merkle leaf with our data. Temporarily using this for testing.
     */
    function createLeaf(
        address _shield,
        uint256 _capacity
    )
      external
      pure
    returns(bytes32)
    {
        return keccak256(abi.encodePacked(_shield, _capacity));
    }

    /**
     * @notice Create merkle leaf with our data. Temporarily using this for testing.
     */
    function createForSale(
        address _shield,
        uint256 _addForSale,
        uint256 _oldCumForSale
    )
      external
      pure
    returns(bytes32)
    {
        return keccak256(abi.encodePacked(_shield, _addForSale, _oldCumForSale));
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////// onlyGov //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Initialize a new arShield from an already-created family.
     */
    function initializeShield(
        address   _shield,
        uint128[] calldata _protocols,
        uint128[] calldata _percents
    )
      external
      onlyGov
    { 
        require(_protocols.length == _percents.length, "Array lengths do not match.");

        IRcaShield(_shield).initialize(
            apr,
            discount,
            treasury,
            withdrawalDelay
        );
        
        shieldMapping[_shield] = true;

        // Annoying stuff below because we can't push a struct to the mapping.
        for (uint256 i = 0; i < _protocols.length; i++) {
            shieldProtocolPercents[_shield].push();
            shieldProtocolPercents[_shield][i].protocolId = _protocols[i];
            shieldProtocolPercents[_shield][i].percent    = _percents[i];
        }
    }

    /**
     * @notice Governance calls to set the new total amount for sale. This call also resets percentPaused
     * because it implicitly signals the end of the pause period and beginning of selling period.
     * @dev Root will be determined by hashing current amount for sale and current cumulative amount
     * that has been put as for sale through this means in the past. This ensures that if the vault is
     * updated after this new root has been created, the new cumulative amount can be accounted for.
     * @param _newForSaleRoot Merkle root for new total amounts for sale for each protocol (in token).
     */
    function setForSale(
        bytes32 _newForSaleRoot
    )
      external
      onlyGov
    {
        // In some cases governance may just want to reset percent paused.
        percentPaused              = 0;
        systemUpdates.pausedUpdate = uint32(block.timestamp);

        if ( _newForSaleRoot != bytes32(0) ) {
            forSaleRoot                 = _newForSaleRoot;
            systemUpdates.forSaleUpdate = uint32(block.timestamp);
        }
    }

    /**
     * @notice Governance can reset withdrawal delay for amount of time it takes to withdraw from vaults.
     * Not a commonly used function, if at all really.
     * @param _newWithdrawalDelay New delay (in seconds) for withdrawals.
     */
    function setWithdrawalDelay(
        uint256 _newWithdrawalDelay
    )
      external
      onlyGov
    {
        withdrawalDelay                     = _newWithdrawalDelay;
        systemUpdates.withdrawalDelayUpdate = uint32(block.timestamp);
    }

    /**
     * @notice Governance can change the amount of discount for purchasing tokens that are being liquidated.
     * @param _newDiscount New discount for purchase in tenths of a percent (1000 == 10%).
     */
    function setDiscount(
        uint256 _newDiscount
    )
      external
      onlyGov
    {
        discount                     = _newDiscount;
        systemUpdates.discountUpdate = uint32(block.timestamp);
    }

    /**
     * @notice Governance can set the fees taken per year from a vault. Starts at 0, can update at any time.
     * @param _newApr New fees per year for being in the RCA system (1000 == 10%).
     */
    function setApr(
        uint256 _newApr
    )
      external
      onlyGov
    {
        apr                     = _newApr;
        systemUpdates.aprUpdate = uint32(block.timestamp);
    }

    /**
     * @notice Governance can set address of the new treasury contract that accepts funds.
     * @param _newTreasury New fees per year for being in the RCA system (1000 == 10%).
     */
    function setTreasury(
        address payable _newTreasury
    )
      external
      onlyGov
    {
        treasury                     = _newTreasury;
        systemUpdates.treasuryUpdate = uint32(block.timestamp);
    }

    /**
     * @notice Governance can add a new zapper allowed to exchange funds for users.
     * @param _newZapper Address of the zapper contract.
     */
    function setZapper(
        address _newZapper
    )
      external
      onlyGov
    {
        zappers[_newZapper] = true;
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////// onlyGuardian ///////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Admin can set the percent paused. This pauses this percent of tokens from every single shield
     * while the DAO analyzes losses. This percent will be the maximum loss possible. If a withdrawal occurs 
     * from any shield during this time, they will lose this percent of tokens.
     * @param _newPercentPaused Percent of shields to temporarily pause. 1000 == 10%.
     */
    function setPercentPaused(
        uint256 _newPercentPaused
    )
      external
      onlyGuardian
    {
        percentPaused = _newPercentPaused;
        systemUpdates.pausedUpdate = uint32(block.timestamp);
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////// onlyCapOracle ///////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Capacity oracle calls to set new capacities available for each protocol.
     * Capacity oracle is fairly centralized because we see little enough risk (only temporary DoS).
     * @param _newCapacitiesRoot Merkle root for new capacities available for each protocol (in USD).
     */
    function setCapacities(
        bytes32 _newCapacitiesRoot
    )
      external
      onlyCapOracle
    {
        capacitiesRoot = _newCapacitiesRoot;
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////// onlyPriceOracle //////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Set prices of all tokens with our oracle. This will be expanded so that price oracle is a
     * smart contract that accepts input from a few sources to increase decentralization.
     * @param _newPriceRoot Merkle root for new capacities available for each protocol (in USD).
     */
    function setPrices(
        bytes32 _newPriceRoot
    )
      external
      onlyPriceOracle
    {
        priceRoot = _newPriceRoot;
    }

}