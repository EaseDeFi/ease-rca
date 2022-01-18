pragma solidity 0.8.10;
import '../general/RcaGovernable.sol';
import '../libraries/MerkleProof.sol';

/**
 * @notice Controller contract for all RCA vaults. Keeps track of them, accepts 
 * @author Robert M.C. Forster
 */



contract RcaController is RcaGovernable {

    // Address => whether or not it's a verified shield.
    mapping (address => bool) shieldMapping;
    // Shield address => underlying token oracle key.
    mapping (address => bytes32) underlyingKeys;
    // Percents of coverage for each protocol of a specific shield, 1000 == 10%.
    /**
     * @dev For a Yearn vault with a Curve token with DAI, USDC, USDT:
     * Yearn|100%, Curve|100%, DAI|33%, USDC|33%, USDT|33%
     * Just used by frontend at the moment.
     */
    mapping (address => uint256[]) shieldProtocolPercents;
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
    // Last time each individual shield was checked for update.
    mapping (address => uint256) lastShieldUpdate;

    // Fees for users per year for using the system. Ideally just 0 but option is here. In hundredths of %. 1000 == 10%.
    uint256 public apr;
    // Amount of time users must wait to withdraw tokens after requesting redemption. In seconds.
    uint256 public withdrawalDelay;
    // The amount of each contract that's currently paused. Only non-zero after multisig
    // declares a hack occurred and before DAO confirms for sale amounts. 1000 == 10%.
    uint256 public percentPaused;
    // Address that funds from selling tokens is sent to.
    address public treasury;
    // Amount of funds for sale on a protocol, sent in by DAO after a hack occurs (in token).
    // Set as new full amount for sale.
    bytes32 public forSaleRoot;
    // Merkle root of the amount of capacity available for each protocol (in USD).
    bytes32 public capacitiesRoot;
    // Root of all underlying token prices--only used if the protocol is doing pricing.
    bytes32 public priceRoot;

    /**
     * @dev Events are used to notify the frontend of events on shields. If we have 1,000 shields,
     * a centralized event system can tell the frontend which shields to check for a specific user.
     */
    event Mint(address indexed rcaToken, address indexed user, uint256 timestamp);
    event Redeem(address indexed rcaToken, address indexed user, uint256 timestamp);
    event RcaPurchase(address indexed rcaToken, uint256 amount, uint256 timestamp);
    event UnderlyingPurchase(address indexed rcaToken, uint256 amount, uint256 timestamp);
    event ShieldCreated(address indexed rcaShield, address indexed underlyingToken, string name, string symbol, uint256 timestamp);

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////// modifiers //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Update is used before each onlyShield function to ensure the shield is up-to-date before actions.
     */
    modifier update(
        uint256 _addForSale,
        uint256 _oldCumForLiq,
        bytes32[] _forSaleProof
    )
    {
        _update(_forSaleProof);
        _;
    }
    
    modifier onlyShield()
    {
        require(shieldMapping[msg.sender], "Caller must be a Shield Vault.");
        _;
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////// onlyShield /////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Updates contract, emits event for minting, checks capacity.
     */
    function mint(
        address   _user,
        uint256   _capacity,
        uint256   _addForSale,
        uint256   _oldCumForLiq,
        bytes32[] _capacityProof,
        bytes32[] _forSaleProof
    )
      external
      update(
          _addForSale,
          _oldCumForLiq,
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
        bytes32 leaf = bytes32(abi.encodePacked(msg.sender, _capacity);
        uint256 availableCapacity = verifyCapacity(_capacityProof, leaf);
        require(_uAmount < availableCapacity, "Not enough capacity available.");
        emit Mint(msg.sender, _user, block.timestamp);
    }

    /**
     * @notice Updates contract, emits event for redeem action.
     * @param _user User that is redeeming tokens.
     * @param _rcaAmount The amount of RCAs they're redeeming.
     */
    function redeem(
        address   _user,
        uint256   _rcaAmount,
        uint256   _addForSale,
        uint256   _oldCumForLiq,
        bytes32[] _forSaleProof
    )
      external
      update(
          _addForSale,
          _oldCumForLiq,
          _forSaleProof
      )
      onlyShield
    {
        emit Redeem(msg.sender, _user, block.timestamp);
    }

    /**
     * @notice Updates contract, emits event for purchase action, verifies price.
     */
    function purchase(
        address        _user,
        uint256        _uAmount,
        bytes calldata _value,
        bytes32[]      _priceProof,
        uint256        _addForSale,
        uint256        _oldCumForLiq,
        bytes32[]      _forSaleProof
    )
      external
      update(
          _addForSale,
          _oldCumForLiq,
          _forSaleProof
      )
      onlyShield
    {
        verifyPrice(
            msg.sender,
            _value,
            _priceProof
        )

        emit Purchase(msg.sender, _user, block.timestamp);
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
        uint256   _oldCumForLiq,
        bytes32[] _forSaleProof
    )
      internal
    {
        bytes32 leaf          = abi.encodePacked(bytes32(msg.sender),;
        IShield memory shield = IShield(msg.sender);
        uint32 lastUpdate     = lastShieldUpdate[msg.sender];

        // Seems kinda messy but not too bad on gas.
        SystemUpdates memory updates = systemUpdates;
        if (lastUpdate < updates.treasuryUpdate) shield.setTreasury(treasury);
        if (lastUpdate < updates.pausedUpdate) shield.setPausedPercent(percentPaused);
        if (lastUpdate < updates.withdrawalDelayUpdate) shield.setWithdrawalDelay(withdrawalDelay);
        if (lastUpdate < updates.discountUpdate) shield.setDiscount(discount);
        if (lastUpdate < updates.aprUpdate) shield.setApr(apr);
        if (lastUpdate < updates.forSaleUpdate) {
            verifyForSale(
                _addForSale,
                _oldCumForLiq,
                _forSaleProof
            );
            uint256 newAddForSale = _addForSale
                                   + _oldCumForLiq
                                   - shield.cumForLiq;
            shield.addForSale(newAddForSale);
        }
        lastShieldUpdate[msg.sender] = uint32(block.timestamp);
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////// view ////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Verify price on Umbrella of the tokens. Verifies in token:eth.
     * @param _value is this needed like this
     */
    function verifyPrice(
        address _shield,
        bytes memory _value,
        bytes32[] _proof,
    )
      public
      view
    returns(
        bool
    )
    {
        // While we're using Umbrella we won't have our own price oracle.
        if (priceOracle == address(0)) {
            IChain chain          = _chain();
            uint256 lastBlockId   = uint256(chain.getLatestBlockId());
            bytes32 underlyingKey = underlyingKeys[_shield];

            bool success = chain.verifyProofForBlock(
                lastBlockId,
                _proof,
                abi.encodePacked(underlyingKey),
                _value
            );
            require(success, "Incorrect price proof."; 
        } else {
            _verifyPrice(
                _shield,
                _value,
                _proof
            )
        }

    }

    function _verifyPrice(
        address _shield,
        uint256 _value,
        bytes32[] _proof
    )
      internal
      view
    {
        bytes32 leaf = abi.encodePacked(_shield, _value);
        require(MerkleProof.verify(priceRoot, _proof, leaf), "Incorrect price proof.");
    }

    // capacity available function
    function verifyCapacity(
        address   _shield,
        uint256   _capacity,
        bytes32[] _proof
    )
      public
      view
    returns(
        bool
    )
    {
        bytes32 leaf = abi.encodePacked(_shield, _capacity);
        require(MerkleProof.verify(capacitiesRoot, _proof, leaf), "Incorrect capacity proof.");
    }

    /**
     * @notice Get the current amount for sale for a certain shield.
     * @param _shieldAddress Address of the shield vault to get for sale for. Used as key for root.
     */
    function verifyForSale(
        uint256 _addForSale,
        uint256 _oldCumForLiq,
        bytes32[] _forSaleProof,
    )
      public
      view
    returns(
        bool
    )
    {
        bytes32 leaf = bytes32(abi.encodePacked(_addForSale, _oldCumForLiq));
        require(MerkleProof.verify(forSaleRoot, _proof, _leaf), "Incorrect forSale proof.");
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////// onlyGov //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Create a new arShield from an already-created family.
     * @param _name Name of the armorToken to be created.
     * @param _symbol Symbol of the armorToken to be created.
     * @param _oracleKey Key of the underlying token from Umbrella.
     * @param _masterCopy Mastercopy for the arShield proxy.
     */
    function createShield(
        string calldata _name,
        string calldata _symbol,
        address _masterCopy,
        uint256[] _percents
    )
      external
      onlyGov
    {
        address shield = address( new OwnedProxy(_masterCopy) );
        
        IRCA(shield).initialize(
            _name,
            _symbol,
            _oracleKey
        );
        
        shieldMapping[proxy]          = true;
        underlyingKeys[proxy]         = _oracleKey;
        shieldProtocolPercents[proxy] = _percents;

        OwnedUpgradeabilityProxy( payable(proxy) ).transferProxyOwnership(msg.sender);
    }

    /**
     * @notice Governance calls to set the new total amount for sale. This call also resets percentPaused
     * because it implicitly signals the end of the pause period and beginning of selling period.
     * @dev Values are the new total amount for sale | current (at time of making root) amount for sale.
     * Calculations will then be done by adding current (at time of update) amount for sale
     * to total amount for sale, then subtracting the old (at time of making root) for sale.
     * Kinda janky situation because we want the root to be new total amount rather than addition,
     * but want to be able to account for fees being added to for sale between root creation and update.
     * TODO: ^^^^^^^ NOT RIGHT
     * @param _newForSaleRoot Merkle root for new total amounts for sale for each protocol (in token).
     */
    function setForSale(
        bytes32 _newForSaleRoot
    )
      external
      onlyGov
    {
        // In some cases governance may just want to reset percent paused.
        percentPaused = 0;
        systemUpdates.pausedUpdate = uint32(block.timestamp);

        if ( _newForSaleRoot != bytes32(0) ) {
            forSaleRoot = _newForSaleRoot;
            systemUpdates.forSaleUpdate = uint32(block.timestamp);
        }
    }

    /**
     * @notice Governance calls to set the new total amount claimable for each individual address.
     * @param _newClaimsRoot Merkle root for new total amounts claimable for every address (in Ether).
     */
    function setClaims(
        bytes32 _newClaimsRoot
    )
      external
      onlyGov
    {
        claimsRoot = _newClaimsRoot;
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
        withdrawalDelay = _newWithdrawalDelay;
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
        discount = _newDiscount;
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
        apr = _newApr;
        systemUpdates.aprUpdate = uint32(block.timestamp);
    }

    /**
     * @notice Governance can set address of the new treasury contract that accepts funds.
     * @param _newTreasury New fees per year for being in the RCA system (1000 == 10%).
     */
    function setTreasury(
        uint256 _newTreasury
    )
      external
      onlyGov
    {
        treasury = _newTreasury;
        systemUpdates.treasuryUpdate = uint32(block.timestamp);
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////// onlyAdmin /////////////////////////////////////////////////
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
      onlyAdmin
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
      onlyCapOracle
    {
        capacitiesRoot = _newCapacitiesRoot;
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////// onlyPriceOracle //////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Only to be used if we take over price oracle functionality.
     * @param _newPriceRoot Merkle root for new capacities available for each protocol (in USD).
     */
    function setPrice(
        bytes32 _newPriceRoot
    )
      onlyPriceOracle
    {
        priceRoot = _newPriceRoot;
    }

}