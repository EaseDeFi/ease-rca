/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.11;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IRcaShield {
    function setApr(uint256 apr) external;

    function setTreasury(address treasury) external;

    function setDiscount(uint256 discount) external;

    function setLiqForClaims(uint256 addForSale) external;

    function setPercentReserved(uint256 percentPaused) external;

    function setWithdrawalDelay(uint256 withdrawalDelay) external;

    function initialize(
        uint256 apr,
        uint256 discount,
        address treasury,
        uint256 withdrawalDelay
    ) external;

    function name() external returns (string calldata);

    function symbol() external returns (string calldata);

    function uToken() external returns (IERC20);

    function controllerUpdate(uint256 apr, uint256 aprUpdate) external;

    struct WithdrawRequest {
        uint112 uAmount;
        uint112 rcaAmount;
        uint32 endTime;
    }

    function withdrawRequests(address user) external view returns (WithdrawRequest memory);

    function mintTo(
        address _user,
        address _referrer,
        uint256 _uAmount,
        uint256 _expiry,
        uint8 _v,
        bytes32 _r,
        bytes32 _s,
        uint256 _newCumLiqForClaims,
        bytes32[] calldata _liqForClaimsProof
    ) external;

    function redeemRequest(
        uint256 _rcaAmount,
        uint256 _newCumLiqForClaims,
        bytes32[] calldata _liqForClaimsProof,
        uint256 _newPercentReserved,
        bytes32[] calldata _percentReservedProof
    ) external;

    function redeemFinalize(
        address _to,
        bytes calldata _routerData,
        uint256 _newCumLiqForClaims,
        bytes32[] calldata _liqForClaimsProof
    ) external;

    function purchaseU(
        address _user,
        uint256 _uAmount,
        uint256 _uEthPrice,
        bytes32[] calldata _priceProof,
        uint256 _newCumLiqForClaims,
        bytes32[] calldata _liqForClaimsProof
    ) external payable;

    function purchaseRca(
        address _user,
        uint256 _uAmount,
        uint256 _uEthPrice,
        bytes32[] calldata _priceProof,
        uint256 _newCumLiqForClaims,
        bytes32[] calldata _liqForClaimsProof
    ) external payable;
}
