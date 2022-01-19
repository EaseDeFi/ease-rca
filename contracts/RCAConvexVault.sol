pragma solidity ^0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { RCAVault } from "./RCAVault.sol";
import { IMasterChefV2 } from "./external/Sushiswap.sol";
import { INXMMaster } from "./external/NexusMutual.sol";
import { IRCAController } from "./interfaces/IRCAController.sol";

contract RCAConvexVault is RCAVault {
    using SafeERC20 for IERC20;

    IConvexBooster public immutable booster;

    IConvexRewardPool public immutable rewardPool

    IERC20 public immutable rewardToken;

    struct RewardInfo {
        uint256 reward;
        uint256 index;
    }

    mapping(IERC20 => RewardInfo) public info;

    mapping(IERC20 => mapping(address => RewardInfo)) public userInfo;

    constructor(
        IConvexBooster _booster,
        IConvexRewardPool _rewardPool
        IERC20 _rewardToken,
        INXMMaster _nxmMaster,
        IRCAController _controller,
        IERC20 _uToken,
        bytes32 _tokenKey,
        uint256[] memory _covered,
        address payable _treasury,
        address _owner
    ) RCAVault(
        _nxmMaster,
        _controller,
        _uToken,
        _tokenKey,
        _covered,
        _treasury,
        _owner
    ) ERC20("RCA Convex", "RCA") {
        booster = _booster;
        rewardPool = _rewardPool;
        rewardToken = _rewardToken;
    }

    function getReward(IERC20[] memory _rewards) public override update {
        for(uint256 i = 0; i<_rewards.length; i++){
            uint256 reward = userInfo[_rewards[i]][msg.sender].reward;
            userInfo[_rewards[i]][msg.sender].reward = 0;
            _rewards.transfer(msg.sender, reward);
        }
    }

    function _ubalance() internal view override returns(uint256) {
        return uToken.balanceOf(address(this)) + rewardPool.balanceOf(address(this));
    }

    function _update(address _user) internal override {
        uint256 extraLength = rewardPool.extraRewardsLength();
        uint256[] memory balanceBefore = new uint256[](1+extraLength);
        IERC20[] memory tokens = new IERC20[](1+extraLength);
        tokens[0] = rewardToken;
        balanceBefore[0] = rewardToken.balanceOf(address(this));
        for(uint256 i = 1; i<extraLength; i++) {
            tokens[i] = IERC20(rewardPool.extraRewards[i-1]);
            balanceBefore[i] = tokens[i].balanceOf(address(this));
        }
        rewardPool.getReward(address(this), true);
        for(uint256 i = 0; i<extraLength; i++){
            uint256 received = tokens[i].balanceOf(address(this)) - balanceBefore[i];
            info[tokens[i]].index += received * DENOMINATOR / totalSupply();
            userInfo[_tokens[i]][_user].reward = (info[tokens[i]].index - userInfo[tokens[i]][_user].index) * balanceOf(_user) / DENOMINATOR;
            userInfo[_tokens[i]][_user].index = index[tokens[i]].index;
        }
    }

    function _afterMint(uint256 _uAmount) internal override {
        uToken.safeApprove(address(rewardPool), _uAmount);
        rewardPool.stake(_uAmount);
    }

    function _afterRedeem(uint256 _rcaAmount) internal override {
        // CHEK : we are not going to claims rewards here since it will be claimed on _update
        masterChef.withdraw(uValue(_rcaAmount), false);
    }
}
