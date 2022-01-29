/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

import "./RcaShieldBase.sol";
import "../external/Convex.sol";

contract RcaShieldConvex is RcaShieldBase {
    using SafeERC20 for IERC20;

    IConvexRewardPool public immutable rewardPool;

    IERC20 public immutable rewardToken;

    struct RewardInfo {
        uint256 reward;
        uint256 index;
    }

    mapping(IERC20 => RewardInfo) public info;

    mapping(IERC20 => mapping(address => RewardInfo)) public userInfo;

    constructor(
        string memory _name,
        string memory _symbol,
        address _uToken,
        address _governance,
        address _controller,
        IConvexRewardPool _rewardPool,
        IERC20 _rewardToken
    ) RcaShieldBase(
        _name,
        _symbol,
        _uToken,
        _governance,
        _controller
     )  {
         rewardPool = _rewardPool;
         rewardToken = _rewardToken;
     }

    function getReward(IERC20[] memory _rewards) public override update {
        for(uint256 i = 0; i<_rewards.length; i++){
            uint256 reward = userInfo[_rewards[i]][msg.sender].reward;
            userInfo[_rewards[i]][msg.sender].reward = 0;
            _rewards[i].safeTransfer(msg.sender, reward);
        }
    }

    function _uBalance() internal view override returns(uint256) {
        return uToken.balanceOf(address(this)) + rewardPool.balanceOf(address(this));
    }

    function _updateReward(address _user) internal override {
        uint256 extraLength = rewardPool.extraRewardsLength();
        uint256[] memory balanceBefore = new uint256[](1+extraLength);
        IERC20[] memory tokens = new IERC20[](1+extraLength);
        tokens[0] = rewardToken;
        balanceBefore[0] = rewardToken.balanceOf(address(this));
        for(uint256 i = 1; i<extraLength; i++) {
            tokens[i] = IERC20(rewardPool.extraRewards(i-1));
            balanceBefore[i] = tokens[i].balanceOf(address(this));
        }
        rewardPool.getReward(address(this), true);
        for(uint256 i = 0; i<extraLength; i++){
            uint256 received = tokens[i].balanceOf(address(this)) - balanceBefore[i];
            info[tokens[i]].index += received * DENOMINATOR / totalSupply();
            userInfo[tokens[i]][_user].reward = (info[tokens[i]].index - userInfo[tokens[i]][_user].index) * balanceOf(_user) / DENOMINATOR;
            userInfo[tokens[i]][_user].index = info[tokens[i]].index;
        }
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
