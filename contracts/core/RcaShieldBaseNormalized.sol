/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

import "./RcaShieldBase.sol";

contract RcaShieldBaseNormalized is RcaShieldBase {
    using SafeERC20 for IERC20Metadata;

    uint256 immutable BUFFER_UTOKEN;

    constructor(
        string memory _name,
        string memory _symbol,
        address _uToken,
        uint256 _uTokenDecimals,
        address _governor,
        address _controller
    ) RcaShieldBase(_name, _symbol, _uToken, _governor, _controller) {
        BUFFER_UTOKEN = 10**_uTokenDecimals;
    }

    function mintTo(
        address _user,
        address _referrer,
        uint256 _uAmount,
        uint256 _expiry,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        uint256 _newCumLiqForClaims,
        bytes32[] calldata _liqForClaimsProof
    ) external override {
        // Call controller to check capacity limits, add to capacity limits, emit events, check for new "for sale".
        controller.mint(_user, _uAmount, _expiry, _v, _r, _s, _newCumLiqForClaims, _liqForClaimsProof);

        // Only update fees after potential contract update.
        _update();

        uint256 rcaAmount = _rcaValue(_uAmount, amtForSale);

        // handles decimals diff of underlying tokens
        _uAmount = _normalizedUAmount(_uAmount);
        uToken.safeTransferFrom(msg.sender, address(this), _uAmount);

        _mint(_user, rcaAmount);

        _afterMint(_uAmount);

        emit Mint(msg.sender, _user, _referrer, _uAmount, rcaAmount, block.timestamp);
    }

    function redeemFinalize(
        address _to,
        bool _zapper,
        bytes calldata _zapperData,
        uint256 _newCumLiqForClaims,
        bytes32[] calldata _liqForClaimsProof
    ) external override {
        address user = msg.sender;

        WithdrawRequest memory request = withdrawRequests[user];
        delete withdrawRequests[user];

        // endTime > 0 ensures request exists.
        require(request.endTime > 0 && uint32(block.timestamp) > request.endTime, "Withdrawal not yet allowed.");

        controller.redeemFinalize(user, _newCumLiqForClaims, _liqForClaimsProof);

        _update();

        pendingWithdrawal -= uint256(request.uAmount);

        // handles decimals diff of underlying tokens
        uint256 transferAmount = _normalizedUAmount(request.uAmount);
        uToken.safeTransfer(_to, transferAmount);

        // The cool part about doing it this way rather than having user send RCAs to zapper contract,
        // then it exchanging and returning Ether is that it's more gas efficient and no approvals are needed.
        if (_zapper) IZapper(_to).zapTo(user, transferAmount, _zapperData);

        emit RedeemFinalize(user, _to, transferAmount, uint256(request.rcaAmount), block.timestamp);
    }

    function purchaseU(
        address _user,
        uint256 _uAmount,
        uint256 _uEthPrice,
        bytes32[] calldata _priceProof,
        uint256 _newCumLiqForClaims,
        bytes32[] calldata _liqForClaimsProof
    ) external payable override {
        // If user submits incorrect price, tx will fail here.
        controller.purchase(_user, _uEthPrice, _priceProof, _newCumLiqForClaims, _liqForClaimsProof);

        _update();

        uint256 price = _uEthPrice - ((_uEthPrice * discount) / DENOMINATOR);
        // divide by 1 ether because price also has 18 decimals.
        uint256 ethAmount = (price * _uAmount) / 1 ether;
        require(msg.value == ethAmount, "Incorrect Ether sent.");

        // If amount is bigger than for sale, tx will fail here.
        amtForSale -= _uAmount;

        // handles decimals diff of underlying tokens
        _uAmount = _normalizedUAmount(_uAmount);
        uToken.safeTransfer(_user, _uAmount);
        treasury.transfer(msg.value);

        emit PurchaseU(_user, _uAmount, ethAmount, _uEthPrice, block.timestamp);
    }

    /**
     * @notice Normalizes underlying token amount by taking consideration of its
     * decimals.
     * @param _uAmount Utoken amount in 18 decimals
     */
    function _normalizedUAmount(uint256 _uAmount) internal view returns (uint256 amount) {
        amount = (_uAmount * BUFFER_UTOKEN) / BUFFER;
    }

    function _uBalance() internal view virtual override returns (uint256) {
        return (uToken.balanceOf(address(this)) * BUFFER) / BUFFER_UTOKEN;
    }

    function _afterMint(uint256) internal virtual override {
        // no-op
    }

    function _afterRedeem(uint256) internal virtual override {
        // no-op
    }
}