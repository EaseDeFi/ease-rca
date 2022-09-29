import hre, { ethers } from "hardhat";
import { Contracts, MerkleProofs, MerkleTrees, Signers } from "./types";
import { IRibbonVault } from "../src/types/IRibbonVault";
import { ILiquidityGauge } from "../src/types/ILiquidityGauge";
import { IMinter } from "../src/types/IMinter";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "./constants";
import { RcaShieldRibbon__factory } from "../src/types/factories/RcaShieldRibbon__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockERC20 } from "../src/types/MockERC20";
import { RcaController } from "../src/types/RcaController";
import { RcaController__factory } from "../src/types/factories/RcaController__factory";
import { RcaTreasury } from "../src/types/RcaTreasury";
import { RcaTreasury__factory } from "../src/types/factories/RcaTreasury__factory";
import {
  ether,
  getExpectedRcaValue,
  getSignatureDetailsFromCapOracle,
  fastForward,
  mine,
  resetBlockchain,
} from "./utils";
import { expect } from "chai";
import { RcaShieldRibbon } from "../src/types/RcaShieldRibbon";
import { BigNumber } from "ethers";
import BalanceTree from "./balance-tree";
import { parseEther } from "ethers/lib/utils";
const RESET_BLOCK_NUMBER = 15565030;

