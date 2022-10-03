/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

import "../RcaShieldBase.sol";

contract RcaShieldLido is RcaShieldBase {
    using SafeERC20 for IERC20Metadata;


    // IConvexRewardPool public immutable rewardPool;

    constructor(
        string memory _name,
        string memory _symbol,
        address _uToken,
        address _governance,
        address _controller
    ) RcaShieldBase(_name, _symbol, _uToken, _governance, _controller) {
    }

    function _uBalance() internal view override returns (uint256) {
        return uToken.balanceOf(address(this));
    }

    function _afterMint(uint256 _uAmount) internal override {
        // uToken can't be staked.
    }

    function _afterRedeem(uint256 _uAmount) internal override {
        // uToken can be directly given back to user.
    }
}
