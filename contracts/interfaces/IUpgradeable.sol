// SPDX-License-Identifier: SEE LICENSE IN LICENSE
//TODO: was 0.8.13 before. Will this make problems? 
pragma solidity ^0.8.11;

import { IVersioned } from "./IVersioned.sol";

import { IAccessControlEnumerableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/IAccessControlEnumerableUpgradeable.sol";

/**
 * @dev this is the common interface for upgradeable contracts
 */
interface IUpgradeable is IAccessControlEnumerableUpgradeable, IVersioned {

}
