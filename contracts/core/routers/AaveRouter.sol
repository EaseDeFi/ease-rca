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

    IUniswapV2Router02 public immutable router;
    ILendingPool public immutable lendingPool;

    IWETH public immutable weth = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    // user address to send returned eth when calling swapExactTokensForEth
    address _currentUser;

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
    struct SwapArgs {
        bool shouldSwap; // needed for zapping with base token
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
        uint256,
        bytes calldata data
    ) external override {
        (ShieldArgs memory shieldArgs, SwapArgs memory swapArgs) = abi.decode(data, ((ShieldArgs), (SwapArgs)));

        // using balance of router address sweeps extra units we get using zapIn
        uint256 amount = IAToken(shieldArgs.uToken).balanceOf(address(this));

        if (swapArgs.tokenOut == shieldArgs.baseToken) {
            lendingPool.withdraw(shieldArgs.baseToken, amount, user);
        } else {
            lendingPool.withdraw(shieldArgs.baseToken, amount, address(this));
            uint256 amountIn = IERC20(shieldArgs.baseToken).balanceOf(address(this));
            address[] memory path = new address[](2);
            path[0] = shieldArgs.baseToken;
            path[1] = swapArgs.tokenOut;
            IERC20(shieldArgs.baseToken).safeApprove(address(router), amountIn);
            if (swapArgs.inEth) {
                // swap exactTokenForEth
                router.swapExactTokensForETH(amountIn, swapArgs.amountOutMin, path, user, swapArgs.deadline);
            } else {
                // swap exactTokenForTokens
                router.swapExactTokensForTokens(amountIn, swapArgs.amountOutMin, path, user, swapArgs.deadline);
            }
        }
    }

    function zapIn(bytes calldata data) external payable {
        // 1. swap eth to desired token
        // Question: Can we use _expiry for deadline?
        (ShieldArgs memory shieldArgs, SwapArgs memory swapArgs, MintToArgs memory mintArgs) = abi.decode(
            data,
            ((ShieldArgs), (SwapArgs), (MintToArgs))
        );
        if (swapArgs.shouldSwap) {
            if (shieldArgs.baseToken == address(weth)) {
                // don't need token swaps just wrap eth
                weth.deposit{ value: msg.value }();
            } else {
                // do a tokenSwap to desired currency
                address[] memory path = new address[](2);
                path[0] = address(weth);
                path[1] = shieldArgs.baseToken;

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
            IERC20(shieldArgs.baseToken).safeTransferFrom(msg.sender, address(this), swapArgs.amountOutMin);
        }

        IAToken(shieldArgs.baseToken).safeApprove(address(lendingPool), swapArgs.amountOutMin);
        // deposit to a desired pool/vault
        lendingPool.deposit(shieldArgs.baseToken, swapArgs.amountOutMin, address(this), 0);

        // mint rca
        IAToken(shieldArgs.uToken).safeApprove(shieldArgs.shield, swapArgs.amountOutMin);

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
        // Using recieve here because swapEthForExactTokens returns extra eth to the caller
        require(_currentUser != address(0), "can't recieve ether");
        payable(_currentUser).transfer(msg.value);
    }
}
