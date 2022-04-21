/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

interface IComptroller {
    function enterMarkets(address[] memory cTokens) external returns (uint256[] memory);

    function claimComp(address holder) external;

    function claimComp(address holder, address[] memory) external;

    function getAssetsIn(address account) external view returns (address[] memory);
}

interface ICToken {
    function mint(uint256 mintAmount) external returns (uint256);

    function redeem(uint256 redeemTokens) external returns (uint256);

    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);

    function transfer(address dst, uint256 amount) external returns (bool);

    function transferFrom(
        address src,
        address dst,
        uint256 amount
    ) external returns (bool);

    function approve(address spender, uint256 amount) external returns (bool);

    function allowance(address owner, address spender) external view returns (uint256);

    function balanceOf(address owner) external view returns (uint256);

    function balanceOfUnderlying(address owner) external returns (uint256);

    function decimals() external returns (uint8);

    function exchangeRateStored() external view returns (uint256);

    function exchangeRateCurrent() external returns (uint256);
}
