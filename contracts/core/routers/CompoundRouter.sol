/// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../interfaces/IRouter.sol";
import "../../interfaces/IUniswap.sol";
import "../../interfaces/IRcaShield.sol";
import "../../interfaces/IWeth.sol";
import "../../external/Compound.sol";

// TODO: remove this on prod
import "hardhat/console.sol";

contract CompoundRouter is IRouter {
    // TODO: Do I need tokens at all? or addresses are enough?
    uint256 immutable BUFFER = 10**18;
    uint256 immutable CTOKEN_BUFFER;
    ICToken public immutable cToken;
    IERC20 public immutable baseToken;
    IUniswapV2Router02 public immutable router;
    IRcaShield public immutable shield;
    IWETH public immutable weth = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    // TODO: Should I care about packing this struct?
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
        address _cToken,
        uint8 _cTokenDecimals,
        address _baseToken,
        address _router,
        address _shield
    ) {
        cToken = ICToken(_cToken);
        CTOKEN_BUFFER = 10**_cTokenDecimals;
        baseToken = IERC20(_baseToken);
        router = IUniswapV2Router02(_router);
        shield = IRcaShield(_shield);
        baseToken.approve(_router, type(uint256).max);
        baseToken.approve(_cToken, type(uint256).max);
        cToken.approve(_shield, type(uint256).max);
    }

    function routeTo(
        address user,
        uint256,
        bytes calldata data
    ) external override {
        (address tokenOut, uint256 amountOutMin, uint256 deadline, bool inEth) = abi.decode(
            data,
            (address, uint256, uint256, bool)
        );

        // using balance of router address sweeps extra units we get using zapIn
        uint256 amount = cToken.balanceOf(address(this));
        // TODO: should i require cToken return value on redeem?
        if (tokenOut == address(baseToken)) {
            cToken.redeem(amount);
            baseToken.transfer(user, baseToken.balanceOf(address(this)));
        } else {
            cToken.redeem(amount);
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
        // TODO: do i need a require here?
    }

    function zapIn(address user, bytes calldata data) external payable {
        // But do we really need this check as function calls in between may fail if we don't send enough eth?
        require(msg.value != 0, "msg.value should not be zero");
        // 1. swap eth to desired token
        // Question: Can we use _expiry for deadline?
        (uint256 uAmount, uint256 amountOut, MintToArgs memory args) = abi.decode(
            data,
            (uint256, uint256, (MintToArgs))
        );
        // do a tokenSwap to desired currency
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(baseToken);

        // swapping eth for exact tokens so that we don't run into invalid capacity sig error
        _currentUser = msg.sender;
        router.swapETHForExactTokens{ value: msg.value }(amountOut, path, address(this), args.expiry);
        _currentUser = address(0);
        // deposit to a desired pool/vault
        // TODO: should i require cToken return value on mint?
        cToken.mint(amountOut);

        // mint rca
        // normalizing amountOut because RCA's assume all tokens as 18 decimals
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
        // TODO: do i need a require here?
    }

    receive() external payable {
        // Using recieve here because swapEthForExactTokens returns extra eth to the caller
        require(_currentUser != address(0), "can't recieve ether");
        payable(_currentUser).transfer(msg.value);
    }
}
