/// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.11;
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

/**
 * @title RCA Ranking
 * @notice RCA Ranking simply holds tokens that signify how much a protocol is trusted.
 * These tokens are never spent, used, invested, or anything. The funds deposited simply
 * signify the emphasis users/protocols put on the safety of the protocol.
 * The amount of staked tokens here determines how much each vault/protocol needs to payout.
 * @author Robert M.C. Forster
 */
contract RcaRanking {
    using SafeERC20 for IERC20;

    /// @notice Ease/Armor token address
    IERC20 public token;
    /// @notice Amount of ARMOR tokens "staked" on each protocol.
    mapping (uint256 => uint256) public ranks;
    /// @notice Balances of each address that has staked in a protocol (protocol => user => amount).
    mapping (uint256 => mapping (address => uint256) ) public balances;

    /// @notice Notification of a stake.
    event Stake(
        uint256 indexed protocol, 
        address indexed user,
        uint256 amount,
        uint256 newTotal
    );
    /// @notice Notification of an unstake..
    event Unstake(
        uint256 indexed protocol, 
        address indexed user,
        uint256 amount,
        uint256 newTotal
    );

    /**
     * @notice Initialize contract with staking token (which will be the Ease/Armor protocol token).
     * @param _token Address of the staking token.
     */
    constructor(
        address _token
    )
    {
        token = IERC20(_token);
    }

    /**
     * @notice Stake an amount of tokens on a protocol.
     * @param _protocol Unique identifier of the protocol to stake for.
     * @param _amount Amount of tokens to stake on the protocol.
     */
    function stake(
        uint256 _protocol,
        uint256 _amount
    )
      external
    {
        token.safeTransferFrom(msg.sender, address(this), _amount);
        ranks[_protocol] += _amount;
        balances[_protocol][msg.sender] += _amount;

        emit Stake(
            _protocol,
            msg.sender,
            _amount,
            ranks[_protocol]
        );
    }

    /**
     * @notice Remove your staking from a protocol.
     * @param _protocol Unique identifier of the protocol to unstake from.
     * @param _amount Amount of tokens to unstake from the protocol.
     */
    function unstake(
        uint256 _protocol,
        uint256 _amount
    )
      external
    {
        ranks[_protocol] -= _amount;
        balances[_protocol][msg.sender] -= _amount;
        token.safeTransfer(msg.sender, _amount);

        emit Unstake(
            _protocol,
            msg.sender,
            _amount,
            ranks[_protocol]
        );
    }

}