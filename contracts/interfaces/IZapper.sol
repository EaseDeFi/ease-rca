/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

interface IZapper {
    function zapTo(
        address user,
        uint256 uAmount,
        bytes calldata data
    ) external;
}
