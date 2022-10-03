/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

import "../../external/Rocketpool.sol";
import "../RcaShieldBase.sol";

contract RcaShieldLido is RcaShieldBase {
    using SafeERC20 for IERC20Metadata;

    //TODO: Do I need this?
    IRocketStorage public immutable rocketStorage;

    constructor(
        string memory _name,
        string memory _symbol,
        address _uToken,
        address _governance,
        address _controller,
        address _rocketStorageAddress
    ) RcaShieldBase(_name, _symbol, _uToken, _governance, _controller) {
        rocketStorage = IRocketStorage(_rocketStorageAddress);
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

        // Get latest rETH token contract address and then transfer rETH from sender to this contract
        address rocketTokenRETHAddress = rocketStorage.getAddress(keccak256(
                abi.encodePacked("contract.address", "rocketTokenRETH")
            ));
        IRocketTokenRETH rocketTokenRETH = IRocketTokenRETH(rocketTokenRETHAddress);
        rocketTokenRETH.safeTransferFrom(msg.sender, address(this), _uAmount);

        _mint(_user, rcaAmount);

        _afterMint(_uAmount);

        emit Mint(msg.sender, _user, _referrer, _uAmount, rcaAmount, block.timestamp);
    }

    function redeemFinalize(
        address _to,
        bytes calldata _routerData,
        uint256 _newCumLiqForClaims,
        bytes32[] calldata _liqForClaimsProof,
        uint256 _newPercentReserved,
        bytes32[] calldata _percentReservedProof
    ) external override {
        address user = msg.sender;

        WithdrawRequest memory request = withdrawRequests[user];
        delete withdrawRequests[user];

        // endTime > 0 ensures request exists.
        require(request.endTime > 0 && uint32(block.timestamp) > request.endTime, "Withdrawal not yet allowed.");

        bool isRouterVerified = controller.redeemFinalize(
            user,
            _to,
            _newCumLiqForClaims,
            _liqForClaimsProof,
            _newPercentReserved,
            _percentReservedProof
        );

        _update();

        // We're going to calculate uAmount a second time here then send the lesser of the two.
        // If we only calculate once, users can either get their full uAmount after a hack if percentReserved
        // hasn't been sent in, or users can earn yield after requesting redeem (with the same consequence).
        uint256 uAmount = _uValue(request.rcaAmount, amtForSale, percentReserved);
        if (request.uAmount < uAmount) uAmount = uint256(request.uAmount);

        pendingWithdrawal -= uint256(request.rcaAmount);

        address rocketTokenRETHAddress = rocketStorage.getAddress(keccak256(
                abi.encodePacked("contract.address", "rocketTokenRETH")
            ));
        uToken.safeTransfer(_to, uAmount);

        // The cool part about doing it this way rather than having user send RCAs to router contract,
        // then it exchanging and returning Ether is that it's more gas efficient and no approvals are needed.
        // (and no nonsense with the withdrawal delay making routers wonky)
        if (isRouterVerified) IRouter(_to).routeTo(user, uAmount, _routerData);

        emit RedeemFinalize(user, _to, uAmount, uint256(request.rcaAmount), block.timestamp);
    }

    function _uBalance() internal view override returns (uint256) {
        address rocketTokenRETHAddress = rocketStorage.getAddress(keccak256(
                abi.encodePacked("contract.address", "rocketTokenRETH")
            ));
        IRocketTokenRETH rocketTokenRETH = IRocketTokenRETH(rocketTokenRETHAddress);
        return rocketTokenRETH.balanceOf(address(this));
    }
}
