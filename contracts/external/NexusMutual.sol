// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;

interface INXMMaster {
    function tokenAddress() external view returns (address);

    function owner() external view returns (address);

    function masterInitialized() external view returns (bool);

    function isInternal(address _add) external view returns (bool);

    function isPause() external view returns (bool check);

    function isOwner(address _add) external view returns (bool);

    function isMember(address _add) external view returns (bool);

    function checkIsAuthToGoverned(address _add) external view returns (bool);

    function dAppLocker() external view returns (address _add);

    function getLatestAddress(bytes2 _contractName) external view returns (address payable contractAddress);

    function upgradeMultipleContracts(bytes2[] calldata _contractCodes, address payable[] calldata newAddresses)
        external;

    function removeContracts(bytes2[] calldata contractCodesToRemove) external;

    function addNewInternalContracts(
        bytes2[] calldata _contractCodes,
        address payable[] calldata newAddresses,
        uint256[] calldata _types
    ) external;

    function updateOwnerParameters(bytes8 code, address payable val) external;
}

interface IClaimProof {
    function addProof(uint256 _coverId, string calldata _ipfsHash) external;
}
