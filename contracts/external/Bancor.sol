// SPDX-License-Identifier: SEE LICENSE IN LICENSE
//TODO: was 0.8.13 before. Will this make problems? 
pragma solidity ^0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IUpgradeable } from "../interfaces/IUpgradeable.sol";

import { Token } from "../interfaces/Token.sol";

// import { IPoolCollection } from "../../pools/interfaces/IPoolCollection.sol";
// import { IPoolToken } from "../../pools/interfaces/IPoolToken.sol";

/**
 * @dev Flash-loan recipient interface
 */
interface IFlashLoanRecipient {
    /**
     * @dev a flash-loan recipient callback after each the caller must return the borrowed amount and an additional fee
     */
    function onFlashLoan(
        address caller,
        IERC20 erc20Token,
        uint256 amount,
        uint256 feeAmount,
        bytes memory data
    ) external;
}

/**
 * @dev Bancor Network interface
 */
interface IBancorNetwork is IUpgradeable {
    /**
     * @dev returns the set of all valid pool collections
     */
    // function poolCollections() external view returns (IPoolCollection[] memory);

    /**
     * @dev returns the most recent collection that was added to the pool collections set for a specific type
     */
    // function latestPoolCollection(uint16 poolType) external view returns (IPoolCollection);

    /**
     * @dev returns the set of all liquidity pools
     */
    // function liquidityPools() external view returns (Token[] memory);

    /**
     * @dev returns the respective pool collection for the provided pool
     */
    // function collectionByPool(Token pool) external view returns (IPoolCollection);

    /**
     * @dev returns whether the pool is valid
     */
    // function isPoolValid(Token pool) external view returns (bool);

    /**
     * @dev creates a new pool
     *
     * requirements:
     *
     * - the pool doesn't already exist
     */
    // function createPool(uint16 poolType, Token token) external;

    /**
     * @dev creates new pools
     *
     * requirements:
     *
     * - none of the pools already exists
     */
    // function createPools(uint16 poolType, Token[] calldata tokens) external;

    /**
     * @dev migrates a list of pools between pool collections
     *
     * notes:
     *
     * - invalid or incompatible pools will be skipped gracefully
     */
    // function migratePools(Token[] calldata pools) external;

    /**
     * @dev deposits liquidity for the specified provider and returns the respective pool token amount
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the tokens on its behalf (except for in the
     *   native token case)
     */
    // function depositFor(
    //     address provider,
    //     Token pool,
    //     uint256 tokenAmount
    // ) external payable returns (uint256);

    /**
     * @dev deposits liquidity for the current provider and returns the respective pool token amount
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the tokens on its behalf (except for in the
     *   native token case)
     */
    function deposit(Token pool, uint256 tokenAmount) external payable returns (uint256);

    /**
     * @dev deposits liquidity for the specified provider by providing an EIP712 typed signature for an EIP2612 permit
     * request and returns the respective pool token amount
     *
     * requirements:
     *
     * - the caller must have provided a valid and unused EIP712 typed signature
     */
    function depositForPermitted(
        address provider,
        Token pool,
        uint256 tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256);

    /**
     * @dev deposits liquidity by providing an EIP712 typed signature for an EIP2612 permit request and returns the
     * respective pool token amount
     *
     * requirements:
     *
     * - the caller must have provided a valid and unused EIP712 typed signature
     */
    function depositPermitted(
        Token pool,
        uint256 tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256);

    /**
     * @dev initiates liquidity withdrawal
     *
     * requirements:
     *
     * - the caller must have approved the contract to transfer the pool token amount on its behalf
     */
    // function initWithdrawal(IPoolToken poolToken, uint256 poolTokenAmount) external returns (uint256);

    /**
     * @dev initiates liquidity withdrawal by providing an EIP712 typed signature for an EIP2612 permit request
     *
     * requirements:
     *
     * - the caller must have provided a valid and unused EIP712 typed signature
     */
    // function initWithdrawalPermitted(
    //     IPoolToken poolToken,
    //     uint256 poolTokenAmount,
    //     uint256 deadline,
    //     uint8 v,
    //     bytes32 r,
    //     bytes32 s
    // ) external returns (uint256);

