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
import { ether, getExpectedRcaValue, getSignatureDetailsFromCapOracle, increase, mine, resetBlockchain } from "./utils";
import { expect } from "chai";
import { RcaShieldRibbon } from "../src/types/RcaShieldRibbon";
import { BigNumber } from "ethers";
import BalanceTree from "./balance-tree";

describe("RcaShieldRibbon", function () {
  const contracts = {} as Contracts
  let rstETHVault: IRibbonVault;
  let stEth: MockERC20;
  let rbn: MockERC20;
  let rstEthG: ILiquidityGauge;
  let minter: IMinter;
  const signers = {} as Signers;
  const merkleProofs = {} as MerkleProofs;
  const merkleTrees = {} as MerkleTrees;

  before(async function () {
    await resetBlockchain();
    await newFork();
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
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.rstEthWhale);

    // stETH Token
    stEth = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.ribbon.stEth)
    );

    // RBN Token
    rbn = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.ribbon.rbn)
    );

    // rstETH Token
    contracts.uToken = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.ribbon.rstEthCCVault)
    );

    // rstETH CCV
    rstETHVault = <IRibbonVault>(
      await ethers.getContractAt("IRibbonVault", MAINNET_ADDRESSES.contracts.ribbon.rstEthCCVault)
    );
    
    // rstETH Gauge
    rstEthG = <ILiquidityGauge>(
      await ethers.getContractAt("ILiquidityGauge", MAINNET_ADDRESSES.contracts.ribbon.rstEthGauge)
    );

    minter = <IMinter>(
      await ethers.getContractAt("IMinter", MAINNET_ADDRESSES.contracts.ribbon.minter)
    );
    // approves
    await stEth.connect(signers.referrer).approve(rstETHVault.address, ether("100000"));
    await stEth.connect(signers.user).approve(rstETHVault.address, ether("100000"));

    // withdraw staked rstETH from gauge so user has rstETH
    const balance = await rstEthG.balanceOf(signers.user.address);
    await rstEthG.connect(signers.user).withdraw(balance);
    
    // sent some rstETH to referrer
    await contracts.uToken.connect(signers.user).transfer(signers.referrer.address, ether("100"));

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
        rstEthG.address,
        minter.address
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
      { account: rstEthG.address, amount: ether("0.001") },
      { account: rbn.address, amount: ether("0.001") },
    ]);

    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldRibbon.address, ether("100"));
    merkleProofs.priceProof1 = merkleTrees.priceTree1.getProof(contracts.uToken.address, ether("0.001"));

    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());
    // approve uToken to shield
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldRibbon.address, ether("10000000"));
    await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShieldRibbon.address, ether("10000000"));
  });

  async function newFork() {
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: process.env.MAINNET_URL_ALCHEMY ?? "",
          blockNumber: 14634392
        },
      },],
    });
  }
  async function mintTokenForUser(): Promise<void>;
  async function mintTokenForUser(_userAddress: string, _uAmount: BigNumber, _shieldAddress: string): Promise<void>;
  async function mintTokenForUser(_userAddress?: string, _uAmount?: BigNumber, _shieldAddress?: string): Promise<void> {
    let userAddress;
    let uAmount;
    let shieldAddress;
    if (_userAddress == undefined || _uAmount == undefined || _shieldAddress == undefined) {
      userAddress = signers.user.address;
      uAmount = ether("100");
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
      expect(await contracts.rcaShieldRibbon.liquidityGauge()).to.be.equal(rstEthG.address);
    });
  });

  describe.only("mintTo()", function () {
    it("Should deposit users rstETH tokens, stake them in liquidity gauge, and mint ez-rstETH tokens to user", async function () {
      let userAddress = signers.user.address;
      let uAmount = ether("100");
      const shieldAddress = contracts.rcaShieldRibbon.address;
      // Try to mint RCA from user to user
      await mintTokenForUser(userAddress, uAmount, shieldAddress);

      let expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldRibbon,
        uAmountForRcaValue: uAmount,
        uToken: contracts.uToken,
      });

      // Check if RCA value received is same as uAmount
      let rcaBal = await contracts.rcaShieldRibbon.balanceOf(userAddress);
      expect(rcaBal).to.be.equal(expectedRcaValue);

      let stakedRstEth = await rstEthG.balanceOf(shieldAddress);
      expect(stakedRstEth).to.be.equal(uAmount);

      // Try to mint RCA from referrer to user

      // update details for another user
      userAddress = signers.referrer.address;
      uAmount = ether("50");

      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress,
      });

      expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldRibbon,
        uAmountForRcaValue: uAmount,
        uToken: contracts.uToken
      });

      await contracts.rcaShieldRibbon
        .connect(signers.referrer)
        .mintTo(
          userAddress,
          signers.user.address,
          uAmount,
          sigValues.expiry,
          sigValues.vInt,
          sigValues.r,
          sigValues.s,
          0,
          merkleProofs.liqProof1
        );

      // Check if RCA value received is same as uAmount
      rcaBal = await contracts.rcaShieldRibbon.balanceOf(userAddress);
      expect(rcaBal).to.be.equal(expectedRcaValue);

      stakedRstEth = await rstEthG.balanceOf(shieldAddress);
      const totalStakedRstEth = uAmount.add(ether("100"));
      expect(stakedRstEth).to.be.equal(totalStakedRstEth);
    });
  });

  describe("getRewards()", function () {
    it("Should have more rewards token in rcaShieldRibbon after function call", async function () {
      const shieldAddress = contracts.rcaShieldRibbon.address;
      await mintTokenForUser();
      await increase(TIME_IN_SECS.halfYear);
      await mine();
      const shieldRewardBalanceBefore = await rbn.balanceOf(shieldAddress);
      await contracts.rcaShieldRibbon.getReward();
      const shieldRewardBalanceAfter = await rbn.balanceOf(shieldAddress);
      expect(shieldRewardBalanceAfter).to.be.gt(shieldRewardBalanceBefore);
    });

    afterEach(async function () {
      await resetBlockchain();
      await newFork();
    });
  });

  describe.only("purchase()", function () {
    it("Should not allow users to buy uToken", async function () {
      await mintTokenForUser();
      await increase(TIME_IN_SECS.halfYear);
      await mine();
      await contracts.rcaShieldRibbon.getReward();

      const rbnAmountToBuy = ether("100");
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
          underLyingPriceProof
        )
      ).to.be.revertedWith("cannot buy underlying token");
    });

    it("Should allow user to buy claimed RBN tokens and let shield deposit received uToken into liquidity gauge", async function () {
      await mintTokenForUser();
      await increase(TIME_IN_SECS.halfYear);
      await mine();
      await contracts.rcaShieldRibbon.getReward();

      const rbnAmountToBuy = ether("100");
      const rbnPrice = ether("0.001");
      const rbnPriceProof = merkleTrees.priceTree1.getProof(rbn.address, rbnPrice);
      const underlyingPrice = ether("0.001");
      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underlyingPrice);
      const userRBNBalanceBefore = await rbn.balanceOf(signers.user.address);
      const shieldRstETHGBalanceBefore = await rstEthG.balanceOf(contracts.rcaShieldRibbon.address);

      await contracts.rcaShieldRibbon
        .connect(signers.user)
        .purchase(
          rbn.address,
          rbnAmountToBuy,
          rbnPrice,
          rbnPriceProof,
          underlyingPrice,
          underLyingPriceProof
        );

      const userRBNBalanceAfter = await rbn.balanceOf(signers.user.address)
      const shieldRstETHGBalanceAfter = await rstEthG.balanceOf(contracts.rcaShieldRibbon.address);

      expect(userRBNBalanceAfter.sub(userRBNBalanceBefore)).to.be.equal(rbnAmountToBuy);
      // as uToken price and RBN Token price are 1:1, we can assume RBN reduced from user after purchase (rbnAmountToBuy) = uTokens tokens the shield receives
      expect(shieldRstETHGBalanceAfter.sub(shieldRstETHGBalanceBefore)).to.be.equal(rbnAmountToBuy);
    });

    it("Should allow user to buy harvested RBN at a discount", async function () {
      await contracts.rcaController.connect(signers.gov).setDiscount(BigNumber.from(1000));
      await mintTokenForUser();
      await increase(TIME_IN_SECS.halfYear);
      await mine();
      await contracts.rcaShieldRibbon.getReward();

      const userAddress = signers.user.address;
      const rbnAmountToBuy = ether("100");
      const rbnPrice = ether("0.001");
      const rbnPriceProof = merkleTrees.priceTree1.getProof(rbn.address, rbnPrice);
      const underlyingPrice = ether("0.001");
      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underlyingPrice);

      const userRBNBalanceBefore = await rbn.balanceOf(signers.user.address);
      const shieldRstETHGBalanceBefore = await rstEthG.balanceOf(contracts.rcaShieldRibbon.address);

      await contracts.rcaShieldRibbon
        .connect(signers.user)
        .purchase(
          rbn.address,
          rbnAmountToBuy,
          rbnPrice,
          rbnPriceProof,
          underlyingPrice,
          underLyingPriceProof
        );

      const userRBNBalanceAfter = await rbn.balanceOf(userAddress);
      const shieldRstETHGBalanceAfter = await rstEthG.balanceOf(contracts.rcaShieldRibbon.address);

      expect(userRBNBalanceAfter.sub(userRBNBalanceBefore)).to.be.equal(rbnAmountToBuy);

      const discount = await contracts.rcaShieldRibbon.discount();
      const expectedUTokenDeductionFromShield = rbnAmountToBuy.sub(rbnAmountToBuy.mul(discount).div(10000));
      expect(shieldRstETHGBalanceAfter.sub(shieldRstETHGBalanceBefore)).to.be.equal(expectedUTokenDeductionFromShield);
    });

    afterEach(async function () {
      await resetBlockchain();
      await newFork();
    });
  });

  describe("redeemRequest()", function () {
    it("Should withdraw rstETH from liquidity gauge sending user", async function () {
      await mintTokenForUser();

      const rcaShieldAddress = contracts.rcaShieldRibbon.address;
      const rcaAmount = ether("100");
      const expectedUTokenAmount = ether("100");

      const shieldUTokenBalanceBefore = await contracts.uToken.balanceOf(rcaShieldAddress);
      const shieldStakedBalanceBefore = await rstEthG.balanceOf(rcaShieldAddress);

      await contracts.rcaShieldRibbon.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, []);

      const shieldUTokenBalanceAfter = await contracts.uToken.balanceOf(rcaShieldAddress);
      const shieldStakedBalanceAfter = await rstEthG.balanceOf(rcaShieldAddress);

      expect(shieldUTokenBalanceAfter.sub(shieldUTokenBalanceBefore)).to.be.equal(expectedUTokenAmount);
      expect(shieldStakedBalanceBefore.sub(shieldStakedBalanceAfter)).to.be.equal(expectedUTokenAmount);
    });
  });
});
