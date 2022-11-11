/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

contract MockRouter {
    function routeTo(
        address _user,
        uint256 _amount,
        bytes calldata _data
    ) external {
        revert();
    }
}
