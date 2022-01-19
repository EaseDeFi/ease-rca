pragma solidity 0.8.10;

/**
 * @title RCA Vault
 * @notice Main contract for reciprocally-covered assets. Mints, redeems, and sells.
 * Each underlying token (not protocol) has its own RCA vault. This contract
 * doubles as the vault and the RCA token.
 * @author Robert M.C. Forster
**/
contract RcaVault is ERC20, Governable {

    uint256 constant DENOMINATOR = 10000;

    /// @notice Controller of RCA contract that takes care of actions.
    IController public controller;
    /// @notice Treasury for all funds that accepts payments.
    address public treasury;
    /// @notice Current sale discount to sell tokens cheaper.
    uint256 public discount;
    /// @notice Percent to pay per year. 1000 == 10%.
    uint256 public apr;

    /** 
     * @notice Cumulative total amount that has been for sale lol.
     * @dev Used to make sure we don't run into a situation where forSale amount isn't updated,
     * a new hack occurs and current forSale is added to, then forSale is updated while
     * DAO votes on the new forSale. In this case we can subtract that interim addition.
     */
    uint256 public cumForSale;
    /// @notice Amount of tokens currently up for sale.
    uint256 public amtForSale;

    /** 
     * @notice Amount of RCA tokens pending withdrawal. 
     * @dev When doing value calculations this is required
     * because RCAs are burned immediately upon request, but underlying tokens only leave the
     * contract once the withdrawal is finalized.
     */
    uint256 public pendingWithdrawal;
    /// @notice withdrawal variable for withdrawal delays.
    uint256 public withdrawalDelay;
    /// @notice Requests by users for withdrawals.
    mapping (address => WithdrawRequest) public withdrawRequests;

    /** 
     * @notice Last time the contract has been updated.
     * @dev Used to calculate APR if fees are implemented.
     */
    uint256 lastUpdate;

    struct WithdrawRequest {
        uint112 uAmount;
        uint112 rcaAmount;
        uint32  endTime;
    }

    /// @notice Notification of the mint of new tokens.
    event Mint(
        address indexed sender,
        address indexed to, 
        uint256 uAmount, 
        uint256 rcaAmount, 
        uint256 timestamp
    );
    /// @notice Notification of an initial redeem request.
    event RedeemRequest(
        address indexed to, 
        uint256 uAmount, 
        uint256 rcaAmount, 
        uint256 endTime, 
        uint256 timestamp
    );
    /// @notice Notification of a redeem finalization after withdrawal delay.
    event RedeemComplete(
        address indexed sender,
        address indexed to, 
        uint256 uAmount, 
        uint256 rcaAmount, 
        uint256 timestamp
    );
    /// @notice Notification of a purchase of the underlying token.
    event PurchaseU(
        address indexed to, 
        uint256 uAmount,
        uint256 ethAmount, 
        uint256 price, 
        uint256 timestamp
    );
    /// @notice Notification of a purchase of an RCA token.
    event PurchaseRca(
        address indexed to,
        uint256 uAmount,
        uint256 rcaAmount, 
        uint256 ethAmount, 
        uint256 price, 
        uint256 timestamp
    );

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////// modifiers //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Update for general protocol fees if they are set.
     */
    modifier update()
    {
        if (apr > 0) {
            uint256 secsElapsed = block.timestamp - lastUpdate;
            uint256 balance = uToken.balanceOf( address(this) );
            amtForSale += 
                balance
                * secsElapsed 
                * apr 
                / 1 years 
                / DENOMINATOR;
            lastUpdate = block.timestamp;
        }
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////// initialize /////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Initialize the shield upon creation.
     * @param _name Name of the ERC20 token that will be created.
     * @param _symbol Symbol of the token.
     * @param _apr Cost of normal RCA system fees.
     * @param _discount Discount that will be given to purchases.
     * @param _withdrawalDelay Delay (in seconds) of withdrawals.
     * @param _treasury Treasury to send Ether funds to.
     */
    function initialize(
        string _name,
        string _symbol,
        uint256 _apr,
        uint256 _discount,
        uint256 _withdrawalDelay,
        address _treasury
    )
      external
    {
        require(address(controller) == address(0), "Contract already initialized.");
        _initializeToken(_name, _symbol);
        apr             = _apr;
        discount        = _discount;
        controller      = msg.sender;
        withdrawalDelay = _withdrawalDelay;
        treasury        = _treasury;
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////// external //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Mint tokens to an address. Not automatically to msg.sender so we can more easily zap assets.
     * @param _uAmount Amount of underlying tokens desired to use for mint.
     * @param _user The user to mint tokens to.
     */
    function mintTo(
        address   _user,
        uint256   _uAmount,
        uint256   _capacity,
        bytes32[] _capacityProof,
        uint256   _addForSale,
        uint256   _oldCumForLiq,
        bytes32[] _forSaleProof
    )
      external
      update
    {
        address user = msg.sender;

        // Call controller to check capacity limits, add to capacity limits, emit events, check for new "for sale".
        controller.mint(
            _user,
            _uAmount,
            _capacity,
            _capacityProof,
            _addForSale,
            _oldCumForLiq,
            _forSaleProof
        );

        uint256 rcaAmount = rcaValue(_uAmount);

        uToken.safeTransferFrom(
            user, 
            address(this), 
            _uAmount
        );

        _mint(user, rcaAmount);

        emit Mint(
            msg.sender,
            user,
            _uAmount,
            rcaAmount,
            block.timestamp
        );
    }

    /**
     * @notice Request redemption of RCAs back to the underlying token.
     */
    function redeemRequest(
        uint256 _rcaAmount
        uint256 _addForSale,
        uint256 _oldCumForSale,
        bytes32[] _forSaleProof
    )
      external
      update
    {
        controller.redeem(
            _rcaAmount,
            _addForSale,
            _oldCumForSale,
            _forSaleProof
        )

        uint256 uAmount = _uValue(_rcaAmount);
        _burn(msg.sender, _rcaAmount);
        pending += _rcaAmount;

        WithdrawRequest memory curRequest = withdrawRequests[msg.sender];
        uint112 newUAmount                = uint112(uAmount) + curRequest.uAmount;
        uint112 newRcaAmount              = uint112(_rcaAmount) + curRequest.rcaAmount;
        uint32 endTime                    = uint32(block.timestamp) + uint32(withdrawalDelay);
        withdrawRequests[msg.sender]      = WithdrawRequest(newUAmount, newRcaAmount, endTime);

        emit RedeemRequest(
            msg.sender,
            uint256(uAmount),
            _rcaAmount,
            uint256(endTime),
            block.timestamp
        );
    }

    /**
     * @notice Used to exchange RCA tokens back to the underlying token. Will have a 2+ day delay upon withdrawal.
     * @param _rcaAmount The amount of RCA tokens to redeem.
     * @param _user The address to redeem tokens for. Since a previous request is required, there are no security implications.
     */
    function redeemTo(
        address   _to,
        address   _user,
        uint256   _addForSale,
        uint256   _oldCumForSale,
        bytes32[] _forSaleProof
    )
      external
      update
    {

        WithdrawRequest memory request = withdrawRequests[_user];
        delete withdrawRequests[_user];
        
        // endTime > 0 ensures request exists.
        require(request.endTime > 0 && uint32(block.timestamp) > request.endTime, "Withdrawal not yet allowed.");

        // This function doubles as redeeming and determining whether user is a zapper.
        bool zapper = 
            controller.redeem(
                _to,
                _user,
                _rcaAmount,
                _addForSale,
                _oldCumForSale,
                _forSaleProof
            );

        pending -= uint256(request.rcaAmount);

        uToken.safeTransferFrom( address(this), _user, uint256(request.uAmount) );

        // The cool part about doing it this way rather than having user RCAs to zapper contract,
        // then it exchanging and returning Ether is that it's more gas efficient and no approvals are needed.
        if (zapper) IZapper(_to).zapTo( _user, uint256(request.uAmount) );
        else if (_to != _user) revert("Redeeming to invalid address.");

        emit Redeem(
            msg.sender,
            _user,
            uint256(request.uAmount),
            uint256(request.rcaAmount),
            block.timestamp
        );
    }

    /**
     * @notice Purchase underlying tokens directly. This will be preferred by bots.
     * @param _user The user to purchase tokens for.
     * @param _uAmount Amount of underlying tokens to purchase.
     * @param _uEthPrice Price of the underlying token in Ether per token.
     * @param _priceProof Merkle proof for the price.
     * @param _addForSale Additional amount for sale.
     * @param _oldCumForSale Old cumulative amount for sale.
     * @param _forSaleProof Merkle proof for for sale amounts.
     */
    function purchaseU(
        address   _user,
        uint256   _uAmount,
        uint256   _uEthPrice,
        bytes32[] _priceProof,
        uint256   _addForSale,
        uint256   _oldCumForSale,
        bytes32[] _forSaleProof
    )
      external
      payable
      update
    {
        // If user submits incorrect price, tx will fail here.
        controller.purchase(
            _user,
            _uAmount,
            _uEthPrice,
            _priceProof,
            _addForSale,
            _oldCumForSale
        );

        uint256 price = _uEthPrice  - (_uEthPrice * discount / DENOMINATOR);
        uint256 ethAmount = price * _uAmount;
        require(msg.value == etherAmount, "Incorrect Ether sent.");

        // If amount is too big than for sale, tx will fail here.
        amtForSale -= _uAmount;

        uToken.transfer(_user, _uAmount);
        treasury.transfer(msg.value);
        
        emit PurchaseU(
            _user,
            _uAmount,
            ethAmount,
            _uEthPrice,
            block.timestamp
        );
    }

    /**
     * @notice purchaseRca allows a user to purchase the RCA directly with Ether through liquidation.
     * @param _user The user to make the purchase for.
     * @param _uAmount The amount of underlying tokens to purchase.
     * @param _uEthPrice The underlying token price in Ether per token.
     * @param _priceProof Merkle proof to verify this price.
     * @param _addForSale Additional amount for sale.
     * @param _oldCumForSale Old cumulative amount for sale.
     * @param _forSaleProof Merkle proof of the for sale amounts.
     */
    function purchaseRca(
        address   _user,
        uint256   _uAmount,
        uint256   _uEthPrice,
        bytes32[] _priceProof,
        uint256   _addForSale,
        uint256   _oldCumForSale,
        bytes32[] _forSaleProof
    )
      external
      update
    {
        // If user submits incorrect price, tx will fail here.
        controller.purchase(
            _user,
            _uAmount,
            _uEthPrice,
            _priceProof,
            _addForSale,
            _oldCumForLiq
        );

        uint256 price = _uEthPrice  - (_uEthPrice * discount / DENOMINATOR);
        uint256 ethAmount = price * _uAmount;
        require(msg.value == price * _uAmount, "Incorrect Ether sent.");
        
        // If amount is too big than for sale, tx will fail here.
        amtForSale       -= _uAmount;
        uint256 rcaAmount = _rcaValue(_uAmount);

        _mint(_user, rcaAmount);
        treasury.transfer(msg.value);

        emit Purchase(
            _user,
            _uAmount,
            rcaAmount,
            _uEthPrice,
            ethAmount,
            block.timestamp
        );
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////// view ////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Convert RCA value to underlying tokens. This is internal because new 
     * for sale amounts will already have been retrieved and updated.
     * @param _rcaAmount The amount of RCAs to find the underlying value of.
     */
    function _uValue(
        uint256 _rcaAmount
    )
      internal
      view
    returns(
        uint256 uAmount
    )
    {
        uint256 totalSupply = totalSupply();
        if (totalSupply == 0) return _rcaAmount;

        uAmount = 
            (uToken.balanceOf( address(this) ) - amtForSale)
            * _rcaAmount
            / (totalSupply + pendingWithdrawal);

        _percentPaused = percentPaused;
        if (_percentPaused > 0)
            uAmount -= 
            (uAmount 
            * _percentPaused 
            / DENOMINATOR);
    }

    /**
     * @notice Find the RCA value of an amount of underlying tokens.
     * @param _uAmount Amount of underlying tokens to find RCA value of.
     */
    function _rcaValue(
        uint256 _uAmount
    )
      internal
      view
    returns(
        uint256 rcaAmount
    )
    {
        uint256 balance = uToken.balanceOf( address(this) );
        if (balance == 0) return _uAmount;

        rcaAmount = 
            (totalSupply() + pendingWithdrawal)
            * _uAmount
            / (balance - amtForSale);
    }

    /**
     * @dev External version of RCA value is needed so that frontend can properly
     * calculate values in cases where the contract has not been recently updated.
     */
    function uValue(
        uint256   _rcaAmount,
        uint256   _addForSale,
        uint256   _oldCumForLiq,
        bytes32[] _forSaleProof
    )
      external
      view
    returns(
        uint256 uAmount
    )
    {
        controller.verifyForSale(
            _addForSale, 
            _oldCumForLiq,
            _forSaleProof
        );

        uAmount = _uValue(_rcaAmount);
    }

    /**
     * @dev External version of RCA value is needed so that frontend can properly
     * calculate values in cases where the contract has not been recently updated.
     */
    function rcaValue(
        uint256   _uAmount,
        uint256   _addForSale,
        uint256   _oldCumForLiq,
        bytes32[] _forSaleProof
    )
      external
      view
    returns(
        uint256 rcaAmount
    )
    {
        controller.verifyForSale(
            _addForSale, 
            _oldCumForLiq,
            _forSaleProof
        );

        rcaAmount = _rcaValue(_uAmount);
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////// onlyController //////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Change the treasury address to which funds will be sent.
     * @param _newTreasury New treasury address.
    **/
    function setForSale(
        uint256 _newAddForSale
    )
      external
      onlyController
    {
        amtForSale += _newAddForSale;
    }

    /**
     * @notice Change the treasury address to which funds will be sent.
     * @param _newTreasury New treasury address.
    **/
    function setTreasury(
        address _newTreasury
    )
      onlyController
    {
        treasury = _newTreasury;
    }

    /**
     * @notice Change the treasury address to which funds will be sent.
     * @param _newTreasury New treasury address.
    **/
    function setPausedPercent(
        uint256 _newPausedPercent
    )
      external
      onlyController
    {
        pausedPercent = _newPausedPercent;
    }

    /**
     * @notice Change the treasury address to which funds will be sent.
     * @param _newTreasury New treasury address.
    **/
    function setWithdrawalDelay(
        uint256 _newWithdrawalDelay
    )
      external
      onlyController
    {
        withdrawalDelay = _newWithdrawalDelay;
    }

    /**
     * @notice Change the treasury address to which funds will be sent.
     * @param _newTreasury New treasury address.
    **/
    function setDiscount(
        uint256 _newDiscount
    )
      external
      onlyController
    {
        discount = _newDiscount;
    }

    /**
     * @notice Change the treasury address to which funds will be sent.
     * @param _newApr New APR. 1000 == 
    **/
    function setApr(
        uint256 _newApr
    )
      external
      onlyController
    {
        if (lastUpdate == 0) lastUpdate = block.timestamp;
        apr = _newApr;
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////// onlyGov //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Update Controller to a new address. Very rare case for this to be used.
     * @param _newController Address of the new Controller contract.
     */
    function setController(
        address _newController
    )
      external
      onlyGov
    {
        controller = IController(_newController);
    }

    /**
     * @notice Needed for Nexus to prove this contract lost funds. We'll likely have reinsurance
     * at least at the beginning to ensure we don't have too much risk in certain protocols.
     * @param _coverAddress Address that we need to send 0 eth to to confirm we had a loss.
     */
    function proofOfLoss(
        address _coverAddress
    )
      external
      onlyGov
    {
        _coverAddress.transfer(0);
    }

}