/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

interface IRcaShield {
    function cumForSale() external returns(uint256);
    function setApr(uint256 apr) external;
    function setTreasury(address treasury) external;
    function setDiscount(uint256 discount) external;
    function setForSale(uint256 addForSale) external;
    function setPercentPaused(uint256 percentPaused) external;
    function setWithdrawalDelay(uint256 withdrawalDelay) external;
    function initialize(uint256 apr, uint256 discount, address treasury, uint256 withdrawalDelay) external;
}
