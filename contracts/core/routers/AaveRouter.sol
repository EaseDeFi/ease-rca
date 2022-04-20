/// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../interfaces/IRouter.sol";
import "../../interfaces/IUniswap.sol";
import "../../interfaces/IRcaShield.sol";
import "../../interfaces/IWeth.sol";
import "../../external/Aave.sol";

// TODO: remove this on prod
import "hardhat/console.sol";

contract AaveRouter is IRouter {
    uint256 immutable BUFFER = 10**18;
    uint256 immutable ATOKEN_BUFFER;
    IAToken public immutable aToken;
    IERC20 public immutable baseToken;
    IUniswapV2Router02 public immutable router;
    IRcaShield public immutable shield;
    ILendingPool public immutable lendingPool;
    IWETH public immutable weth = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address _currentUser;
    struct MintToArgs {
        address referrer;
        uint256 expiry;
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 newCumLiqForClaims;
        bytes32[] liqForClaimsProof;
    }

    constructor(
        address _aToken,
        uint8 _aTokenDecimals,
        address _baseToken,
        address _router,
        address _shield,
        address _lendingPool
    ) {
        aToken = IAToken(_aToken);
        ATOKEN_BUFFER = 10**_aTokenDecimals;
        baseToken = IERC20(_baseToken);
        router = IUniswapV2Router02(_router);
        shield = IRcaShield(_shield);
        lendingPool = ILendingPool(_lendingPool);
        baseToken.approve(_router, type(uint256).max);
        baseToken.approve(_lendingPool, type(uint256).max);
    }

    function routeTo(
        address user,
        // initially this field was for uAmount but seems unnecessary now
        uint256,
        bytes calldata data
    ) external override {
        (address tokenOut, uint256 amountOutMin, uint256 deadline, bool inEth) = abi.decode(
            data,
            (address, uint256, uint256, bool)
        );

        // using balance of router address sweeps extra units we get using zapIn
        uint256 amount = aToken.balanceOf(address(this));
        if (tokenOut == address(baseToken)) {
            lendingPool.withdraw(address(baseToken), amount, user);
        } else {
            lendingPool.withdraw(address(baseToken), amount, address(this));
            uint256 amountIn = baseToken.balanceOf(address(this));
            address[] memory path = new address[](2);
            path[0] = address(baseToken);
            path[1] = tokenOut;
            if (inEth) {
                // swap exactTokenForEth
                router.swapExactTokensForETH(amountIn, amountOutMin, path, user, deadline);
            } else {
                // swap exactTokenForTokens
                router.swapExactTokensForTokens(amountIn, amountOutMin, path, user, deadline);
            }
        }
    }

    function zapIn(address user, bytes calldata data) external payable {
        // But do we really need this check as function calls in between may fail if we don't send enough eth?
        require(msg.value > 0, "send some eth anon");
        // 1. swap eth to desired token
        // Question: Can we use _expiry for deadline?
        (uint256 amountOut, MintToArgs memory args) = abi.decode(data, (uint256, (MintToArgs)));
        if (address(baseToken) == address(weth)) {
            // don't need token swaps just wrap eth
            weth.deposit{ value: msg.value }();
        } else {
            // do a tokenSwap to desired currency
            address[] memory path = new address[](2);
            path[0] = address(weth);
            path[1] = address(baseToken);

            // swapping eth for exact tokens so that we don't run into invalid capacity sig error
            _currentUser = msg.sender;
            // uniswap sends 1 or 2 units more token on swap which stays in our zapper contract
            // TODO: do we need sweep function to cleanup the token balances?
            router.swapETHForExactTokens{ value: msg.value }(amountOut, path, address(this), args.expiry);
            _currentUser = address(0);
        }
        // deposit to a desired pool/vault
        lendingPool.deposit(address(baseToken), amountOut, address(this), 0);

        // mint an rca
        aToken.approve(address(shield), amountOut);
        // normalizing amountOut because RCA's assume all tokens as 18 decimals
        uint256 uAmount = (amountOut * BUFFER) / ATOKEN_BUFFER;
        shield.mintTo(
            user,
            args.referrer,
            uAmount,
            args.expiry,
            args.v,
            args.r,
            args.s,
            args.newCumLiqForClaims,
            args.liqForClaimsProof
        );
    }

    receive() external payable {
        // Using recieve here because swapEthForExactTokens returns extra eth to the caller
        require(_currentUser != address(0), "can't recieve ether");
        payable(_currentUser).transfer(msg.value);
    }
}
