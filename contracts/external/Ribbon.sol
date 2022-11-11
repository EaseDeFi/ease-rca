// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;

interface IRibbonVault {
    function initiateWithdraw(uint256 numShares) external;

    function stake(uint256 numShares) external;

    function maxRedeem() external;

    // onlyKeeper
    function setMinPrice(uint256 minPrice) external;

    // onlyKeeper nonReentrant
    function rollToNextOption() external;

    // nonReentrant
    function commitAndClose() external;

    function depositYieldToken(uint256 amount) external;

    function accountVaultBalance(address account) external view returns (uint256);

    function shares(address account) external view returns (uint256);

    /**
     * @notice Getter for returning the account's share balance split between account and vault holdings
     * @param account is the account to lookup share balance for
     * @return heldByAccount is the shares held by account
     * @return heldByVault is the shares held on the vault (unredeemedShares)
     */
    function shareBalances(address account) external view returns (uint256 heldByAccount, uint256 heldByVault);

    /**
     * @notice The price of a unit of share denominated in the `collateral`
     */
    function pricePerShare() external view returns (uint256);

    /**
     * @notice Returns the token decimals
     */
    function decimals() external view returns (uint8);

    function cap() external view returns (uint256);

    function totalPending() external view returns (uint256);

    /**
     * @notice Returns the vault's total balance, including the amounts locked into a short position
     * @return total balance of the vault, including the amounts locked in third party protocols
     */
    function totalBalance() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);
}

interface ILiquidityGauge {
    function balanceOf(address) external view returns (uint256);

    function deposit(
        uint256 _value,
        address _addr,
        bool _claim_rewards
    ) external;

    function withdraw(uint256 _value) external;

    function user_checkpoint(address addr) external returns (bool);
}

interface IStakingRewards {
    // Views
    function lastTimeRewardApplicable() external view returns (uint256);

    function rewardPerToken() external view returns (uint256);

    function earned(address account) external view returns (uint256);

    function getRewardForDuration() external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    // Mutative

    function notifyRewardAmount(uint256 reward) external;

    function stake(uint256 amount) external;

    function stakeFor(uint256 amount, address user) external;

    function withdraw(uint256 amount) external;

    function getReward() external;

    function exit() external;
}

interface IMinter {
    function update_mining_parameters() external;

    function start_epoch_time_write() external returns (uint256);

    function future_epoch_time_write() external returns (uint256);

    function mint(address gauge_addr) external;

    //   function mint_many ( address[8] gauge_addrs ) external;
    function mint_for(address gauge_addr, address _for) external;

    function toggle_approve_mint(address minting_user) external;

    function recover_balance(address _coin) external returns (bool);

    function commit_next_emission(uint256 _rate_per_week) external;

    function commit_transfer_emergency_return(address addr) external;

    function apply_transfer_emergency_return() external;

    function commit_transfer_ownership(address addr) external;

    function apply_transfer_ownership() external;

    function mining_epoch() external view returns (int128);

    function start_epoch_time() external view returns (uint256);

    function rate() external view returns (uint256);

    function committed_rate() external view returns (uint256);

    function is_start() external view returns (bool);

    function token() external view returns (address);

    function controller() external view returns (address);

    function minted(address arg0, address arg1) external view returns (uint256);

    function allowed_to_mint_for(address arg0, address arg1) external view returns (bool);

    function future_emergency_return() external view returns (address);

    function emergency_return() external view returns (address);

    function admin() external view returns (address);

    function future_admin() external view returns (address);
}
