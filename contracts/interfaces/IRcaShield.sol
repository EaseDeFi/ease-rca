/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface IRcaShield {
    function cumForSale() external returns(uint256);
    function setApr(uint256 apr, uint256 updateTime) external;
    function setTreasury(address treasury) external;
    function setDiscount(uint256 discount) external;
    function setLiq(uint256 addForSale, uint256 updateTime) external;
    function setPercentPaused(uint256 percentPaused, uint256 updateTime) external;
    function setWithdrawalDelay(uint256 withdrawalDelay) external;
    function initialize(uint256 apr, uint256 discount, address treasury, uint256 withdrawalDelay) external;
    function name() external returns(string calldata);
    function symbol() external returns(string calldata);
    function uToken() external returns(IERC20);
}
