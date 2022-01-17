pragma solidity ^0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { RCAVault } from "./RCAVault.sol";
import { IMasterChefV2 } from "./external/Sushiswap.sol";
import { INXMMaster } from "./external/NexusMutual.sol";
import { IRCAController } from "./interfaces/IRCAController.sol";

contract RCAOnsenVault is RCAVault {
    using SafeERC20 for IERC20;

    IMasterChefV2 public immutable masterChef;

    IERC20 public immutable sushi;

    uint256 public pid;

    uint256 public index;

    struct UserInfo {
        uint256 reward;
        uint256 index;
    }

    mapping(address => UserInfo) public userInfo;

    constructor(
        IMasterChefV2 _masterChef,
        IERC20 _sushi,
        uint256 _pid,
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
    ) ERC20("RCA Onsen LP", "RCA") {
        masterChef = _masterChef;
        sushi = _sushi;
        pid = _pid;
    }

    function getReward(IERC20[] memory) public override update {
        sushi.safeTransfer(msg.sender, userInfo[msg.sender].reward);
        userInfo[msg.sender].reward = 0;
    }

    function _ubalance() internal view override returns(uint256) {
        return uToken.balanceOf(address(this)) + masterChef.userInfo(pid, address(this)).amount;
    }

    function _update(address _user) internal override {
        uint256 sushiBefore = sushi.balanceOf(address(this));
        masterChef.harvest(pid, address(this));
        uint256 sushiReceived = sushi.balanceOf(address(this)) - sushiBefore;
        index += sushiReceived * DENOMINATOR / totalSupply();
        userInfo[_user].reward = (index - userInfo[_user].index) * balanceOf(_user) / DENOMINATOR;
        userInfo[_user].index = index;
    }

    function _afterMint(uint256 _uAmount) internal override {
        uToken.safeApprove(address(masterChef), _uAmount);
        masterChef.deposit(pid, _uAmount, address(this));
    }

    function _afterRedeem(uint256 _rcaAmount) internal override {
        masterChef.withdraw(pid, uValue(_rcaAmount), address(this));
    }
}
