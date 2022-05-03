/// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/IRouter.sol";
import "../../interfaces/IUniswap.sol";
import "../../interfaces/IRcaShield.sol";
import "../../interfaces/IWeth.sol";
import "../../external/Aave.sol";

// TODO: remove this on prod
import "hardhat/console.sol";

contract AaveRouter is IRouter {
    using SafeERC20 for IERC20;
    using SafeERC20 for IAToken;

    IUniswapV2Router02 private immutable router;
    ILendingPool private immutable lendingPool;

    IWETH private immutable weth = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    // user address to send returned eth when calling swapEthForExactTokens
    address private _currentUser;

    struct MintToArgs {
        address user;
        address referrer;
        uint256 uAmount;
        uint256 expiry;
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 newCumLiqForClaims;
        bytes32[] liqForClaimsProof;
    }
    struct SwapInArgs {
        bool shouldSwap; // needed for zapping with base token
        address tokenOut; // shield base token
        uint256 amountOutMin; // exact expected amount on token swap from uniswap router
        uint256 deadline;
    }
    struct SwapOutArgs {
        bool inEth; // need to check if user wants to zapOut in ETH
        address tokenOut; // needed for zapping out
        uint256 amountOutMin; // exact expected amount on token swap from uniswap router
        uint256 deadline;
    }
    struct ShieldArgs {
        address shield; // rca shield address
        address uToken; // aTokens
        address baseToken; // tokens against which aTokens are minted
    }

    constructor(address _router, address _lendingPool) {
        router = IUniswapV2Router02(_router);
        lendingPool = ILendingPool(_lendingPool);
    }

    function routeTo(
        address user,
        // initially this field was for uAmount but seems unnecessary now
        uint256 amount,
        bytes calldata data
    ) external override {
        (ShieldArgs memory shieldArgs, SwapOutArgs memory swapArgs) = abi.decode(data, ((ShieldArgs), (SwapOutArgs)));

        if (swapArgs.tokenOut == shieldArgs.baseToken && !swapArgs.inEth) {
            lendingPool.withdraw(shieldArgs.baseToken, amount, user);
        } else {
            lendingPool.withdraw(shieldArgs.baseToken, amount, address(this));
            uint256 amountIn = IERC20(shieldArgs.baseToken).balanceOf(address(this));
            address[] memory path = new address[](2);
            path[0] = shieldArgs.baseToken;
            path[1] = swapArgs.tokenOut;
            IERC20(shieldArgs.baseToken).safeIncreaseAllowance(address(router), amountIn);
            if (swapArgs.inEth) {
                if (shieldArgs.baseToken == address(weth)) {
                    // don't need token swaps just unwrap eth and transfer to user
                    weth.withdraw(amount);
                    payable(user).transfer(amount);
                } else {
                    // swap exactTokenForEth
                    router.swapExactTokensForETH(amountIn, swapArgs.amountOutMin, path, user, swapArgs.deadline);
                }
            } else {
                // swap exactTokenForTokens
                router.swapExactTokensForTokens(amountIn, swapArgs.amountOutMin, path, user, swapArgs.deadline);
            }
        }
    }

    function zapIn(bytes calldata data) external payable {
        (ShieldArgs memory shieldArgs, SwapInArgs memory swapArgs, MintToArgs memory mintArgs) = abi.decode(
            data,
            ((ShieldArgs), (SwapInArgs), (MintToArgs))
        );
        if (swapArgs.shouldSwap) {
            // 1. swap eth to desired token
            if (shieldArgs.baseToken == address(weth)) {
                // don't need token swaps just wrap eth
                weth.deposit{ value: msg.value }();
            } else {
                // do a tokenSwap to desired currency
                address[] memory path = new address[](2);
                path[0] = address(weth);
                path[1] = swapArgs.tokenOut;

                // swapping eth for exact tokens so that we don't run into invalid capacity sig error
                _currentUser = msg.sender;
                router.swapETHForExactTokens{ value: msg.value }(
                    swapArgs.amountOutMin,
                    path,
                    address(this),
                    swapArgs.deadline
                );
                _currentUser = address(0);
            }
        } else {
            // user is trying to use baseToken of his wallet
            IERC20(shieldArgs.baseToken).transferFrom(msg.sender, address(this), swapArgs.amountOutMin);
        }

        IERC20(shieldArgs.baseToken).approve(address(lendingPool), swapArgs.amountOutMin);
        // deposit to a desired pool/vault
        lendingPool.deposit(shieldArgs.baseToken, swapArgs.amountOutMin, address(this), 0);

        // mint rca
        IAToken(shieldArgs.uToken).approve(shieldArgs.shield, swapArgs.amountOutMin);

        IRcaShield(shieldArgs.shield).mintTo(
            mintArgs.user,
            mintArgs.referrer,
            mintArgs.uAmount,
            mintArgs.expiry,
            mintArgs.v,
            mintArgs.r,
            mintArgs.s,
            mintArgs.newCumLiqForClaims,
            mintArgs.liqForClaimsProof
        );
    }

    receive() external payable {
        // transfer eth returned by swapEthForExactTokens to the caller
        if (_currentUser != address(0)) {
            payable(_currentUser).transfer(msg.value);
        }
    }
}
