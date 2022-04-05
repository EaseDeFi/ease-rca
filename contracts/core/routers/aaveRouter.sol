/// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../interfaces/IRouter.sol";
import "../../interfaces/IUniswap.sol";
import "../../interfaces/IRcaShield.sol";
import "../../external/Aave.sol";

contract AaveRouter is IRouter {
    IAToken immutable aToken;
    IERC20 immutable baseToken;
    IUniswapV2Router02 immutable router;
    IRcaShield immutable shield;

    constructor(
        address _aToken,
        address _baseToken,
        address _router,
        address _shield
    ) {
        aToken = IAToken(_aToken);
        baseToken = IERC20(_baseToken);
        router = IUniswapV2Router02(_router);
        shield = IRcaShield(_shield);
    }

    function routeTo(
        address user,
        uint256 uAmount,
        bytes calldata data
    ) external override {
        // TODO: do I need this check at all?
        require(aToken.balanceOf(address(this)) > uAmount, "did you transfer enough aToken anon?");
        (address tokenOut, uint256 amountOutMin, uint256 deadline) = abi.decode(data, (address, uint256, uint256));

        if (tokenOut != address(baseToken)) {
            // TODO: swap using uniswap anon
        } else {
            // TODO: transfer tokenOut to the user
            // But should we check things before so that we can directly transfer tokens to the user?
            address tokenIn = address(baseToken);
            uint256 amountIn = baseToken.balanceOf(address(this));
            address[] memory path = new address[](2);
            path[0] = tokenIn;
            path[1] = tokenIn;
            // Assuming that pair always exist
            router.swapExactTokensForTokens(amountIn, amountOutMin, path, user, deadline);
        }
    }

    // Question: Do we need zap consumer? If yes then how will this function change?
    function zapIn(address user, bytes calldata data) external payable {
        // But do we really need this check as function calls in between may fail if we don't send enough eth?
        require(msg.value > 0, "send some eth anon");
        // 1. swap eth to desired token
        // Question: Can we use _expiry for deadline?
        (
            uint256 amountOut,
            uint256 deadline,
            address _referrer,
            uint256 _expiry,
            uint8 _v,
            bytes32 _r,
            bytes32 _s,
            uint256 _newCumLiqForClaims,
            bytes32[] memory _liqForClaimsProof
        ) = abi.decode(data, (uint256, uint256, address, uint256, uint8, bytes32, bytes32, uint256, bytes32[]));
        address[] memory path = new address[](2);
        path[0] = address(0);
        path[1] = address(baseToken);
        uint256 balanceBefore = aToken.balanceOf(address(this));

        router.swapETHForExactTokens{ value: msg.value }(amountOut, path, address(this), deadline);
        uint256 _uAmount = aToken.balanceOf(address(this)) - balanceBefore;
        // 2. deposit to a desired pool/vault
        baseToken.approve(address(aToken), _uAmount);
        // Question: what should be the index here? 0?
        // DEPOSIT A token
        aToken.mint(address(this), _uAmount, 0);

        // 3. and mint an rca against it
        shield.mintTo(user, _referrer, _uAmount, _expiry, _v, _r, _s, _newCumLiqForClaims, _liqForClaimsProof);
    }
}
