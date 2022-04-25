/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

interface IYVault {
    function totalAssets() external view returns (uint256);

    function lockedProfit() external view returns (uint256);

    function pricePerShare() external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function totalDebt() external view returns (uint256);

    function token() external view returns (address);

    function lastReport() external view returns (uint256);

    function withdraw() external returns (uint256);

    function deposit() external returns (uint256);

    // ERC20 functions
    function transfer(address dst, uint256 amount) external returns (bool);

    function transferFrom(
        address src,
        address dst,
        uint256 amount
    ) external returns (bool);

    function approve(address spender, uint256 amount) external returns (bool);

    function allowance(address owner, address spender) external view returns (uint256);

    function balanceOf(address owner) external view returns (uint256);

    function decimals() external view returns (uint8);
}
