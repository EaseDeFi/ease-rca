/// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.11;

import "../../interfaces/IRouter.sol";



contract OnsenRouter is IRouter {

    struct SwapOutArgs {
        bool inEth; // need to check if user wants to zapOut in ETH
        address tokenOut; // needed for zapping out
        uint256 amountOutMin; // exact expected amount on token swap from uniswap router
        uint256 deadline;
    }

    struct ShieldArgs {
        address shield; // rca shield address
        address uToken; // SLP Tokens
        address baseToken; // tokens against which aTokens are minted
    }

    function routeTo(
        address user,
        uint256 uAmount,
        bytes calldata data
    ) external override {
        (ShieldArgs memory shieldArgs, SwapOutArgs memory swapArgs) = abi.decode(data, ((ShieldArgs), (SwapOutArgs)));
    }
}