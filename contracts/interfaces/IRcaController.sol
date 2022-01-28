/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;

interface IRcaController {
    function mint(
        address   user,
        uint256   uAmount,
        uint256   capacity,
        bytes32[] calldata capacityProof,
        uint256   _newCumLiq,
        bytes32[] calldata forSaleProof
    ) external;

    function redeemRequest(
        address   user,
        uint256   rcaAmount,
        uint256   _newCumLiq,
        bytes32[] calldata forSaleProof
    ) external;

    function redeemFinalize(
        address   to,
        address   user,
        uint256   rcaAmount,
        uint256   _newCumLiq,
        bytes32[] calldata forSaleProof
    ) external returns(bool);

    function purchase(
        address   user,
        uint256   uEthPrice,
        bytes32[] calldata priceProof,
        uint256   _newCumLiq,
        bytes32[] calldata forSaleProof
    ) external;

    function verifyLiq(
        address   shield,
        uint256   _newCumLiq,
        bytes32[] memory forSaleProof
    ) external view;

    function verifyCapacity(
        address   shield,
        uint256   capacity,
        bytes32[] memory proof
    ) external view;

    function getForSale(
        address   _shield,
        uint256   __newCumLiq,
        bytes32[] memory _forSaleProof
    ) external view returns(uint256);
}