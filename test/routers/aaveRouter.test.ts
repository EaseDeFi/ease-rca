import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import hre, { ethers } from "hardhat";
import { BigNumber } from "ethers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { parseUnits } from "ethers/lib/utils";

import BalanceTree from "../balance-tree";
import {
  ether,
  getExpectedRcaValue,
  getSignatureDetailsFromCapOracle,
  getTimestamp,
  increase,
  resetBlockchain,
} from "../utils";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "../constants";
import type { Contracts, MerkleProofs, MerkleTrees, Routers, Signers } from "../types";

import type { RcaShieldAave } from "../../src/types/RcaShieldAave";
import type { MockERC20 } from "../../src/types/MockERC20";
import type { RcaController } from "../../src/types/RcaController";
import type { RcaTreasury } from "../../src/types/RcaTreasury";
import type { AaveRouter } from "../../src/types/AaveRouter";
import type { IUniswapV2Router02 } from "../../src/types/IUniswapV2Router02";

// Factories
import type { RcaShieldAave__factory } from "../../src/types/factories/RcaShieldAave__factory";
import type { RcaController__factory } from "../../src/types/factories/RcaController__factory";
import type { RcaTreasury__factory } from "../../src/types/factories/RcaTreasury__factory";
import type { AaveRouter__factory } from "../../src/types/factories/AaveRouter__factory";

