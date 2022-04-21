import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import hre, { ethers } from "hardhat";
import { BigNumber } from "ethers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { parseUnits } from "ethers/lib/utils";

import BalanceTree from "../balance-tree";
import {
  ether,
  getExpectedCTokens,
  getExpectedRcaValue,
  getSignatureDetailsFromCapOracle,
  getTimestamp,
  increase,
  resetBlockchain,
} from "../utils";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "../constants";
import type { Contracts, MerkleProofs, MerkleTrees, Routers, Signers } from "../types";

import type { RcaShieldCompound } from "../../src/types/RcaShieldCompound";
import type { MockERC20 } from "../../src/types/MockERC20";
import type { RcaController } from "../../src/types/RcaController";
import type { RcaTreasury } from "../../src/types/RcaTreasury";
import type { CompoundRouter } from "../../src/types/CompoundRouter";
import type { ICToken } from "../../src/types/ICToken";

// Factories
import type { RcaShieldCompound__factory } from "../../src/types/factories/RcaShieldCompound__factory";
import type { RcaController__factory } from "../../src/types/factories/RcaController__factory";
import type { RcaTreasury__factory } from "../../src/types/factories/RcaTreasury__factory";
import type { CompoundRouter__factory } from "../../src/types/factories/CompoundRouter__factory";

