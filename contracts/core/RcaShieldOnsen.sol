/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

import "./RcaShieldBase.sol";
import { IMasterChefV2 } from "../external/Sushiswap.sol";

contract RcaShieldOnsen is RcaShieldBase {
    using SafeERC20 for IERC20Metadata;

    IMasterChefV2 public immutable masterChef;

    IERC20 public immutable sushi;

    uint256 public immutable pid;

    constructor(
        string memory _name,
        string memory _symbol,
        address _uToken,
        uint256 _uTokenDecimals,
        address _governance,
        address _controller,
        IMasterChefV2 _masterChef,
        IERC20 _sushi,
        uint256 _pid
    ) RcaShieldBase(_name, _symbol, _uToken, _uTokenDecimals, _governance, _controller) {
        masterChef = _masterChef;
        sushi = _sushi;
        pid = _pid;
    }

    function getReward() external {
        masterChef.harvest(pid, address(this));
    }

    function purchase(
        address _token,
        uint256 _amount, // token amount to buy
        uint256 _tokenPrice,
        bytes32[] calldata _tokenPriceProof,
        uint256 _underlyingPrice,
        bytes32[] calldata _underlyinPriceProof
    ) external {
        require(_token == address(sushi), "only sushi on sale");
        controller.verifyPrice(_token, _tokenPrice, _tokenPriceProof);
        controller.verifyPrice(address(this), _underlyingPrice, _underlyinPriceProof);
        uint256 underlyingAmount = (_amount * _tokenPrice) / _underlyingPrice;
        if (discount > 0) {
            underlyingAmount -= (underlyingAmount * discount) / DENOMINATOR;
        }
        IERC20Metadata(_token).safeTransfer(msg.sender, _amount);
        uToken.safeTransferFrom(msg.sender, address(this), underlyingAmount);
        uToken.safeApprove(address(masterChef), underlyingAmount);
        masterChef.deposit(pid, underlyingAmount, address(this));
    }

    function _uBalance() internal view override returns (uint256) {
        return uToken.balanceOf(address(this)) + masterChef.userInfo(pid, address(this)).amount;
    }

    function _afterMint(uint256 _uAmount) internal override {
        uToken.safeApprove(address(masterChef), _uAmount);
        masterChef.deposit(pid, _uAmount, address(this));
    }

    function _afterRedeem(uint256 _uAmount) internal override {
        masterChef.withdraw(pid, _uAmount, address(this));
    }
}