    /**
     * @dev cancels a withdrawal request, and returns the number of pool token amount associated with the withdrawal
     * request
     *
     * requirements:
     *
     * - the caller must have already initiated a withdrawal and received the specified id
     */
    function cancelWithdrawal(uint256 id) external returns (uint256);

    /**
     * @dev withdraws liquidity and returns the withdrawn amount
     *
     * requirements:
     *
     * - the provider must have already initiated a withdrawal and received the specified id
     * - the specified withdrawal request is eligible for completion
     * - the provider must have approved the network to transfer vBNT amount on its behalf, when withdrawing BNT
     * liquidity
     */
    function withdraw(uint256 id) external returns (uint256);

    /**
     * @dev performs a trade by providing the input source amount, and returns the trade target amount
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the source tokens on its behalf (except for in the
     *   native token case)
     */
    function tradeBySourceAmount(
        Token sourceToken,
        Token targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount,
        uint256 deadline,
        address beneficiary
    ) external payable returns (uint256);

    /**
     * @dev performs a trade by providing the input source amount and providing an EIP712 typed signature for an
     * EIP2612 permit request, and returns the trade target amount
     *
     * requirements:
     *
     * - the caller must have provided a valid and unused EIP712 typed signature
     */
    function tradeBySourceAmountPermitted(
        Token sourceToken,
        Token targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount,
        uint256 deadline,
        address beneficiary,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256);

    /**
     * @dev performs a trade by providing the output target amount, and returns the trade source amount
     *
     * requirements:
     *
     * - the caller must have approved the network to transfer the source tokens on its behalf (except for in the
     *   native token case)
     */
    function tradeByTargetAmount(
        Token sourceToken,
        Token targetToken,
        uint256 targetAmount,
        uint256 maxSourceAmount,
        uint256 deadline,
        address beneficiary
    ) external payable returns (uint256);

    /**
     * @dev performs a trade by providing the output target amount and providing an EIP712 typed signature for an
     * EIP2612 permit request and returns the target amount and fee, and returns the trade source amount
     *
     * requirements:
     *
     * - the caller must have provided a valid and unused EIP712 typed signature
     */
    function tradeByTargetAmountPermitted(
        Token sourceToken,
        Token targetToken,
        uint256 targetAmount,
        uint256 maxSourceAmount,
        uint256 deadline,
        address beneficiary,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256);

    /**
     * @dev provides a flash-loan
     *
     * requirements:
     *
     * - the recipient's callback must return *at least* the borrowed amount and 
     * fee back to the specified return address
     */
    function flashLoan(
        Token token,
        uint256 amount,
        IFlashLoanRecipient recipient,
        bytes calldata data
    ) external;

    /**
     * @dev deposits liquidity during a migration
     */
    function migrateLiquidity(
        Token token,
        address provider,
        uint256 amount,
        uint256 availableAmount,
        uint256 originalAmount
    ) external payable;

    /**
     * @dev withdraws pending network fees, and returns the amount of fees withdrawn
     *
     * requirements:
     *
     * - the caller must have the ROLE_NETWORK_FEE_MANAGER privilege
     */
    function withdrawNetworkFees(address recipient) external returns (uint256);
}


struct Rewards {
    uint32 lastUpdateTime;
    uint256 rewardPerToken;
}

// struct ProgramData {
//     uint256 id;
//     Token pool;
//     IPoolToken poolToken;
//     Token rewardsToken;
//     bool isEnabled;
//     uint32 startTime;
//     uint32 endTime;
//     uint256 rewardRate;
//     uint256 remainingRewards;
// }

struct ProviderRewards {
    uint256 rewardPerTokenPaid;
    uint256 pendingRewards;
    uint256 reserved0;
    uint256 stakedAmount;
}

struct StakeAmounts {
    uint256 stakedRewardAmount;
    uint256 poolTokenAmount;
}

interface IStandardRewards is IUpgradeable {
    /**
     * @dev returns all program ids
     */
    // function programIds() external view returns (uint256[] memory);

    /**
     * @dev returns program data for each specified program id
     */
    // function programs(uint256[] calldata ids) external view returns (ProgramData[] memory);

