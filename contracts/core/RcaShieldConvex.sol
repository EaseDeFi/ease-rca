/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

import "./RcaShieldBase.sol";
import "../external/Convex.sol";

contract RcaShieldConvex is RcaShieldBase {
    using SafeERC20 for IERC20;

    IConvexRewardPool public immutable rewardPool;

    constructor(
        string memory _name,
        string memory _symbol,
        address _uToken,
        address _governance,
        address _controller,
        IConvexRewardPool _rewardPool
    ) RcaShieldBase(
        _name,
        _symbol,
        _uToken,
        _governance,
        _controller
     )  {
         rewardPool = _rewardPool;
     }

    function _uBalance() internal view override returns(uint256) {
        return uToken.balanceOf(address(this)) + rewardPool.balanceOf(address(this));
    }

    function _afterMint(uint256 _uAmount) internal override {
        uToken.safeApprove(address(rewardPool), _uAmount);
        rewardPool.stake(_uAmount);
    }

    function _afterRedeem(uint256 _uAmount) internal override {
        // CHEK : we are not going to claims rewards here since it will be claimed on _update
        rewardPool.withdraw(_uAmount, false);
    }
}
