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
  getExpectedYvTokens,
  getSignatureDetailsFromCapOracle,
  getTimestamp,
  increase,
  resetBlockchain,
} from "../utils";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "../constants";
import type { Contracts, MerkleProofs, MerkleTrees, Routers, Signers } from "../types";

import type { MockERC20 } from "../../src/types/MockERC20";
import type { RcaController } from "../../src/types/RcaController";
import type { RcaTreasury } from "../../src/types/RcaTreasury";
import type { YearnRouter } from "../../src/types/YearnRouter";
import type { IYVault } from "../../src/types/IYVault";

// Factories
import type { RcaController__factory } from "../../src/types/factories/RcaController__factory";
import type { RcaTreasury__factory } from "../../src/types/factories/RcaTreasury__factory";
import type { YearnRouter__factory } from "../../src/types/factories/YearnRouter__factory";
import { RcaShieldNormalized__factory } from "../../src/types/factories/RcaShieldNormalized__factory";
import { RcaShieldNormalized } from "../../src/types/RcaShieldNormalized";

describe("YearnRouter:USDC", function () {
  const signers = {} as Signers;
  const contracts = {} as Contracts;
  const merkleTrees = {} as MerkleTrees;
  const merkleProofs = {} as MerkleProofs;
  // make routers empty objects so that they won't be undefined
  contracts.routers = {} as Routers;
  //  local tokens
  let usdc: MockERC20;
  let weth: MockERC20;
  let uTokenDecimals: number;
  let yVault: IYVault;
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
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.yvUSDCWhale]);
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.yvUSDCWhale);

    // transfer eth to impersonated accounts for enough eth to cover gas
    await signers.otherAccounts[0].sendTransaction({ to: signers.user.address, value: ether("1000") });

    // load mainnet contracts
    contracts.uToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.yearn.yvUSDC);
    yVault = <IYVault>await ethers.getContractAt("IYVault", MAINNET_ADDRESSES.contracts.yearn.yvUSDC);

    usdc = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.tokens.usdc);
    weth = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.tokens.weth);
    const rcaShieldFactory = <RcaShieldNormalized__factory>await ethers.getContractFactory("RcaShieldNormalized");
    const rcaControllerFactory = <RcaController__factory>await ethers.getContractFactory("RcaController");
    const rcaTreasuryFactory = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");
    const yearnROuterFactory = <YearnRouter__factory>await ethers.getContractFactory("YearnRouter");

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

    contracts.rcaShield = <RcaShieldNormalized>(
      await rcaShieldFactory.deploy(
        "rcaYearn Shield",
        "rcaYearn",
        contracts.uToken.address,
        await contracts.uToken.decimals(),
        signers.gov.address,
        contracts.rcaController.address,
      )
    );
    // Wait for contract to get deployed
    await contracts.rcaShield.deployed();

    // initialize yearn shield
    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShield.address);

    // deploy yearn router
    uTokenDecimals = await contracts.uToken.decimals();
    contracts.routers.yearnRouter = <YearnRouter>(
      await yearnROuterFactory.deploy(
        contracts.uToken.address,
        MAINNET_ADDRESSES.contracts.tokens.usdc,
        MAINNET_ADDRESSES.contracts.uniswap.routerV2,
        contracts.rcaShield.address,
      )
    );
    await contracts.routers.yearnRouter.deployed();
    // TODO: whitelist router
    const routerAddress = contracts.routers.yearnRouter.address;

    await contracts.rcaController.connect(signers.guardian).setRouterVerified(routerAddress, true);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShield.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);

    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShield.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
    ]);
    // merkleProofs
    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShield.address, ether("100"));
    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());

    // allowance
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShield.address, ether("10000000"));
  });

  describe("Initialize", function () {
    it("should intialize the shield with valid state", async function () {
      expect(await contracts.routers.yearnRouter.yVault()).to.equal(contracts.uToken.address);
      expect((await contracts.routers.yearnRouter.baseToken()).toLowerCase()).to.equal(
        MAINNET_ADDRESSES.contracts.tokens.usdc,
      );
      expect(await contracts.routers.yearnRouter.router()).to.equal(MAINNET_ADDRESSES.contracts.uniswap.routerV2);
      expect(await contracts.routers.yearnRouter.shield()).to.equal(contracts.rcaShield.address);
    });
  });
  describe("zapIn()", function () {
    it("should allow the user to zap in", async function () {
      //   mint RCA and check for shields uToken balance
      const userAddress = signers.user.address;
      const baseTokenDecimals = await usdc.decimals();
      // base token(i.e usdc) amount that is expected in uniswap token swap
      const amountOut = parseUnits("1000", baseTokenDecimals);

      const expectedYvTokens = await getExpectedYvTokens(yVault, amountOut);
      // upto 0.00001% diff in expected yvTokens
      const uTokenDecimals = await contracts.uToken.decimals();
      const uAmountForShield = expectedYvTokens
        .mul(BigNumber.from(10).pow(18))
        .div(BigNumber.from(10).pow(uTokenDecimals));
      // returns: expiry, vInt, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmountForShield,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShield.address,
      });
      const expectedRcaValue = await getExpectedRcaValue({
        rcaShield: contracts.rcaShield,
        uToken: contracts.uToken,
        uAmountForRcaValue: uAmountForShield,
        newCumLiqForClaims: BigNumber.from(0),
      });

      const userRcaBalBefore = await contracts.rcaShield.balanceOf(userAddress);
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["uint256", "uint256", "tuple(address, uint256, uint8, bytes32, bytes32, uint256, bytes32[])"],
        [
          uAmountForShield,
          amountOut,
          [
            signers.referrer.address,
            sigValues.expiry,
            sigValues.vInt,
            sigValues.r,
            sigValues.s,
            0,
            merkleProofs.liqProof1,
          ],
        ],
      );
      // TODO: calculate amount of ethers required to buy base token (fix this later ser)
      await contracts.routers.yearnRouter.connect(signers.user).zapIn(userAddress, zapArgs, { value: ether("1") });

      const userRcaBalAfter = await contracts.rcaShield.balanceOf(userAddress);

      expect(userRcaBalAfter.sub(userRcaBalBefore)).to.be.equal(expectedRcaValue);
    });
  });
  describe("routeTo()", function () {
    it("should allow user to route and recieve exact usdcToken", async function () {
      const baseTokenDecimals = await usdc.decimals();
      //   TODO change this
      const expectedYvTokens = await getExpectedYvTokens(yVault, parseUnits("1000", baseTokenDecimals));
      const uAmount = expectedYvTokens.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(uTokenDecimals));
      const routerAddress = contracts.routers.yearnRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, expectedYvTokens);

      const userUsdcBalBefore = await usdc.balanceOf(userAddress);
      const deadline = (await getTimestamp()).add(100);
      // TODO: update this later *fetch using uniswap*
      const amountOutMin = parseUnits("999.99", await usdc.decimals());
      const tokenOut = usdc.address;
      const inEth = false;
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["address", "uint256", "uint256", "bool"],
        [tokenOut, amountOutMin, deadline, inEth],
      );
      await contracts.routers.yearnRouter.routeTo(userAddress, uAmount, zapArgs);
      //check comp balances
      const userUsdcBalAfter = await usdc.balanceOf(userAddress);
      expect(userUsdcBalAfter.sub(userUsdcBalBefore)).to.be.gte(amountOutMin);
    });
    it("should allow user to route and recieve wrapped eth", async function () {
      const baseTokenDecimals = await usdc.decimals();
      const expectedYvTokens = await getExpectedYvTokens(yVault, parseUnits("1000", baseTokenDecimals));
      const uAmount = expectedYvTokens.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(uTokenDecimals));
      const routerAddress = contracts.routers.yearnRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, expectedYvTokens);

      const userWethBalBefore = await weth.balanceOf(userAddress);
      const deadline = (await getTimestamp()).add(100);
      // TODO: update this later *fetch using uniswap*
      const amountOutMin = ether("0.03");
      const tokenOut = weth.address;
      const inEth = false;
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["address", "uint256", "uint256", "bool"],
        [tokenOut, amountOutMin, deadline, inEth],
      );

      await contracts.routers.yearnRouter.routeTo(userAddress, uAmount, zapArgs);
      //check weth balances
      const userWethBalAfter = await weth.balanceOf(userAddress);
      expect(userWethBalAfter.sub(userWethBalBefore)).to.be.gte(amountOutMin);
    });
    it("should allow user to route and recieve eth", async function () {
      const baseTokenDecimals = await usdc.decimals();
      const expectedYvTokens = await getExpectedYvTokens(yVault, parseUnits("1000", baseTokenDecimals));
      const uAmount = expectedYvTokens.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(uTokenDecimals));
      const routerAddress = contracts.routers.yearnRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, expectedYvTokens);

      const userEthBalBefore = await ethers.provider.getBalance(userAddress);
      const deadline = (await getTimestamp()).add(100);
      // TODO: update this later *fetch using uniswap*
      const amountOutMin = ether("0.03");
      const tokenOut = weth.address;
      const inEth = true;
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["address", "uint256", "uint256", "bool"],
        [tokenOut, amountOutMin, deadline, inEth],
      );

      await contracts.routers.yearnRouter.routeTo(userAddress, uAmount, zapArgs);
      //check weth balances
      const userEthBalAfter = await ethers.provider.getBalance(userAddress);
      expect(userEthBalAfter.sub(userEthBalBefore)).to.be.gte(amountOutMin);
    });
    it("should allow user to recieve desired token while redeeming rca's", async function () {
      const shieldAddress = contracts.rcaShield.address;
      const baseTokenDecimals = await usdc.decimals();
      const expectedYvTokens = await getExpectedYvTokens(yVault, parseUnits("1000", baseTokenDecimals));
      const uAmount = expectedYvTokens.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(uTokenDecimals));
      const userAddress = signers.user.address;
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: shieldAddress,
      });
      await contracts.rcaShield
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
      await contracts.rcaShield.connect(signers.user).redeemRequest(uAmount, 0, [], 0, []);

      // A bit more than 1 day withdrawal
      await increase(86500);

      const routerAddress = contracts.routers.yearnRouter.address;
      const deadline = (await getTimestamp()).add(TIME_IN_SECS.halfYear);
      const amountOutMin = ether("0.03");
      const tokenOut = weth.address;
      const inEth = false;
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["address", "uint256", "uint256", "bool"],
        [tokenOut, amountOutMin, deadline, inEth],
      );
      const userWethBalBefore = await weth.balanceOf(userAddress);
      await contracts.rcaShield.connect(signers.user).redeemFinalize(routerAddress, zapArgs, 0, []);
      const userWethBalAfter = await weth.balanceOf(userAddress);

      expect(userWethBalAfter.sub(userWethBalBefore)).to.be.gte(amountOutMin);
    });
  });
});