    /**
     * @dev returns all the program ids that the provider participates in
     */
    // function providerProgramIds(address provider) external view returns (uint256[] memory);

    /**
     * @dev returns program rewards
     */
    // function programRewards(uint256 id) external view returns (Rewards memory);

    /**
     * @dev returns provider rewards
     */
    // function providerRewards(address provider, uint256 id) external view returns (ProviderRewards memory);

    /**
     * @dev returns the total staked amount in a specific program
     */
    // function programStake(uint256 id) external view returns (uint256);

    /**
     * @dev returns the total staked amount of a specific provider in a specific program
     */
    // function providerStake(address provider, uint256 id) external view returns (uint256);

    /**
     * @dev returns whether the specified program is active
     */
    // function isProgramActive(uint256 id) external view returns (bool);

    /**
     * @dev returns whether the specified program is enabled
     */
    // function isProgramEnabled(uint256 id) external view returns (bool);

    /**
     * @dev returns the ID of the latest program for a given pool (or 0 if no program is currently set)
     */
    // function latestProgramId(Token pool) external view returns (uint256);

    /**
     * @dev creates a program for a pool and returns its ID
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - the pool must not have an active program
     * - if the rewards token isn't the BNT token, then the rewards must have been deposited to the rewards vault
     */
    // function createProgram(
    //     Token pool,
    //     Token rewardsToken,
    //     uint256 totalRewards,
    //     uint32 startTime,
    //     uint32 endTime
    // ) external returns (uint256);

    /**
     * @dev terminates a rewards program
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - the program must exist and be the active program for its pool
     */
    // function terminateProgram(uint256 id) external;

    /**
     * @dev enables or disables a program
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    // function enableProgram(uint256 id, bool status) external;

    /**
     * @dev adds a provider to the program
     *
     * requirements:
     *
     * - the caller must have approved the contract to transfer pool tokens on its behalf
     */
    // function join(uint256 id, uint256 poolTokenAmount) external;

    /**
     * @dev adds provider's stake to the program by providing an EIP712 typed signature for an EIP2612 permit request
     *
     * requirements:
     *
     * - the caller must have specified a valid and unused EIP712 typed signature
     */
    // function joinPermitted(
    //     uint256 id,
    //     uint256 poolTokenAmount,
    //     uint256 deadline,
    //     uint8 v,
    //     bytes32 r,
    //     bytes32 s
    // ) external;

    /**
     * @dev removes (some of) provider's stake from the program
     *
     * requirements:
     *
     * - the caller must have specified a valid and unused EIP712 typed signature
     */
    // function leave(uint256 id, uint256 poolTokenAmount) external;

    /**
     * @dev deposits and adds provider's stake to the program
     *
     * requirements:
     *
     * - the caller must have approved the network contract to transfer the tokens its behalf (except for in the
     *   native token case)
     */
    function depositAndJoin(uint256 id, uint256 tokenAmount) external payable;

    /**
     * @dev deposits and adds provider's stake to the program by providing an EIP712 typed signature for an EIP2612
     * permit request
     *
     * requirements:
     *
     * - the caller must have specified a valid and unused EIP712 typed signature
     */
    // function depositAndJoinPermitted(
    //     uint256 id,
    //     uint256 tokenAmount,
    //     uint256 deadline,
    //     uint8 v,
    //     bytes32 r,
    //     bytes32 s
    // ) external;

    /**
     * @dev returns provider's pending rewards
     *
     * requirements:
     *
     * - the specified program ids array needs to consist from unique and existing program ids with the same reward
     *   token
     */
    // function pendingRewards(address provider, uint256[] calldata ids) external view returns (uint256);

    /**
     * @dev claims rewards and returns the claimed reward amount
     */
    // function claimRewards(uint256[] calldata ids) external returns (uint256);

    /**
     * @dev claims and stake rewards and returns the claimed reward amount and the received pool token amount
     *
     * requirements:
     *
     * - the specified program ids array needs to consist from unique and existing program ids with the same reward
     *   token
     * - the rewards token must have been whitelisted with an existing pool
     */
    // function stakeRewards(uint256[] calldata ids) external returns (StakeAmounts memory);
}