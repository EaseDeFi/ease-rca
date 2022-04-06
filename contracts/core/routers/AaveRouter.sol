/// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../interfaces/IRouter.sol";
import "../../interfaces/IUniswap.sol";
import "../../interfaces/IRcaShield.sol";
import "../../external/Aave.sol";

// TODO: remove this on prod
import "hardhat/console.sol";

contract AaveRouter is IRouter {
    // TODO: Do I need tokens at all? or addresses are enough?
    uint256 BUFFER = 10**18;
    IAToken public immutable aToken;
    IERC20 public immutable baseToken;
    IUniswapV2Router02 public immutable router;
    IRcaShield public immutable shield;
    ILendingPool public immutable lendingPool;
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
        address _aToken,
        address _baseToken,
        address _router,
        address _shield,
        address _lendingPool
    ) {
        aToken = IAToken(_aToken);
        baseToken = IERC20(_baseToken);
        router = IUniswapV2Router02(_router);
        shield = IRcaShield(_shield);
        lendingPool = ILendingPool(_lendingPool);
    }

    function routeTo(
        address user,
        uint256 uAmount,
        bytes calldata data
    ) external override {
        // TODO: do I need this check at all?
        require(aToken.balanceOf(address(this)) > uAmount, "did you transfer enough aToken anon?");
        (address tokenOut, uint256 amountOutMin, uint256 deadline) = abi.decode(data, (address, uint256, uint256));

        if (tokenOut == address(baseToken)) {
            // TODO: check if baseToken is correct / should we use uToken?
            lendingPool.withdraw(address(baseToken), uAmount, user);
        } else {
            address tokenIn = address(baseToken);
            lendingPool.withdraw(tokenIn, uAmount, address(this));
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
        _currentUser = msg.sender;
        // 1. swap eth to desired token
        // Question: Can we use _expiry for deadline?
        (uint256 amountOut, MintToArgs memory args) = abi.decode(data, (uint256, (MintToArgs)));
        address[] memory path = new address[](2);
        path[0] = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
        path[1] = address(baseToken);

        // swapping eth for exact tokens so that we don't run into invalid capacity sig error
        // TODO: Uniswap you liar you never send exact tokens
        router.swapETHForExactTokens{ value: msg.value }(amountOut, path, address(this), args.expiry);
        uint256 _amount = baseToken.balanceOf(address(this));
        // 2. deposit to a desired pool/vault
        baseToken.approve(address(lendingPool), _amount);
        lendingPool.deposit(address(baseToken), _amount, address(this), 0);
        uint256 _uAmount = aToken.balanceOf(address(this));
        // TODO: remove this check after everything works
        // TODO: uncomment this, commenting now because uniswap returns amountOut+1
        // require(_uAmount == amountOut, "fix me dev, I am stuck");
        aToken.approve(address(shield), _uAmount);
        amountOut = (amountOut * BUFFER) / 10**aToken.decimals();
        // 3. and mint an rca against it
        shield.mintTo(
            user,
            args.referrer,
            amountOut,
            args.expiry,
            args.v,
            args.r,
            args.s,
            args.newCumLiqForClaims,
            args.liqForClaimsProof
        );
        _currentUser = address(0);
    }

    receive() external payable {
        //TODO: transfer eth to current user
        // Using recieve here because swapEthForExactTokens returns extra eth to the caller
        require(_currentUser != address(0), "can't recieve ether");
        payable(_currentUser).transfer(msg.value);
    }
}
