/// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.11;
import '../general/Governable.sol';
import '../interfaces/IZapper.sol';
import '../interfaces/IRcaController.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

/**
 * @title RCA Vault
 * @notice Main contract for reciprocally-covered assets. Mints, redeems, and sells.
 * Each underlying token (not protocol) has its own RCA vault. This contract
 * doubles as the vault and the RCA token.
 * @dev This contract assumes uToken decimals of 18.
 * @author Robert M.C. Forster
**/
abstract contract RcaShieldBase is ERC20, Governable {
    using SafeERC20 for IERC20;

    uint256 constant YEAR_SECS = 31536000;
    uint256 constant DENOMINATOR = 10000;

    /// @notice Controller of RCA contract that takes care of actions.
    IRcaController public controller;
    /// @notice Underlying token that is protected by the shield.
    IERC20 public uToken;
    /// @notice Treasury for all funds that accepts payments.
    address payable public treasury;
    /// @notice Current sale discount to sell tokens cheaper.
    uint256 public discount;
    /// @notice Percent to pay per year. 1000 == 10%.
    uint256 public apr;
    /// @notice Percent of the contract that is currently paused and cannot be withdrawn.
    /// Set > 0 when a hack has happened and DAO has not submitted for sales.
    /// Withdrawals during this time will lose this percent. 1000 == 10%.
    uint256 public percentPaused;

    /** 
     * @notice Cumulative total amount that has been for sale lol.
     * @dev Used to make sure we don't run into a situation where forSale amount isn't updated,
     * a new hack occurs and current forSale is added to, then forSale is updated while
     * DAO votes on the new forSale. In this case we can subtract that interim addition.
     */
    uint256 public cumLiq;
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
        address indexed user, 
        uint256 uAmount, 
        uint256 rcaAmount, 
        uint256 endTime, 
        uint256 timestamp
    );
    /// @notice Notification of a redeem finalization after withdrawal delay.
    event RedeemFinalize(
        address indexed user,
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
            uint256 active = _uBalance() - amtForSale;
            amtForSale += 
                active
                * secsElapsed 
                * apr
                / YEAR_SECS
                / DENOMINATOR;
            lastUpdate = block.timestamp;
        }
        _;
    }

    /**
     * @notice Restrict set functions to only controller for many variables.
     */
    modifier onlyController()
    {
        require(msg.sender == address(controller), "Function must only be called by controller.");
        _;
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////// constructor ////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Construct shield and RCA ERC20 token.
     * @param _name Name of the RCA token.
     * @param _symbol Symbol of the RCA token.
     * @param _governor Address of the governor (owner) of the shield.
     * @param _controller Address of the controller that maintains the shield.
     */
    constructor(
        string  memory _name,
        string  memory _symbol,
        address _uToken,
        address _governor,
        address _controller
    )
    ERC20(
        _name,
        _symbol
    )
    {
        initializeGovernable(_governor);
        uToken = IERC20(_uToken);
        controller = IRcaController(_controller);
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////// initialize /////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Controller calls to initiate which sets current contract variables. All %s are 1000 == 10%.
     * @param _apr Fees for using the RCA ecosystem.
     * @param _discount Discount for purchases while tokens are being liquidated.
     * @param _treasury Address of the treasury to which Ether from fees and liquidation will be sent.
     * @param _withdrawalDelay Delay of withdrawals from the shield in seconds.
     */
    function initialize(
        uint256 _apr,
        uint256 _discount,
        address payable _treasury,
        uint256 _withdrawalDelay
    )
      external
      onlyController
    {
        require(treasury == address(0), "Contract has already been initialized.");
        apr = _apr;
        discount = _discount;
        treasury = _treasury;
        withdrawalDelay = _withdrawalDelay;
    }
/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////// internal ///////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    function _updateReward(address _user) internal virtual;

    function _afterMint(uint256 _uAmount) internal virtual;

    function _afterRedeem(uint256 _uAmount) internal virtual;

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////// external //////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /// Get reward of a protocol includes rewards
    function getReward(IERC20[] memory _tokens) public virtual;

    /**
     * @notice Mint tokens to an address. Not automatically to msg.sender so we can more easily zap assets.
     * @param _uAmount Amount of underlying tokens desired to use for mint.
     * @param _user The user to mint tokens to.
     */
    function mintTo(
        address   _user,
        uint256   _uAmount,
        uint256   _capacity,
        bytes32[] calldata _capacityProof,
        uint256   _newCumLiq,
        bytes32[] calldata _liqProof
    )
      external
      update
    {
        // Call controller to check capacity limits, add to capacity limits, emit events, check for new "for sale".
        controller.mint(
            _user,
            _uAmount,
            _capacity,
            _capacityProof,
            _newCumLiq,
            _liqProof
        );

        uint256 rcaAmount = _rcaValue(_uAmount, 0);
        uToken.safeTransferFrom(msg.sender, address(this), _uAmount);
        _mint(_user, rcaAmount);

        _afterMint(_uAmount);

        emit Mint(
            msg.sender,
            _user,
            _uAmount,
            rcaAmount,
            block.timestamp
        );
    }

    /**
     * @notice Request redemption of RCAs back to the underlying token.
     */
    function redeemRequest(
        uint256   _rcaAmount,
        uint256   _newCumLiq,
        bytes32[] calldata _liqProof
    )
      external
      update
    {
        controller.redeemRequest(
            msg.sender,
            _rcaAmount,
            _newCumLiq,
            _liqProof
        );

        uint256 uAmount = _uValue(_rcaAmount, 0);
        _burn(msg.sender, _rcaAmount);

        _afterRedeem(uAmount);

        pendingWithdrawal += _rcaAmount;

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
     * @param _user The address to redeem tokens for. Since a previous request is required, there are no security implications.
     */
    function redeemTo(
        address   _to,
        address   _user,
        uint256   _newCumLiq,
        bytes32[] calldata _liqProof
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
            controller.redeemFinalize(
                _to,
                _user,
                uint256(request.rcaAmount),
                _newCumLiq,
                _liqProof
            );

        pendingWithdrawal -= uint256(request.rcaAmount);

        uToken.safeTransfer( _user, uint256(request.uAmount) );

        // The cool part about doing it this way rather than having user RCAs to zapper contract,
        // then it exchanging and returning Ether is that it's more gas efficient and no approvals are needed.
        if (zapper) IZapper(_to).zapTo( _user, uint256(request.uAmount) );
        else if (_to != _user) revert("Redeeming to invalid address.");

        emit RedeemFinalize(
            _user,
            _to,
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
     * @param _newCumLiq Old cumulative amount for sale.
     * @param _liqProof Merkle proof for for sale amounts.
     */
    function purchaseU(
        address   _user,
        uint256   _uAmount,
        uint256   _uEthPrice,
        bytes32[] calldata _priceProof,
        uint256   _newCumLiq,
        bytes32[] calldata _liqProof
    )
      external
      payable
      update
    {
        // If user submits incorrect price, tx will fail here.
        controller.purchase(
            _user,
            _uEthPrice,
            _priceProof,
            _newCumLiq,
            _liqProof
        );

        uint256 price = _uEthPrice  - (_uEthPrice * discount / DENOMINATOR);
        uint256 ethAmount = price * _uAmount;
        require(msg.value == ethAmount, "Incorrect Ether sent.");

        // If amount is too big than for sale, tx will fail here.
        amtForSale -= _uAmount;

        uToken.safeTransfer(_user, _uAmount);
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
     * @param _newCumLiq Old cumulative amount for sale.
     * @param _liqProof Merkle proof of the for sale amounts.
     */
    function purchaseRca(
        address   _user,
        uint256   _uAmount,
        uint256   _uEthPrice,
        bytes32[] calldata _priceProof,
        uint256   _newCumLiq,
        bytes32[] calldata _liqProof
    )
      external
      payable
      update
    {
        // If user submits incorrect price, tx will fail here.
        controller.purchase(
            _user,
            _uEthPrice,
            _priceProof,
            _newCumLiq,
            _liqProof
        );

        uint256 price = _uEthPrice  - (_uEthPrice * discount / DENOMINATOR);
        // divide by 1 ether because price also has 18 decimals.
        uint256 ethAmount = price * _uAmount / 1 ether;
        require(msg.value == ethAmount, "Incorrect Ether sent.");
        
        // If amount is too big than for sale, tx will fail here.
        amtForSale       -= _uAmount;
        uint256 rcaAmount = _rcaValue(_uAmount, 0);

        _mint(_user, rcaAmount);
        treasury.transfer(msg.value);

        emit PurchaseRca(
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

    /// @notice Check balance of underlying token.
    function _uBalance() internal virtual view returns(uint256);

    /**
     * @notice Convert RCA value to underlying tokens. This is internal because new 
     * for sale amounts will already have been retrieved and updated.
     * @param _rcaAmount The amount of RCAs to find the underlying value of.
     * @param _extraForSale Used by external value calls cause updates aren't made on those.
     */
    function _uValue(
        uint256 _rcaAmount,
        uint256 _extraForSale
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
            (_uBalance() - amtForSale + _extraForSale)
            * _rcaAmount
            / (totalSupply + pendingWithdrawal);

        uint256 _percentPaused = percentPaused;
        if (_percentPaused > 0)
            uAmount -= 
            (uAmount 
            * _percentPaused 
            / DENOMINATOR);
    }

    /**
     * @notice Find the RCA value of an amount of underlying tokens.
     * @param _uAmount Amount of underlying tokens to find RCA value of.
     * @param _extraForSale Used by external value calls cause updates aren't made on those.
     */
    function _rcaValue(
        uint256 _uAmount,
        uint256 _extraForSale
    )
      internal
      view
    returns(
        uint256 rcaAmount
    )
    {
        uint256 balance = _uBalance();
        if (balance == 0) return _uAmount;

        rcaAmount = 
            (totalSupply() + pendingWithdrawal)
            * _uAmount
            / (balance - amtForSale + _extraForSale);
    }

    /**
     * @dev External version of RCA value is needed so that frontend can properly
     * calculate values in cases where the contract has not been recently updated.
     */
    function uValue(
        uint256 _rcaAmount,
        uint256 _newCumLiq,
        bytes32[] calldata _liqProof
    )
      external
      view
    returns(
        uint256 uAmount
    )
    {
        uint256 extraForSale = 0;

        // Pretty annoying but we gotta do APR calculations if it's above 0.
        if (apr > 0) {
            uint256 secsElapsed = block.timestamp - lastUpdate;
            uint256 balance = _uBalance();
            extraForSale =
                balance
                * secsElapsed 
                * apr
                / YEAR_SECS
                / DENOMINATOR;
        }

        // Fails on incorrect for sale amount.
        controller.verifyLiq(address(this), _newCumLiq, _liqProof);

        // This calculates whether extra needs to be added to amtForSale for these calcs.
        extraForSale += _newCumLiq - cumLiq;

        uAmount = _uValue(_rcaAmount, extraForSale);
    }

    /**
     * @dev External version of RCA value is needed so that frontend can properly
     * calculate values in cases where the contract has not been recently updated.
     */
    function rcaValue(
        uint256 _uAmount,
        uint256 _newCumLiq,
        bytes32[] calldata _liqProof
    )
      external
      view
    returns(
        uint256 rcaAmount
    )
    {
        uint256 extraForSale = 0;

        // Pretty annoying but we gotta do APR calculations if it's above 0.
        if (apr > 0) {
            uint256 secsElapsed = block.timestamp - lastUpdate;
            uint256 balance = _uBalance();
            extraForSale =
                balance
                * secsElapsed 
                * apr
                / YEAR_SECS
                / DENOMINATOR;
        }

        // Fails on incorrect for sale amount.
        controller.verifyLiq(address(this), _newCumLiq, _liqProof);

        // This calculates whether extra needs to be added to amtForSale for these calcs.
        extraForSale += _newCumLiq - cumLiq;

        rcaAmount = _rcaValue(_uAmount, extraForSale);
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////// internal ///////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    function _updateReward(address _user) internal virtual;

    function _afterMint(uint256 _uAmount) internal virtual;

    function _afterRedeem(uint256 _uAmount) internal virtual;

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////// onlyController //////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @notice Add a for sale amount to this shield vault.
     * @param _newCumLiq New cumulative total for sale.
    **/
    function setForSale(
        uint256 _newCumLiq
    )
      external
      onlyController
    {
        // Do this here rather than on controller for slight savings.
        uint256 addForSale = _newCumLiq - cumLiq;
        amtForSale += addForSale;
    }

    /**
     * @notice Change the treasury address to which funds will be sent.
     * @param _newTreasury New treasury address.
    **/
    function setTreasury(
        address _newTreasury
    )
      external
      onlyController
    {
        treasury = payable(_newTreasury);
    }

    /**
     * @notice Change the percent paused on this vault. 1000 == 10%.
     * @param _newPercentPaused New percent paused.
    **/
    function setPercentPaused(
        uint256 _newPercentPaused
    )
      external
      onlyController
    {
        percentPaused = _newPercentPaused;
    }

    /**
     * @notice Change the withdrawal delay of withdrawing underlying tokens from vault. In seconds.
     * @param _newWithdrawalDelay New withdrawal delay.
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
     * @notice Change the discount that users get for purchasing from us. 1000 == 10%.
     * @param _newDiscount New discount.
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
     * @param _newApr New APR. 1000 == 10%.
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
        controller = IRcaController(_newController);
    }

    /**
     * @notice Needed for Nexus to prove this contract lost funds. We'll likely have reinsurance
     * at least at the beginning to ensure we don't have too much risk in certain protocols.
     * @param _coverAddress Address that we need to send 0 eth to to confirm we had a loss.
     */
    function proofOfLoss(
        address payable _coverAddress
    )
      external
      onlyGov
    {
        _coverAddress.transfer(0);
    }

}