describe("AaveRouter:aUSDC", function () {
  const signers = {} as Signers;
  const contracts = {} as Contracts;
  const merkleTrees = {} as MerkleTrees;
  const merkleProofs = {} as MerkleProofs;
  // make routers empty objects so that they won't be undefined
  contracts.routers = {} as Routers;
  //  local tokens
  let usdcToken: MockERC20;
  let weth: MockERC20;
  let uniswapRouterV2: IUniswapV2Router02;
  before(async function () {
    await resetBlockchain();
  });

  beforeEach(async function () {
    const _signers: SignerWithAddress[] = await ethers.getSigners();
    signers.user = _signers[0];
    signers.gov = _signers[1];
    signers.notGov = _signers[2];
    signers.guardian = _signers[3];
    signers.priceOracle = _signers[4];
    signers.capOracle = _signers[5];
    signers.referrer = _signers[6];
    signers.otherAccounts = _signers.slice(7);
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.aUSDCWhale]);
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.aUSDCWhale);

    // transfer eth to impersonated accounts for enough eth to cover gas
    await signers.otherAccounts[0].sendTransaction({ to: signers.user.address, value: ether("1000") });

    // load mainnet contracts
    contracts.uToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.aave.aUSDC);

    usdcToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.tokens.usdc);
    weth = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.tokens.weth);
    uniswapRouterV2 = <IUniswapV2Router02>(
      await ethers.getContractAt("IUniswapV2Router02", MAINNET_ADDRESSES.contracts.uniswap.routerV2)
    );
    const rcaShieldAaveFactory = <RcaShieldAave__factory>await ethers.getContractFactory("RcaShieldAave");
    const rcaControllerFactory = <RcaController__factory>await ethers.getContractFactory("RcaController");
    const rcaTreasuryFactory = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");
    const aaveRouterFactory = <AaveRouter__factory>await ethers.getContractFactory("AaveRouter");

    contracts.rcaTreasury = <RcaTreasury>await rcaTreasuryFactory.deploy(signers.gov.address);
    // Wait for contract to get deployed
    await contracts.rcaTreasury.deployed();

    contracts.rcaController = <RcaController>(
      await rcaControllerFactory.deploy(
        signers.gov.address,
        signers.guardian.address,
        signers.priceOracle.address,
        signers.capOracle.address,
        0,
        0,
        TIME_IN_SECS.day,
        contracts.rcaTreasury.address,
      )
    );
    // Wait for contract to get deployed
    await contracts.rcaController.deployed();

    contracts.rcaShieldAave = <RcaShieldAave>(
      await rcaShieldAaveFactory.deploy(
        "rcaAave Shield",
        "rcaAave",
        contracts.uToken.address,
        await contracts.uToken.decimals(),
        signers.gov.address,
        contracts.rcaController.address,
        MAINNET_ADDRESSES.contracts.aave.incentivesController,
      )
    );
    // Wait for contract to get deployed
    await contracts.rcaShieldAave.deployed();

    // initialize aaveShield
    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldAave.address);

    // initialize aave router
    contracts.routers.aaveRouter = <AaveRouter>(
      await aaveRouterFactory.deploy(
        MAINNET_ADDRESSES.contracts.uniswap.routerV2,
        MAINNET_ADDRESSES.contracts.aave.lendingPool,
      )
    );
    await contracts.routers.aaveRouter.deployed();
    // TODO: whitelist router
    await contracts.rcaController
      .connect(signers.guardian)
      .setRouterVerified(contracts.routers.aaveRouter.address, true);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldAave.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);

    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShieldAave.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
    ]);
    // merkleProofs
    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldAave.address, ether("100"));
    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());

    // allowance
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldAave.address, ether("100000"));
    await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShieldAave.address, ether("100000"));
  });

  describe("Initialize", function () {
    it("should intialize the shield with valid state", async function () {
      expect(await contracts.routers.aaveRouter.router()).to.equal(MAINNET_ADDRESSES.contracts.uniswap.routerV2);
      expect(await contracts.routers.aaveRouter.lendingPool()).to.equal(MAINNET_ADDRESSES.contracts.aave.lendingPool);
    });
  });
  describe("zapIn()", function () {
    it("should allow the user to zap in", async function () {
      //   mint RCA and check for shields uToken balance
      const userAddress = signers.user.address;
      const shieldAddress = contracts.rcaShieldAave.address;
      const uTokenAddress = contracts.uToken.address;
      const baseTokenAddress = MAINNET_ADDRESSES.tokens.usdc;
      const uAmount = parseUnits("1000", 6);
      const uAmountForShield = ether("1000");
      // returns: expiry, vInt, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmountForShield,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldAave.address,
      });
      const expectedRcaValue = await getExpectedRcaValue({
        rcaShield: contracts.rcaShieldAave,
        uToken: contracts.uToken,
        uAmountForRcaValue: uAmountForShield,
        newCumLiqForClaims: BigNumber.from(0),
      });
      const userRcaBalBefore = await contracts.rcaShieldAave.balanceOf(userAddress);
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];
      const shouldSwap = true;
      const inEth = false;
      const tokenOut = ethers.constants.AddressZero;
      const swapArgs = [shouldSwap, inEth, tokenOut, uAmount, sigValues.expiry];
      const mintToArgs = [
        userAddress,
        signers.referrer.address,
        expectedRcaValue,
        sigValues.expiry,
        sigValues.vInt,
        sigValues.r,
        sigValues.s,
        0,
        merkleProofs.liqProof1,
      ];
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        [
          "tuple(address, address, address)", // shieldArgs(shieldAddress, uToken, baseToken)
          "tuple(bool, bool, address, uint256, uint256)", // swapArgs(shouldSwap, amountOut)
          "tuple(address, address, uint256, uint256, uint8, bytes32, bytes32, uint256, bytes32[])", // mintToArgs
        ],
        [shieldArgs, swapArgs, mintToArgs],
      );
      const amtEthToZap = (await uniswapRouterV2.getAmountsIn(uAmount, [weth.address, usdcToken.address]))[0];
      await contracts.routers.aaveRouter.connect(signers.user).zapIn(zapArgs, { value: amtEthToZap });

      const userRcaBalAfter = await contracts.rcaShieldAave.balanceOf(userAddress);

      expect(userRcaBalAfter.sub(userRcaBalBefore)).to.be.equal(expectedRcaValue);
    });
  });
  describe("routeTo()", function () {
    it("should allow user to route and recieve exact usdc", async function () {
      const uAmount = parseUnits("100", 6);
      const routerAddress = contracts.routers.aaveRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, uAmount);

      const userUSDCBalBefore = await usdcToken.balanceOf(userAddress);
      const deadline = (await getTimestamp()).add(100);
      // TODO: update this later *fetch using uniswap*
      // Shield args
      const shieldAddress = contracts.rcaShieldAave.address;
      const uTokenAddress = contracts.uToken.address;
      const baseTokenAddress = usdcToken.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];

      // Swap Args
      const amountOutMin = uAmount;
      const tokenOut = usdcToken.address;
      const inEth = false;
      const shouldSwap = false;
      const swapArgs = [shouldSwap, inEth, tokenOut, amountOutMin, deadline];
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["tuple(address, address, address)", "tuple(bool, bool, address, uint256, uint256)"],
        [shieldArgs, swapArgs],
      );
      await contracts.routers.aaveRouter.routeTo(userAddress, uAmount, zapArgs);
      //check usdc balances
      const userUSDCBalAfter = await usdcToken.balanceOf(userAddress);
      expect(userUSDCBalAfter.sub(userUSDCBalBefore)).to.be.gte(amountOutMin);
    });
    it("should allow user to route and recieve wrapped eth", async function () {
      const uAmount = parseUnits("100", 6);
      const routerAddress = contracts.routers.aaveRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, uAmount);

      const userWethBalBefore = await weth.balanceOf(userAddress);
      const deadline = (await getTimestamp()).add(100);
      // Shield args
      const shieldAddress = contracts.rcaShieldAave.address;
      const uTokenAddress = contracts.uToken.address;
      const baseTokenAddress = usdcToken.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];

      // SWAP args
      const amountsOut = await uniswapRouterV2.getAmountsOut(uAmount, [usdcToken.address, weth.address]);
      // desired minimum weth in return
      const amountOutMin = amountsOut[1];
      const tokenOut = weth.address;
      const inEth = false;
      const shouldSwap = false;
      const swapArgs = [shouldSwap, inEth, tokenOut, amountOutMin, deadline];

      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["tuple(address, address, address)", "tuple(bool, bool, address, uint256, uint256)"],
        [shieldArgs, swapArgs],
      );

      await contracts.routers.aaveRouter.routeTo(userAddress, uAmount, zapArgs);
      //check weth balances
      const userWethBalAfter = await weth.balanceOf(userAddress);
      expect(userWethBalAfter.sub(userWethBalBefore)).to.be.gte(amountOutMin);
    });
    it("should allow user to route and recieve eth", async function () {
      const uAmount = parseUnits("100", 6);
      const routerAddress = contracts.routers.aaveRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, uAmount);

      const userEthBalBefore = await ethers.provider.getBalance(userAddress);
      // Shield args
      const shieldAddress = contracts.rcaShieldAave.address;
      const uTokenAddress = contracts.uToken.address;
      const baseTokenAddress = usdcToken.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];
      // SWAP args
      const deadline = (await getTimestamp()).add(100);
      const amountsOut = await uniswapRouterV2.getAmountsOut(uAmount, [usdcToken.address, weth.address]);
      // desired minimum ETH in return
      const amountOutMin = amountsOut[1];
      const tokenOut = weth.address;
      const inEth = true;
      const shouldSwap = false;
      const swapArgs = [shouldSwap, inEth, tokenOut, amountOutMin, deadline];

      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["tuple(address, address, address)", "tuple(bool, bool, address, uint256, uint256)"],
        [shieldArgs, swapArgs],
      );

      await contracts.routers.aaveRouter.routeTo(userAddress, uAmount, zapArgs);
      //check weth balances
      const userEthBalAfter = await ethers.provider.getBalance(userAddress);
      expect(userEthBalAfter.sub(userEthBalBefore)).to.be.gte(amountOutMin);
    });
    it("should allow user to recieve desired token while redeeming rca's", async function () {
      const shieldAddress = contracts.rcaShieldAave.address;
      await contracts.uToken.connect(signers.user).approve(shieldAddress, ether("1000"));
      const uAmount = ether("100");
      const userAddress = signers.user.address;
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: shieldAddress,
      });
      await contracts.rcaShieldAave
        .connect(signers.user)
        .mintTo(
          signers.user.address,
          signers.referrer.address,
          uAmount,
          sigValues.expiry,
          sigValues.vInt,
          sigValues.r,
          sigValues.s,
          0,
          [],
        );
      await contracts.rcaShieldAave.connect(signers.user).redeemRequest(ether("100"), 0, [], 0, []);

      // A bit more than 1 day withdrawal
      await increase(86500);

      const routerAddress = contracts.routers.aaveRouter.address;

      // Shield args
      const uTokenAddress = contracts.uToken.address;
      const baseTokenAddress = usdcToken.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];
      // Swap Args
      const deadline = (await getTimestamp()).add(TIME_IN_SECS.halfYear);
      const amountsOut = await uniswapRouterV2.getAmountsOut(
        uAmount.mul(BigNumber.from(10).pow(await contracts.uToken.decimals())).div(BigNumber.from(10).pow(18)),
        [usdcToken.address, weth.address],
      );
      // desired minimum WETH in return
      const amountOutMin = amountsOut[1];
      const tokenOut = weth.address;
      const inEth = false;
      const shouldSwap = false;

      const swapArgs = [shouldSwap, inEth, tokenOut, amountOutMin, deadline];
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["tuple(address, address, address)", "tuple(bool, bool, address, uint256, uint256)"],
        [shieldArgs, swapArgs],
      );
      const userWethBalBefore = await weth.balanceOf(userAddress);
      await contracts.rcaShieldAave.connect(signers.user).redeemFinalize(routerAddress, zapArgs, 0, [], 0, []);
      const userWethBalAfter = await weth.balanceOf(userAddress);

      expect(userWethBalAfter.sub(userWethBalBefore)).to.be.gte(amountOutMin);
    });
  });
});
