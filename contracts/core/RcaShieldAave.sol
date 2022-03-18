/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

import "./RcaShieldBase.sol";
import "../external/Aave.sol";

contract RcaShieldAave is RcaShieldBase {
    using SafeERC20 for IERC20;

    IIncentivesController public immutable incentivesController;

    constructor(
        string memory _name,
        string memory _symbol,
        address _uToken,
        uint256 _uTokenDecimals,
        address _governance,
        address _controller,
        IIncentivesController _incentivesController
    ) RcaShieldBase(_name, _symbol, _uToken, _uTokenDecimals, _governance, _controller) {
        incentivesController = _incentivesController;
    }

    function getReward() external {
        address[] memory assets = new address[](1);
        assets[0] = address(uToken);
        uint256 amount = incentivesController.getRewardsBalance(assets, address(this));
        incentivesController.claimRewards(assets, amount, address(this));
    }

    function purchase(
        address _token,
        uint256 _amount, // token amount to buy
        uint256 _tokenPrice,
        bytes32[] calldata _tokenPriceProof,
        uint256 _underlyingPrice,
        bytes32[] calldata _underlyinPriceProof
    ) external {
        require(_token != address(uToken), "cannot buy underlyingToken");
        controller.verifyPrice(_token, _tokenPrice, _tokenPriceProof);
        controller.verifyPrice(address(this), _underlyingPrice, _underlyinPriceProof);
        uint256 underlyingAmount = (_amount * _tokenPrice) / _underlyingPrice;
        if (discount > 0) {
            underlyingAmount -= (underlyingAmount * discount) / DENOMINATOR;
        }
        IERC20(_token).safeTransfer(msg.sender, _amount);
        uToken.safeTransferFrom(msg.sender, address(this), underlyingAmount);
    }

    function _uBalance() internal view override returns (uint256) {
        return uToken.balanceOf(address(this));
    }

    function _afterMint(uint256 _uAmount) internal override {
        // no-op since we get aToken
    }

    function _afterRedeem(uint256 _uAmount) internal override {
        // no-op since we get aToken
    }
}