describe("CompoundRouter:cComp", function () {
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
  let cToken: ICToken;
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
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.cUsdcWhale]);
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.cUsdcWhale);

    // transfer eth to impersonated accounts for enough eth to cover gas
    await signers.otherAccounts[0].sendTransaction({ to: signers.user.address, value: ether("1000") });

    // load mainnet contracts
    contracts.uToken = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.compound.cUSDCToken)
    );
    cToken = <ICToken>await ethers.getContractAt("ICToken", MAINNET_ADDRESSES.contracts.compound.cUSDCToken);

    usdc = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.tokens.usdc);
    weth = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.tokens.weth);
    const rcaShieldCompoundFactory = <RcaShieldCompound__factory>await ethers.getContractFactory("RcaShieldCompound");
    const rcaControllerFactory = <RcaController__factory>await ethers.getContractFactory("RcaController");
    const rcaTreasuryFactory = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");
    const compoundRouterFactory = <CompoundRouter__factory>await ethers.getContractFactory("CompoundRouter");

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

    contracts.rcaShieldCompound = <RcaShieldCompound>(
      await rcaShieldCompoundFactory.deploy(
        "rcaComp Shield",
        "rcaComp",
        contracts.uToken.address,
        await contracts.uToken.decimals(),
        signers.gov.address,
        contracts.rcaController.address,
        MAINNET_ADDRESSES.contracts.compound.comptroller,
      )
    );
    // Wait for contract to get deployed
    await contracts.rcaShieldCompound.deployed();

    // initialize compound shield
    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldCompound.address);

    // deploy compound router
    uTokenDecimals = await contracts.uToken.decimals();
    contracts.routers.compoundRouter = <CompoundRouter>(
      await compoundRouterFactory.deploy(
        contracts.uToken.address,
        uTokenDecimals,
        MAINNET_ADDRESSES.contracts.tokens.usdc,
        MAINNET_ADDRESSES.contracts.uniswap.routerV2,
        contracts.rcaShieldCompound.address,
      )
    );
    await contracts.routers.compoundRouter.deployed();
    // TODO: whitelist router
    const routerAddress = contracts.routers.compoundRouter.address;

    await contracts.rcaController.connect(signers.guardian).setRouterVerified(routerAddress, true);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldCompound.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);

    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShieldCompound.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
    ]);
    // merkleProofs
    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldCompound.address, ether("100"));
    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());

    // allowance
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldCompound.address, ether("10000000"));
  });

  describe("Initialize", function () {
    it("should intialize the shield with valid state", async function () {
      expect((await contracts.routers.compoundRouter.cToken()).toLowerCase()).to.equal(contracts.uToken.address);
      expect((await contracts.routers.compoundRouter.baseToken()).toLowerCase()).to.equal(
        MAINNET_ADDRESSES.contracts.tokens.usdc,
      );
      expect(await contracts.routers.compoundRouter.router()).to.equal(MAINNET_ADDRESSES.contracts.uniswap.routerV2);
      expect(await contracts.routers.compoundRouter.shield()).to.equal(contracts.rcaShieldCompound.address);
    });
  });
  describe("zapIn()", function () {
    it("should allow the user to zap in", async function () {
      //   mint RCA and check for shields uToken balance
      const userAddress = signers.user.address;
      const baseTokenDecimals = await usdc.decimals();
      // base token(i.e usdc) amount that is expected in uniswap token swap
      const amountOut = parseUnits("1000", baseTokenDecimals);
      //TODO:   calculate uAmount we get when swapping 1 eth
      const uAmount = amountOut;
      const expectedCTokens = await getExpectedCTokens(cToken, uAmount, baseTokenDecimals);
      const uTokenDecimals = await contracts.uToken.decimals();
      const uAmountForShield = expectedCTokens
        .mul(BigNumber.from(10).pow(18))
        .div(BigNumber.from(10).pow(uTokenDecimals));
      // returns: expiry, vInt, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmountForShield,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldCompound.address,
      });
      const expectedRcaValue = await getExpectedRcaValue({
        rcaShield: contracts.rcaShieldCompound,
        uToken: contracts.uToken,
        uAmountForRcaValue: uAmountForShield,
        newCumLiqForClaims: BigNumber.from(0),
      });

      const userRcaBalBefore = await contracts.rcaShieldCompound.balanceOf(userAddress);
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
      await contracts.routers.compoundRouter.connect(signers.user).zapIn(userAddress, zapArgs, { value: ether("1") });

      const userRcaBalAfter = await contracts.rcaShieldCompound.balanceOf(userAddress);

      expect(userRcaBalAfter.sub(userRcaBalBefore)).to.be.equal(expectedRcaValue);
    });
  });
  describe("routeTo()", function () {
    it("should allow user to route and recieve exact usdcToken", async function () {
      const baseTokenDecimals = await usdc.decimals();
      const expectedCTokens = await getExpectedCTokens(
        cToken,
        parseUnits("1000", baseTokenDecimals),
        baseTokenDecimals,
      );

      const uAmount = expectedCTokens.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(uTokenDecimals));
      const routerAddress = contracts.routers.compoundRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, expectedCTokens);

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
      await contracts.routers.compoundRouter.routeTo(userAddress, uAmount, zapArgs);
      //check comp balances
      const userUsdcBalAfter = await usdc.balanceOf(userAddress);
      expect(userUsdcBalAfter.sub(userUsdcBalBefore)).to.be.gte(amountOutMin);
    });
    it("should allow user to route and recieve wrapped eth", async function () {
      const baseTokenDecimals = await usdc.decimals();
      const expectedCTokens = await getExpectedCTokens(
        cToken,
        parseUnits("1000", baseTokenDecimals),
        baseTokenDecimals,
      );

      const uAmount = expectedCTokens.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(uTokenDecimals));
      const routerAddress = contracts.routers.compoundRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, expectedCTokens);

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

      await contracts.routers.compoundRouter.routeTo(userAddress, uAmount, zapArgs);
      //check weth balances
      const userWethBalAfter = await weth.balanceOf(userAddress);
      expect(userWethBalAfter.sub(userWethBalBefore)).to.be.gte(amountOutMin);
    });
    it("should allow user to route and recieve eth", async function () {
      const baseTokenDecimals = await usdc.decimals();
      const expectedCTokens = await getExpectedCTokens(
        cToken,
        parseUnits("1000", baseTokenDecimals),
        baseTokenDecimals,
      );

      const uAmount = expectedCTokens.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(uTokenDecimals));
      const routerAddress = contracts.routers.compoundRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, expectedCTokens);

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

      await contracts.routers.compoundRouter.routeTo(userAddress, uAmount, zapArgs);
      //check weth balances
      const userEthBalAfter = await ethers.provider.getBalance(userAddress);
      expect(userEthBalAfter.sub(userEthBalBefore)).to.be.gte(amountOutMin);
    });
    it("should allow user to recieve desired token while redeeming rca's", async function () {
      const shieldAddress = contracts.rcaShieldCompound.address;
      const baseTokenDecimals = await usdc.decimals();
      const expectedCTokens = await getExpectedCTokens(
        cToken,
        parseUnits("1000", baseTokenDecimals),
        baseTokenDecimals,
      );

      const uAmount = expectedCTokens.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(uTokenDecimals));
      const userAddress = signers.user.address;
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: shieldAddress,
      });
      await contracts.rcaShieldCompound
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
      await contracts.rcaShieldCompound.connect(signers.user).redeemRequest(uAmount, 0, [], 0, []);

      // A bit more than 1 day withdrawal
      await increase(86500);

      const routerAddress = contracts.routers.compoundRouter.address;
      const deadline = (await getTimestamp()).add(TIME_IN_SECS.halfYear);
      const amountOutMin = ether("0.03");
      const tokenOut = weth.address;
      const inEth = false;
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["address", "uint256", "uint256", "bool"],
        [tokenOut, amountOutMin, deadline, inEth],
      );
      const userWethBalBefore = await weth.balanceOf(userAddress);
      await contracts.rcaShieldCompound.connect(signers.user).redeemFinalize(routerAddress, zapArgs, 0, []);
      const userWethBalAfter = await weth.balanceOf(userAddress);

      expect(userWethBalAfter.sub(userWethBalBefore)).to.be.gte(amountOutMin);
    });
  });
});
