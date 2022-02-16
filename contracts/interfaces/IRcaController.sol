/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

interface IRcaController {
    function mint(
        address   user,
        uint256   uAmount,
        uint256   expiry,
        uint8     v,
        bytes32   r,
        bytes32   s,
        uint256   _newCumLiq,
        bytes32[] calldata cumLiqProof
    ) external;

    function redeemRequest(
        address   user,
        uint256   _newCumLiq,
        bytes32[] calldata cumLiqProof,
        uint256   _newPercentReserved,
        bytes32[] calldata _percentReservedProof
    ) external;

    function redeemFinalize(
        address   user,
        uint256   _newCumLiq,
        bytes32[] calldata cumLiqProof
    ) external;

    function purchase(
        address   user,
        uint256   uEthPrice,
        bytes32[] calldata priceProof,
        uint256   _newCumLiq,
        bytes32[] calldata cumLiqProof
    ) external;

    function verifyLiq(
        address   shield,
        uint256   _newCumLiq,
        bytes32[] memory cumLiqProof
    ) external view;

    function verifyCapacity(
        address   shield,
        uint256   capacity,
        bytes32[] memory proof
    ) external view;

    function apr() external view returns(uint256);
    function systemUpdates() external view returns(uint32, uint32, uint32, uint32, uint32, uint32);
}