describe("RcaShieldRibbon", function () {
  const contracts = {} as Contracts;
  let rstETHVault: IRibbonVault;
  let stEth: MockERC20;
  let rbn: MockERC20;
  let rstETHGauge: ILiquidityGauge;
  let minter: IMinter;
  let userAddress: string;
  let rcaShieldAddress: string;
  const signers = {} as Signers;
  const merkleProofs = {} as MerkleProofs;
  const merkleTrees = {} as MerkleTrees;

  before(async function () {
    await resetBlockchain(RESET_BLOCK_NUMBER);
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

    // impersonate rstEthWhale and unstake his rstEth from the gauge
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.rstEthWhale]);
    await signers.user.sendTransaction({ value: parseEther("100"), to: MAINNET_ADDRESSES.accounts.rstEthWhale });
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.rstEthWhale);

    userAddress = signers.user.address;
    // stETH Token
    stEth = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.ribbon.stEth);

    // RBN TOken
    rbn = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.ribbon.rbn);

    // rstETH Token
    contracts.uToken = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.ribbon.rstEthCCVault)
    );

    // rstETH CCV
    rstETHVault = <IRibbonVault>(
      await ethers.getContractAt("IRibbonVault", MAINNET_ADDRESSES.contracts.ribbon.rstEthCCVault)
    );

    // rstETH Gauge
    rstETHGauge = <ILiquidityGauge>(
      await ethers.getContractAt("ILiquidityGauge", MAINNET_ADDRESSES.contracts.ribbon.rstEthGauge)
    );

    minter = <IMinter>await ethers.getContractAt("IMinter", MAINNET_ADDRESSES.contracts.ribbon.minter);
    // approves
    await stEth.connect(signers.referrer).approve(rstETHVault.address, ether("100000"));
    await stEth.connect(signers.user).approve(rstETHVault.address, ether("100000"));

    // withdraw staked rstETH from gauge so user has rstETH
    const balance = await rstETHGauge.balanceOf(signers.user.address);
    await rstETHGauge.connect(signers.user).withdraw(balance);

    // sent some rstETH to referrer
    await contracts.uToken.connect(signers.user).transfer(signers.referrer.address, ether("10"));

    // rca contract factories
    const rcaShieldRibbonFactory = <RcaShieldRibbon__factory>await ethers.getContractFactory("RcaShieldRibbon");
    const rcaControllerFactory = <RcaController__factory>await ethers.getContractFactory("RcaController");
    const rcaTreasuryFactory = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");

    // deploy rcaTreasury
    contracts.rcaTreasury = <RcaTreasury>await rcaTreasuryFactory.deploy(signers.gov.address);
    await contracts.rcaTreasury.deployed();

    // deploy rcaController
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
    await contracts.rcaController.deployed();

    // deploy rcaShieldRibbon
    contracts.rcaShieldRibbon = <RcaShieldRibbon>(
      await rcaShieldRibbonFactory.deploy(
        "RcaShield Ribbon",
        "RcaRibbon",
        contracts.uToken.address,
        BigNumber.from(18),
        signers.gov.address,
        contracts.rcaController.address,
        rstETHVault.address,
        rstETHGauge.address,
        minter.address,
      )
    );
    await contracts.rcaShieldRibbon.deployed();

    // initialize rcaShieldRibbon
    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldRibbon.address);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldRibbon.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);
    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShieldRibbon.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
      { account: rstETHGauge.address, amount: ether("0.001") },
      { account: rbn.address, amount: ether("0.001") },
    ]);

    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldRibbon.address, ether("100"));
    merkleProofs.priceProof1 = merkleTrees.priceTree1.getProof(contracts.uToken.address, ether("0.001"));
    rcaShieldAddress = contracts.rcaShieldRibbon.address;

    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());
    // approve uToken to shield
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldRibbon.address, ether("10000000"));
    await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShieldRibbon.address, ether("10000000"));
  });

  async function mintTo(_userAddress?: string, _uAmount?: BigNumber, _shieldAddress?: string): Promise<void> {
    let userAddress;
    let uAmount;
    let shieldAddress;
    if (_userAddress == undefined || _uAmount == undefined || _shieldAddress == undefined) {
      userAddress = signers.user.address;
      uAmount = ether("5");
      shieldAddress = contracts.rcaShieldRibbon.address;
    } else {
      userAddress = _userAddress;
      uAmount = _uAmount;
      shieldAddress = _shieldAddress;
    }

    // returns: expiry, vInt, r, s
    const sigValues = await getSignatureDetailsFromCapOracle({
      amount: uAmount,
      capOracle: signers.capOracle,
      controller: contracts.rcaController,
      userAddress,
      shieldAddress,
    });

    await contracts.rcaShieldRibbon
      .connect(signers.user)
      .mintTo(
        userAddress,
        signers.referrer.address,
        uAmount,
        sigValues.expiry,
        sigValues.vInt,
        sigValues.r,
        sigValues.s,
        0,
        merkleProofs.liqProof1,
      );
  }

  describe("Initialize", function () {
    it("Should initialize the shield with valid state", async function () {
      expect(await contracts.rcaShieldRibbon.ribbonVault()).to.be.equal(rstETHVault.address);
      expect(await contracts.rcaShieldRibbon.liquidityGauge()).to.be.equal(rstETHGauge.address);
    });
  });

  describe("mintTo()", function () {
    let userUAmount: BigNumber;
    beforeEach(async function () {
      // mint rca's for the user
      userUAmount = ether("1");
      await mintTo(userAddress, userUAmount, rcaShieldAddress);
    });
    it("should allow user to deposit rToken and recieve ez-token", async function () {
      // Try to mint RCA from user to user
      const expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldRibbon,
        uAmountForRcaValue: userUAmount,
        uToken: contracts.uToken,
      });

      // Check if RCA value received is same as uAmount
      const rcaBal = await contracts.rcaShieldRibbon.balanceOf(userAddress);
      expect(rcaBal).to.be.equal(expectedRcaValue);

      const stakedRstEth = await rstETHGauge.balanceOf(rcaShieldAddress);
      expect(stakedRstEth).to.be.equal(userUAmount);
    });
    it("should stake uToken in rbn liquidity gauge", async function () {
      const shieldGaugeBalanceBefore = await rstETHGauge.balanceOf(rcaShieldAddress);
      await mintTo(userAddress, userUAmount, rcaShieldAddress);
      const shieldGaugeBalanceAfter = await rstETHGauge.balanceOf(rcaShieldAddress);
      expect(shieldGaugeBalanceAfter.sub(shieldGaugeBalanceBefore)).to.equal(userUAmount);
      const shieldUTokenBalance = await contracts.uToken.balanceOf(rcaShieldAddress);
      // shiled uToken balance at this point should be zero because it
      // should be staked to rbn vault
      expect(shieldUTokenBalance).to.equal(0);
    });
  });

  describe("getRewards()", function () {
    it("should collect rewards for the shield", async function () {
      // mint rca
      await mintTo();
      // forward time
      await fastForward(TIME_IN_SECS.day);
      await mine();
      // check balances
      const shieldRewardBalanceBefore = await rbn.balanceOf(rcaShieldAddress);
      await contracts.rcaShieldRibbon.getReward();
      const shieldRewardBalanceAfter = await rbn.balanceOf(rcaShieldAddress);
      expect(shieldRewardBalanceAfter).to.be.gt(shieldRewardBalanceBefore);
    });
  });

  describe("purchase()", function () {
    it("Should not allow users to buy uToken", async function () {
      await mintTo();
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      await contracts.rcaShieldRibbon.getReward();

      const rbnAmountToBuy = ether("1");
      const rbnPrice = ether("0.001");
      const rbnPriceProof = merkleTrees.priceTree1.getProof(rbn.address, rbnPrice);
      const underlyingPrice = ether("0.001");
      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underlyingPrice);

      await expect(
        contracts.rcaShieldRibbon
          .connect(signers.user)
          .purchase(
            contracts.uToken.address,
            rbnAmountToBuy,
            rbnPrice,
            rbnPriceProof,
            underlyingPrice,
            underLyingPriceProof,
          ),
      ).to.be.revertedWith("cannot buy underlying token");
    });

    it("should allow user to purchase rewards and stake uToken to rbn Vault", async function () {
      await mintTo();
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      await contracts.rcaShieldRibbon.getReward();

      const rbnAmountToBuy = ether("1");
      const rbnPrice = ether("0.001");
      const rbnPriceProof = merkleTrees.priceTree1.getProof(rbn.address, rbnPrice);
      const underlyingPrice = ether("0.001");
      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underlyingPrice);
      const userRBNBalanceBefore = await rbn.balanceOf(signers.user.address);
      const shieldRstETHGBalanceBefore = await rstETHGauge.balanceOf(contracts.rcaShieldRibbon.address);

      await contracts.rcaShieldRibbon
        .connect(signers.user)
        .purchase(rbn.address, rbnAmountToBuy, rbnPrice, rbnPriceProof, underlyingPrice, underLyingPriceProof);

      const userRBNBalanceAfter = await rbn.balanceOf(signers.user.address);
      const shieldRstETHGBalanceAfter = await rstETHGauge.balanceOf(contracts.rcaShieldRibbon.address);

      expect(userRBNBalanceAfter.sub(userRBNBalanceBefore)).to.be.equal(rbnAmountToBuy);
      // as uToken price and RBN Token price are 1:1, we can assume RBN reduced from user after purchase (rbnAmountToBuy) = uTokens tokens the shield receives
      expect(shieldRstETHGBalanceAfter.sub(shieldRstETHGBalanceBefore)).to.be.equal(rbnAmountToBuy);
    });

    it("Should allow user to buy harvested RBN at a discount", async function () {
      await contracts.rcaController.connect(signers.gov).setDiscount(BigNumber.from(1000));
      await mintTo();
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      await contracts.rcaShieldRibbon.getReward();

      const userAddress = signers.user.address;
      const rbnAmountToBuy = ether("1");
      const rbnPrice = ether("0.001");
      const rbnPriceProof = merkleTrees.priceTree1.getProof(rbn.address, rbnPrice);
      const underlyingPrice = ether("0.001");
      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underlyingPrice);

      const userRBNBalanceBefore = await rbn.balanceOf(signers.user.address);
      const shieldRstETHGBalanceBefore = await rstETHGauge.balanceOf(contracts.rcaShieldRibbon.address);

      await contracts.rcaShieldRibbon
        .connect(signers.user)
        .purchase(rbn.address, rbnAmountToBuy, rbnPrice, rbnPriceProof, underlyingPrice, underLyingPriceProof);

      const userRBNBalanceAfter = await rbn.balanceOf(userAddress);
      const shieldRstETHGBalanceAfter = await rstETHGauge.balanceOf(contracts.rcaShieldRibbon.address);

      expect(userRBNBalanceAfter.sub(userRBNBalanceBefore)).to.be.equal(rbnAmountToBuy);

      const discount = await contracts.rcaShieldRibbon.discount();
      const expectedUTokenDeductionFromShield = rbnAmountToBuy.sub(rbnAmountToBuy.mul(discount).div(10000));
      expect(shieldRstETHGBalanceAfter.sub(shieldRstETHGBalanceBefore)).to.be.equal(expectedUTokenDeductionFromShield);
    });
  });

  describe("redeemRequest()", function () {
    it("Should withdraw rstETH from liquidity gauge sending user", async function () {
      await mintTo();

      const rcaAmount = ether("1");
      const expectedUTokenAmount = ether("1");

      const shieldUTokenBalanceBefore = await contracts.uToken.balanceOf(rcaShieldAddress);
      const shieldStakedBalanceBefore = await rstETHGauge.balanceOf(rcaShieldAddress);

      await contracts.rcaShieldRibbon.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, []);

      const shieldUTokenBalanceAfter = await contracts.uToken.balanceOf(rcaShieldAddress);
      const shieldStakedBalanceAfter = await rstETHGauge.balanceOf(rcaShieldAddress);

      expect(shieldUTokenBalanceAfter.sub(shieldUTokenBalanceBefore)).to.be.equal(expectedUTokenAmount);
      expect(shieldStakedBalanceBefore.sub(shieldStakedBalanceAfter)).to.be.equal(expectedUTokenAmount);
    });
  });

  describe("finalizeRedeem()", function () {
    it("user should be able to receive uTokens on withdraw finalize", async function () {
      await mintTo();
      const rcaAmount = ether("1");
      const expectedUTokenAmount = ether("1");

      const shieldUTokenBalanceBefore = await contracts.uToken.balanceOf(rcaShieldAddress);
      const shieldStakedBalanceBefore = await rstETHGauge.balanceOf(rcaShieldAddress);

      await contracts.rcaShieldRibbon.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, []);

      const shieldUTokenBalanceAfter = await contracts.uToken.balanceOf(rcaShieldAddress);
      const shieldStakedBalanceAfter = await rstETHGauge.balanceOf(rcaShieldAddress);

      expect(shieldUTokenBalanceAfter.sub(shieldUTokenBalanceBefore)).to.be.equal(expectedUTokenAmount);
      expect(shieldStakedBalanceBefore.sub(shieldStakedBalanceAfter)).to.be.equal(expectedUTokenAmount);

      await fastForward(TIME_IN_SECS.week);
      await mine();
      const uTokenBalanceBefore = await contracts.uToken.balanceOf(userAddress);
      // finalize redeem
      await contracts.rcaShieldRibbon
        .connect(signers.user)
        .redeemFinalize(signers.user.address, ethers.constants.AddressZero, 0, [], 0, []);
      const uTokenBalanceAfter = await contracts.uToken.balanceOf(userAddress);
      expect(uTokenBalanceAfter.sub(uTokenBalanceBefore)).to.gte(expectedUTokenAmount);
    });
  });
  this.afterEach(async function () {
    // whale has small balance so reset blockchain to rescue
    await resetBlockchain(RESET_BLOCK_NUMBER);
  });
});
