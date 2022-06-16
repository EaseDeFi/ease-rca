/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

import "../RcaShieldNormalized.sol";
import { IRibbonVault, ILiquidityGauge, IStakingRewards, IMinter } from "../../external/Ribbon.sol";
import "hardhat/console.sol";

contract RcaShieldRibbon is RcaShieldNormalized {
    using SafeERC20 for IERC20Metadata;

    IRibbonVault public immutable ribbonVault;
    ILiquidityGauge public immutable liquidityGauge;
    // IStakingRewards public immutable stakingRewards;
    IMinter public immutable minter;

    constructor(
        string memory _name,
        string memory _symbol,
        address _uToken,
        uint256 _uTokenDecimals,
        address _governance,
        address _controller,
        IRibbonVault _ribbonVault,
        ILiquidityGauge _liquidityGauge,
        // IStakingRewards _stakingRewards,
        IMinter _minter
    ) RcaShieldNormalized(_name, _symbol, _uToken, _uTokenDecimals, _governance, _controller) {
        ribbonVault = _ribbonVault;
        liquidityGauge = _liquidityGauge;
        // stakingRewards = _stakingRewards;
        minter = _minter;
    }

    function getReward() external {
        minter.mint(address(liquidityGauge));
    }

    function purchase(
        address _token,
        uint256 _amount, // token amount to buy
        uint256 _tokenPrice,
        bytes32[] calldata _tokenPriceProof,
        uint256 _underlyingPrice,
        bytes32[] calldata _underlyinPriceProof
    ) external {
        require(_token != address(uToken), "cannot buy underlying token");
        controller.verifyPrice(_token, _tokenPrice, _tokenPriceProof);
        controller.verifyPrice(address(uToken), _underlyingPrice, _underlyinPriceProof);
        uint256 underlyingAmount = (_amount * _tokenPrice) / _underlyingPrice;
        if (discount > 0) {
            underlyingAmount -= (underlyingAmount * discount) / DENOMINATOR;
        }

        IERC20Metadata token = IERC20Metadata(_token);
        // normalize token amount to transfer to the user so that it can handle different decimals
        _amount = (_amount * 10**token.decimals()) / BUFFER;

        token.safeTransfer(msg.sender, _amount);
        uToken.safeTransferFrom(msg.sender, address(this), _normalizedUAmount(underlyingAmount));

        _afterMint(_normalizedUAmount(underlyingAmount));
    }

    function _uBalance() internal view override returns (uint256) {
        return uToken.balanceOf(address(this)) + liquidityGauge.balanceOf(address(this));
    }

    function _afterMint(uint256 _uAmount) internal override {
        ribbonVault.maxRedeem();
        ribbonVault.stake(_uAmount);
    }

    function _afterRedeem(uint256 _uAmount) internal override {
        // ribbonVault.initiateWithdraw(_uAmount);
        require(liquidityGauge.user_checkpoint(address(this)), "Checkpoint didnt work");
        liquidityGauge.withdraw(_normalizedUAmount(_uAmount));      
        // ribbonVault.maxRedeem();  
    }
}
