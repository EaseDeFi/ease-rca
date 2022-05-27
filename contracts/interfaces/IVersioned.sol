// SPDX-License-Identifier: SEE LICENSE IN LICENSE
//TODO: was 0.8.13 before. Will this make problems? 
pragma solidity ^0.8.11;

/**
 * @dev an interface for a versioned contract
 */
interface IVersioned {
    function version() external view returns (uint16);
}
