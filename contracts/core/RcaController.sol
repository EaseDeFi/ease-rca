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
    mapping (address => ProtocolPercent[]) public shieldProtocolPercents;
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
    uint256 public percentReserved;
    /// @notice Address that funds from selling tokens is sent to.
    address payable public treasury;
    /// @notice Amount of funds for sale on a protocol, sent in by DAO after a hack occurs (in token).
    bytes32 public liqForClaimsRoot;
    /// @notice Merkle root of the amount of capacity available for each protocol (in USD).
    bytes32 public capacitiesRoot;
    /// @notice Root of all underlying token prices--only used if the protocol is doing pricing.
    bytes32 public priceRoot;

    /// @notice Last time each individual shield was checked for update.
    mapping (address => uint256) public lastShieldUpdate;
    /**
     * @dev The update variable flow works in an interesting way to optimize efficiency:
     * Each time a user interacts with a specific shield vault, it calls Controller
     * for all necessary interactions (events, updates, etc.). The general Controller function
     * will check when when the last shield update was made vs. all recent other updates.
     * If a system update is more recent than the shield update, value is changed.
     */
    struct SystemUpdates {
        uint32 liqUpdate;
        uint32 reservedUpdate;
        uint32 withdrawalDelayUpdate;
        uint32 discountUpdate;
        uint32 aprUpdate;
        uint32 treasuryUpdate;
    }
    SystemUpdates public systemUpdates;

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
     * @param _newCumLiqForClaims Old cumulative amount of funds for sale. Needed to ensure additional is accurate.
     * @param _liqForClaimsProof Merkle proof for the for sale amount.
     */
    modifier update(
        uint256   _newCumLiqForClaims,
        bytes32[] memory _liqForClaimsProof
    )
    {
        _update(_newCumLiqForClaims, _liqForClaimsProof);
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
     * @param _apr Initial fees for the shield (1000 == 10%).
     * @param _discount Discount for purchasers of the token (1000 == 10%).
     * @param _withdrawalDelay Amount of time (in seconds) users must wait before withdrawing.
     * @param _treasury Address of the treasury that Ether funds will be sent to.
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
     * @param _user User that is minting tokens.
     * @param _uAmount Underlying token amount being liquidated.
     * @param _capacity Current extra capacity allowed on this shield (in underlying tokens).
     * @param _capacityProof Merkle proof to verify the capacity above.
     * @param _newCumLiqForClaims New cumulative amount of liquidated tokens if an update is needed.
     * @param _liqForClaimsProof Merkle proof to verify the new cumulative liquidated if needed.
     */
    function mint(
        address   _user,
        uint256   _uAmount,
        uint256   _capacity,
        bytes32[] calldata _capacityProof,
        uint256   _newCumLiqForClaims,
        bytes32[] calldata _liqForClaimsProof
    )
      external
      update(
          _newCumLiqForClaims,
          _liqForClaimsProof
      )
      onlyShield
    {
        /** 
         * @dev Capacity isn't really bulletproof here because shields don't keep track on-chain, so 
         * between updates people can technically overload the shield if a lot of transactions suddenly 
         * happen. We don't keep track on-chain because we'll be on multiple chains without 
         * cross-communication. We've decided there's not enough risk to keep capacities fully on-chain.
         */ 
        verifyCapacity(msg.sender, _capacity, _capacityProof);
        require(_uAmount < _capacity, "Not enough capacity available.");
        
        emit Mint(msg.sender, _user, block.timestamp);
    }

    /**
     * @notice Updates contract, emits event for redeem action.
     * @param _user User that is redeeming tokens.
     * @param _rcaAmount The amount of RCAs they're redeeming.
     * @param _newCumLiqForClaims New cumulative amount of liquidated tokens if an update is needed.
     * @param _liqForClaimsProof Merkle proof to verify the new cumulative liquidated if needed.
     */
    function redeemRequest(
        address   _user,
        uint256   _rcaAmount,
        uint256   _newCumLiqForClaims,
        bytes32[] calldata _liqForClaimsProof
    )
      external
      update(
          _newCumLiqForClaims,
          _liqForClaimsProof
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
     * @param _to The address that the redeem is being made to.
     * @param _user User that is redeeming tokens.
     * @param _rcaAmount The amount of RCAs they're redeeming.
     * @param _newCumLiqForClaims New cumulative amount of liquidated tokens if an update is needed.
     * @param _liqForClaimsProof Merkle proof to verify the new cumulative liquidated if needed.
     */
    function redeemFinalize(
        address   _to,
        address   _user,
        uint256   _rcaAmount,
        uint256   _newCumLiqForClaims,
        bytes32[] calldata _liqForClaimsProof
    )
      external
      update(
          _newCumLiqForClaims,
          _liqForClaimsProof
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

        zapper = zappers[_to];
    }

    /**
     * @notice Updates contract, emits event for purchase action, verifies price.
     * @param _user The user that is making the purchase.
     * @param _ethPrice The price of one token in Ether.
     * @param _priceProof Merkle proof to verify the Ether price of the token.
     * @param _newCumLiqForClaims New cumulative amount of liquidated tokens if an update is needed.
     * @param _liqForClaimsProof Merkle proof to verify the new cumulative liquidated if needed.
     */
    function purchase(
        address   _user,
        uint256   _ethPrice,
        bytes32[] calldata _priceProof,
        uint256   _newCumLiqForClaims,
        bytes32[] calldata _liqForClaimsProof
    )
      external
      update(
          _newCumLiqForClaims,
          _liqForClaimsProof
      )
      onlyShield
    {
        verifyPrice(msg.sender, _ethPrice, _priceProof);

        emit Purchase(msg.sender, _user, block.timestamp);
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////// internal //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice All general updating of shields for a variety of variables that could have changed
     * since the last interaction. Amount for sale, whether or not the system is paused, new
     * withdrawal delay, new discount for sales, new APR fee for general functionality.
     * @param _newCumLiqForClaims New cumulative amount of liquidated tokens if an update is needed.
     * @param _liqForClaimsProof Merkle proof to verify the new cumulative liquidated if needed.
     */
    function _update(
        uint256   _newCumLiqForClaims,
        bytes32[] memory _liqForClaimsProof
    )
      internal
    {
        IRcaShield shield = IRcaShield(msg.sender);
        uint32 lastUpdate = uint32(lastShieldUpdate[msg.sender]);

        // Seems kinda messy but not too bad on gas.
        SystemUpdates memory updates = systemUpdates;

        // Update shield here to account for interim period where variables were changed but shield had not updated.
        if (lastUpdate < updates.liqUpdate || lastUpdate < updates.reservedUpdate || lastUpdate < updates.aprUpdate) {
            verifyLiq(msg.sender, _newCumLiqForClaims, _liqForClaimsProof);
            shield.controllerUpdate(_newCumLiqForClaims, uint256(updates.liqUpdate),
                                    percentReserved, uint256(updates.reservedUpdate),
                                    apr, uint256(updates.aprUpdate));
        }

        if (lastUpdate < updates.treasuryUpdate)        shield.setTreasury(treasury);
        if (lastUpdate < updates.discountUpdate)        shield.setDiscount(discount);
        if (lastUpdate < updates.withdrawalDelayUpdate) shield.setWithdrawalDelay(withdrawalDelay);
        if (lastUpdate < updates.reservedUpdate)        shield.setPercentReserved(percentReserved);
        if (lastUpdate < updates.aprUpdate)             shield.setApr(apr);
        if (lastUpdate < updates.liqUpdate) {
            verifyLiq(msg.sender, _newCumLiqForClaims, _liqForClaimsProof);
            shield.setLiqForClaims(_newCumLiqForClaims);
        }

        lastShieldUpdate[msg.sender] = uint32(block.timestamp);
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////// view ////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Verify the current amount for liquidation.
     * @param _shield Address of the shield to verify.
     * @param _newCumLiqForClaims New cumulative amount liquidated.
     * @param _liqForClaimsProof Proof of the for sale amounts.
     */
    function verifyLiq(
        address   _shield,
        uint256   _newCumLiqForClaims,
        bytes32[] memory _liqForClaimsProof
    )
      public
      view
    {
        bytes32 leaf = keccak256(abi.encodePacked(_shield, _newCumLiqForClaims));
        require(MerkleProof.verify(_liqForClaimsProof, liqForClaimsRoot, leaf), "Incorrect liq proof.");
    }

    /**
     * @notice Verify price from Ease price oracle.
     * @param _shield Address of the shield to find price of.
     * @param _value Price of the underlying token (in Ether) for this shield.
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
     * @notice Verify capacity of a shield (in underlying tokens).
     * @param _shield Address of the shield to verify capacity of.
     * @param _capacity Amount of capacity the shield has left.
     * @param _proof The Merkle proof verifying the capacity.
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
     * @param _tokens The shields (also tokens) to find the RCA balances for.
     */
    function balanceOfs(
        address   _user,
        address[] calldata _tokens
    )
      external
      view
    returns(
        uint256[] memory balances
    )
    {
        balances = new uint256[](_tokens.length);

        for (uint256 i = 0; i < _tokens.length; i++) {
            uint256 balance = IERC20(_tokens[i]).balanceOf(_user);
            balances[i] = balance;
        }
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////// onlyGov //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Initialize a new arShield from an already-created family.
     * @param _shield Address of the shield to initialize.
     * @param _protocols IDs of the protocols the shield is exposed to.
     * @param _percents Percent (in hundredths, 1000 == 10%) of funds that are exposed to each protocol.
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
        
        shieldMapping[_shield]    = true;
        lastShieldUpdate[_shield] = block.timestamp;

        // Annoying stuff below because we can't push a struct to the mapping.
        for (uint256 i = 0; i < _protocols.length; i++) {
            shieldProtocolPercents[_shield].push();
            shieldProtocolPercents[_shield][i].protocolId = _protocols[i];
            shieldProtocolPercents[_shield][i].percent    = _percents[i];
        }

        emit ShieldCreated(
            _shield,
            address( IRcaShield(_shield).uToken() ),
            IRcaShield(_shield).name(),
            IRcaShield(_shield).symbol(),
            block.timestamp
        );
    }

    /**
     * @notice Governance calls to set the new total amount for sale. This call also resets percentReserved
     * because it implicitly signals the end of the pause period and beginning of selling period.
     * @dev Root will be determined by hashing current amount for sale and current cumulative amount
     * that has been put as for sale through this means in the past. This ensures that if the vault is
     * updated after this new root has been created, the new cumulative amount can be accounted for.
     * @param _newLiqRoot Merkle root for new total amounts for sale for each protocol (in token).
     */
    function setLiqTotal(
        bytes32 _newLiqRoot
    )
      external
      onlyGov
    {
        // In some cases governance may just want to reset percent paused.
        percentReserved              = 0;
        systemUpdates.reservedUpdate = uint32(block.timestamp);

        if ( _newLiqRoot != bytes32(0) ) {
            liqForClaimsRoot                     = _newLiqRoot;
            systemUpdates.liqUpdate = uint32(block.timestamp);
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
    function setPercentReserved(
        uint256 _newPercentPaused
    )
      external
      onlyGuardian
    {
        percentReserved = _newPercentPaused;
        systemUpdates.reservedUpdate = uint32(block.timestamp);
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