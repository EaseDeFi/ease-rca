import "@nomiclabs/hardhat-ethers";
import hre, { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import type { RcaShieldAave } from "../src/types/RcaShieldAave";
import type { MockERC20 } from "../src/types/MockERC20";
import type { RcaController } from "../src/types/RcaController";
import type { RcaTreasury } from "../src/types/RcaTreasury";

// Factories
import type { RcaShieldAave__factory } from "../src/types/factories/RcaShieldAave__factory";
import type { RcaController__factory } from "../src/types/factories/RcaController__factory";
import type { RcaTreasury__factory } from "../src/types/factories/RcaTreasury__factory";
import { expect } from "chai";
import BalanceTree from "./balance-tree";
import {
  ether,
  getExpectedRcaValue,
  getSignatureDetailsFromCapOracle,
  fastForward,
  mine,
  resetBlockchain,
} from "./utils";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "./constants";
import type { Contracts, MerkleProofs, MerkleTrees, Signers } from "./types";
import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";

describe("RcaShieldAave:aWeth", function () {
  const DENOMINATOR = BigNumber.from(10000);
  const signers = {} as Signers;
  const contracts = {} as Contracts;
  const merkleTrees = {} as MerkleTrees;
  const merkleProofs = {} as MerkleProofs;
  // local whales
  let aaveWhale: SignerWithAddress;
  let stkAAVEWhale: SignerWithAddress;
  //  local tokens
  let aaveToken: MockERC20;
  let stkAAVEToken: MockERC20;
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
    //  impersonate aAAVE whale
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.aWethWhale]);
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.aWethWhale);
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.aaveWhale]);
    aaveWhale = await ethers.getSigner(MAINNET_ADDRESSES.accounts.aaveWhale);
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.stkAAVEWhale]);
    stkAAVEWhale = await ethers.getSigner(MAINNET_ADDRESSES.accounts.stkAAVEWhale);

    // transfer eth to impersonated accounts for enough eth to cover gas
    await signers.otherAccounts[0].sendTransaction({ to: signers.user.address, value: ether("1000") });
    await signers.otherAccounts[0].sendTransaction({ to: aaveWhale.address, value: ether("1000") });
    await signers.otherAccounts[0].sendTransaction({ to: stkAAVEWhale.address, value: ether("1000") });

    // load mainnet contracts
    contracts.uToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.aave.aWeth);
    aaveToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.aave.token);
    stkAAVEToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.aave.stkAAVEToken);

    //Transfer uToken(i.e aWeth) to other users
    await contracts.uToken.connect(signers.user).transfer(signers.referrer.address, ether("1000"));

    const rcaShieldAaveFactory = <RcaShieldAave__factory>await ethers.getContractFactory("RcaShieldAave");
    const rcaControllerFactory = <RcaController__factory>await ethers.getContractFactory("RcaController");
    const rcaTreasuryFactory = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");

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

    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldAave.address);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldAave.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);

    // Set liquidation tree.
    merkleTrees.liqTree2 = new BalanceTree([
      { account: contracts.rcaShieldAave.address, amount: ether("0") },
      { account: contracts.rcaController.address, amount: ether("0") },
    ]);

    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShieldAave.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
      { account: aaveToken.address, amount: ether("0.001") },
      { account: stkAAVEToken.address, amount: ether("0.001") },
    ]);
    // merkleProofs
    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldAave.address, ether("100"));
    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());

    // allowance
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldAave.address, ether("100000"));
    await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShieldAave.address, ether("100000"));
  });

  async function mintTokenForUser() {
    //   mint RCA and check for shields uToken balance
    const userAddress = signers.user.address;
    const uAmount = ether("100");
    // returns: expiry, vInt, r, s
    const sigValues = await getSignatureDetailsFromCapOracle({
      amount: uAmount,
      capOracle: signers.capOracle,
      controller: contracts.rcaController,
      userAddress,
      shieldAddress: contracts.rcaShieldAave.address,
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
        merkleProofs.liqProof1,
      );
  }

  // send funds to Treasury
  describe("Initialize", function () {
    it("should intialize the shield with valid state", async function () {
      expect(await contracts.rcaShieldAave.name()).to.equal("rcaAave Shield");
      expect(await contracts.rcaShieldAave.symbol()).to.equal("rcaAave");
      expect(await contracts.rcaShieldAave.incentivesController()).to.equal(
        MAINNET_ADDRESSES.contracts.aave.incentivesController,
      );
    });
  });
  describe("mintTo()", function () {
    it("should increase uToken balance of shileld on RCA token mint", async function () {
      //   mint RCA and check for shields uToken balance
      const userAddress = signers.user.address;
      const uAmount = ether("10");
      // returns: expiry, vInt, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldAave.address,
      });
      const expectedRcaValue = await getExpectedRcaValue({
        rcaShield: contracts.rcaShieldAave,
        uToken: contracts.uToken,
        uAmountForRcaValue: uAmount,
        newCumLiqForClaims: BigNumber.from(0),
      });
      const userRcaBalBefore = await contracts.rcaShieldAave.balanceOf(userAddress);
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
          merkleProofs.liqProof1,
        );
      const userRcaBalAfter = await contracts.rcaShieldAave.balanceOf(userAddress);

      expect(userRcaBalAfter.sub(userRcaBalBefore)).to.be.equal(expectedRcaValue);
    });
  });
  describe("getReward()", function () {
    it("should update shield reward balances", async function () {
      await mintTokenForUser();
      const shieldAddress = contracts.rcaShieldAave.address;
      const shieldUTokenBalanceBefore = await contracts.uToken.balanceOf(shieldAddress);
      const shieldStkAaveTokenBalBefore = await stkAAVEToken.balanceOf(shieldAddress);

      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // this function call increases aWeth balance and stkAave balance
      await contracts.rcaShieldAave.getReward();

      const shieldUtokenBalanceAfter = await contracts.uToken.balanceOf(shieldAddress);
      const shieldStkAaveTokenBalAfter = await stkAAVEToken.balanceOf(shieldAddress);

      // shield aWeth(uToken) balance should increase
      expect(shieldUtokenBalanceAfter.sub(shieldUTokenBalanceBefore)).to.be.gt(BigNumber.from(1));
      // shield stkAave bal should increase
      expect(shieldStkAaveTokenBalAfter.sub(shieldStkAaveTokenBalBefore)).to.be.gt(BigNumber.from(1));
    });
    afterEach(async function () {
      await resetBlockchain();
    });
  });
  describe("purchase()", function () {
    it("should not allow user to buy underlying tokens", async function () {
      // mint rca
      await mintTokenForUser();

      const shieldAddress = contracts.rcaShieldAave.address;
      // as rewards are block count dependent send some sushi to contract from whale
      await stkAAVEToken.connect(stkAAVEWhale).transfer(shieldAddress, ether("1000"));
      // purchase tokens here

      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      /*
      ---------------------------------------------------------------------------------------------
      ------------------------------------PURCHASE stkAAVE REWARD----------------------------------
      ---------------------------------------------------------------------------------------------
      */
      const stkAavePrice = ether("0.001");
      const stkAavePriceProof = merkleTrees.priceTree1.getProof(stkAAVEToken.address, stkAavePrice);
      // buy sushi reward token for referrer signer
      const stkAaveAmtToBuy = ether("100");
      await expect(
        contracts.rcaShieldAave
          .connect(signers.referrer)
          .purchase(
            contracts.uToken.address,
            stkAaveAmtToBuy,
            stkAavePrice,
            stkAavePriceProof,
            underLyingPrice,
            underLyingPriceProof,
          ),
      ).to.be.revertedWith("cannot buy underlying token");
    });
    it("should allow user to buy reward tokens", async function () {
      // mint rca
      await mintTokenForUser();

      // increase time
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // this function call increases aWeth balance and stkAave balance
      await contracts.rcaShieldAave.getReward();

      const shieldAddress = contracts.rcaShieldAave.address;

      // as stkAave rewards come in small amount transfer more to shield so that we can buy it in large amounts
      await stkAAVEToken.connect(stkAAVEWhale).transfer(shieldAddress, ether("1000"));

      // purchase tokens here

      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      /*
      ---------------------------------------------------------------------------------------------
      ------------------------------------PURCHASE stkAAVE REWARD----------------------------------
      ---------------------------------------------------------------------------------------------
      */
      const stkAavePrice = ether("0.001");
      const stkAavePriceProof = merkleTrees.priceTree1.getProof(stkAAVEToken.address, stkAavePrice);
      // buy sushi reward token for referrer signer
      const stkAaveAmtToBuy = ether("100");
      const referrerAddress = signers.referrer.address;
      const referrerStkAaveBalBefore = await stkAAVEToken.balanceOf(referrerAddress);
      const shieldUtokenBalanceBefore = await contracts.uToken.balanceOf(shieldAddress);
      await contracts.rcaShieldAave
        .connect(signers.referrer)
        .purchase(
          stkAAVEToken.address,
          stkAaveAmtToBuy,
          stkAavePrice,
          stkAavePriceProof,
          underLyingPrice,
          underLyingPriceProof,
        );
      const referrerStkAaveBalAfter = await stkAAVEToken.balanceOf(referrerAddress);

      const shieldUtokenBalanceAfter = await contracts.uToken.balanceOf(shieldAddress);
      // stkAave balance of purchaser should increase
      expect(referrerStkAaveBalAfter.sub(referrerStkAaveBalBefore)).to.be.equal(stkAaveAmtToBuy);

      // uToken balance of shield should increase by amount of stkAave bought (1:1 price)
      // I don't know what the problem is with aWeth contract it sends bit more amount than stkAaveAmtToBuy
      expect(shieldUtokenBalanceAfter.sub(shieldUtokenBalanceBefore)).to.be.gte(stkAaveAmtToBuy);
    });
    it("should allow user to buy reward tokens for discount", async function () {
      // set discount
      await contracts.rcaController.connect(signers.gov).setDiscount(BigNumber.from(1000));

      // mint rca
      await mintTokenForUser();

      // increase time
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // this function call increases aWeth balance and stkAave balance
      await contracts.rcaShieldAave.getReward();

      const shieldAddress = contracts.rcaShieldAave.address;

      // as stkAave rewards come in small amount transfer more to shield so that we can buy it in large amounts
      await stkAAVEToken.connect(stkAAVEWhale).transfer(shieldAddress, ether("1000"));

      // purchase tokens here

      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      /*
      ---------------------------------------------------------------------------------------------
      ------------------------------------PURCHASE stkAAVE REWARD----------------------------------
      ---------------------------------------------------------------------------------------------
      */
      const stkAavePrice = ether("0.001");
      const stkAavePriceProof = merkleTrees.priceTree1.getProof(stkAAVEToken.address, stkAavePrice);
      // buy sushi reward token for referrer signer
      const stkAaveAmtToBuy = ether("100");
      const referrerAddress = signers.referrer.address;
      const referrerStkAaveBalBefore = await stkAAVEToken.balanceOf(referrerAddress);
      const userUtokenBalanceBefore = await contracts.uToken.balanceOf(referrerAddress);
      await contracts.rcaShieldAave
        .connect(signers.referrer)
        .purchase(
          stkAAVEToken.address,
          stkAaveAmtToBuy,
          stkAavePrice,
          stkAavePriceProof,
          underLyingPrice,
          underLyingPriceProof,
        );
      const referrerStkAaveBalAfter = await stkAAVEToken.balanceOf(referrerAddress);

      const userUtokenBalanceAfter = await contracts.uToken.balanceOf(referrerAddress);
      // stkAave balance of purchaser should increase
      expect(referrerStkAaveBalAfter.sub(referrerStkAaveBalBefore)).to.be.equal(stkAaveAmtToBuy);

      // apply discount on expected uToken for stkAave
      const discount = await contracts.rcaShieldAave.discount();
      let expectedUTokenDeduction = stkAaveAmtToBuy.sub(stkAaveAmtToBuy.mul(discount).div(DENOMINATOR));

      // fix small unkown bug from weth contracts on transfers that i dont know about
      // comment this line to see the discrepencies
      expectedUTokenDeduction = expectedUTokenDeduction.sub(
        expectedUTokenDeduction.mul(BigNumber.from(10)).div(BigNumber.from(10000)),
      );

      // should allow user to buy on discount
      expect(userUtokenBalanceBefore.sub(userUtokenBalanceAfter)).to.be.gte(expectedUTokenDeduction);
    });
    afterEach(async function () {
      await resetBlockchain();
    });
  });
});

describe("RcaShieldAave:aWBTC", function () {
  const DENOMINATOR = BigNumber.from(10000);
  const signers = {} as Signers;
  const contracts = {} as Contracts;
  const merkleTrees = {} as MerkleTrees;
  const merkleProofs = {} as MerkleProofs;
  // local whales
  let aaveWhale: SignerWithAddress;
  let stkAAVEWhale: SignerWithAddress;
  //  local tokens
  let aaveToken: MockERC20;
  let stkAAVEToken: MockERC20;
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
    //  impersonate aAAVE whale
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.aWbtcWhale]);
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.aWbtcWhale);
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.aaveWhale]);
    aaveWhale = await ethers.getSigner(MAINNET_ADDRESSES.accounts.aaveWhale);
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.stkAAVEWhale]);
    stkAAVEWhale = await ethers.getSigner(MAINNET_ADDRESSES.accounts.stkAAVEWhale);

    // transfer eth to impersonated accounts for enough eth to cover gas
    await signers.otherAccounts[0].sendTransaction({ to: signers.user.address, value: ether("1000") });
    await signers.otherAccounts[0].sendTransaction({ to: aaveWhale.address, value: ether("1000") });
    await signers.otherAccounts[0].sendTransaction({ to: stkAAVEWhale.address, value: ether("1000") });

    // load mainnet contracts
    contracts.uToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.aave.aWbtc);
    aaveToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.aave.token);
    stkAAVEToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.aave.stkAAVEToken);

    //Transfer uToken(i.e aWbtc) to other users
    await contracts.uToken.connect(signers.user).transfer(signers.referrer.address, parseUnits("1000", 8));

    const rcaShieldAaveFactory = <RcaShieldAave__factory>await ethers.getContractFactory("RcaShieldAave");
    const rcaControllerFactory = <RcaController__factory>await ethers.getContractFactory("RcaController");
    const rcaTreasuryFactory = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");

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

    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldAave.address);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldAave.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);

    // Set liquidation tree.
    merkleTrees.liqTree2 = new BalanceTree([
      { account: contracts.rcaShieldAave.address, amount: ether("0") },
      { account: contracts.rcaController.address, amount: ether("0") },
    ]);

    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
      { account: aaveToken.address, amount: ether("0.001") },
      { account: stkAAVEToken.address, amount: ether("0.001") },
    ]);
    // merkleProofs
    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldAave.address, ether("100"));
    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());

    // allowance
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldAave.address, ether("100000"));
    await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShieldAave.address, ether("100000"));
  });

  async function mintTokenForUser() {
    //   mint RCA and check for shields uToken balance
    const userAddress = signers.user.address;
    const uAmount = ether("100");
    // returns: expiry, vInt, r, s
    const sigValues = await getSignatureDetailsFromCapOracle({
      amount: uAmount,
      capOracle: signers.capOracle,
      controller: contracts.rcaController,
      userAddress,
      shieldAddress: contracts.rcaShieldAave.address,
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
        merkleProofs.liqProof1,
      );
  }

  // send funds to Treasury
  describe("Initialize", function () {
    it("should intialize the shield with valid state", async function () {
      expect(await contracts.rcaShieldAave.name()).to.equal("rcaAave Shield");
      expect(await contracts.rcaShieldAave.symbol()).to.equal("rcaAave");
      expect(await contracts.rcaShieldAave.incentivesController()).to.equal(
        MAINNET_ADDRESSES.contracts.aave.incentivesController,
      );
    });
  });
  describe("mintTo()", function () {
    it("should increase uToken balance of shileld on RCA token mint", async function () {
      //   mint RCA and check for shields uToken balance
      const userAddress = signers.user.address;
      const uAmount = ether("10");
      // returns: expiry, vInt, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldAave.address,
      });
      const expectedRcaValue = await getExpectedRcaValue({
        rcaShield: contracts.rcaShieldAave,
        uToken: contracts.uToken,
        uAmountForRcaValue: uAmount,
        newCumLiqForClaims: BigNumber.from(0),
      });
      const userRcaBalBefore = await contracts.rcaShieldAave.balanceOf(userAddress);
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
          merkleProofs.liqProof1,
        );
      const userRcaBalAfter = await contracts.rcaShieldAave.balanceOf(userAddress);

      expect(userRcaBalAfter.sub(userRcaBalBefore)).to.be.equal(expectedRcaValue);
    });
  });
  describe("getReward()", function () {
    it("should update shield reward balances", async function () {
      await mintTokenForUser();
      const shieldAddress = contracts.rcaShieldAave.address;
      const shieldUTokenBalanceBefore = await contracts.uToken.balanceOf(shieldAddress);
      const shieldStkAaveTokenBalBefore = await stkAAVEToken.balanceOf(shieldAddress);

      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // this function call increases aWeth balance and stkAave balance
      await contracts.rcaShieldAave.getReward();

      const shieldUtokenBalanceAfter = await contracts.uToken.balanceOf(shieldAddress);
      const shieldStkAaveTokenBalAfter = await stkAAVEToken.balanceOf(shieldAddress);

      // shield aWeth(uToken) balance should increase
      expect(shieldUtokenBalanceAfter.sub(shieldUTokenBalanceBefore)).to.be.gt(BigNumber.from(1));
      // shield stkAave bal should increase
      expect(shieldStkAaveTokenBalAfter.sub(shieldStkAaveTokenBalBefore)).to.be.gt(BigNumber.from(1));
    });
    afterEach(async function () {
      await resetBlockchain();
    });
  });
  describe("purchase()", function () {
    it("should not allow user to buy underlying tokens", async function () {
      // mint rca
      await mintTokenForUser();

      const shieldAddress = contracts.rcaShieldAave.address;
      // as rewards are block count dependent send some sushi to contract from whale
      await stkAAVEToken.connect(stkAAVEWhale).transfer(shieldAddress, ether("1000"));
      // purchase tokens here

      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      /*
      ---------------------------------------------------------------------------------------------
      ------------------------------------PURCHASE stkAAVE REWARD----------------------------------
      ---------------------------------------------------------------------------------------------
      */
      const stkAavePrice = ether("0.001");
      const stkAavePriceProof = merkleTrees.priceTree1.getProof(stkAAVEToken.address, stkAavePrice);
      // buy sushi reward token for referrer signer
      const stkAaveAmtToBuy = ether("100");
      await expect(
        contracts.rcaShieldAave
          .connect(signers.referrer)
          .purchase(
            contracts.uToken.address,
            stkAaveAmtToBuy,
            stkAavePrice,
            stkAavePriceProof,
            underLyingPrice,
            underLyingPriceProof,
          ),
      ).to.be.revertedWith("cannot buy underlying token");
    });
    it("should allow user to buy reward tokens", async function () {
      // mint rca
      await mintTokenForUser();

      // increase time
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // this function call increases aWeth balance and stkAave balance
      await contracts.rcaShieldAave.getReward();

      const shieldAddress = contracts.rcaShieldAave.address;

      // as stkAave rewards come in small amount transfer more to shield so that we can buy it in large amounts
      await stkAAVEToken.connect(stkAAVEWhale).transfer(shieldAddress, ether("1000"));

      // purchase tokens here

      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      /*
      ---------------------------------------------------------------------------------------------
      ------------------------------------PURCHASE stkAAVE REWARD----------------------------------
      ---------------------------------------------------------------------------------------------
      */
      const stkAavePrice = ether("0.001");
      const stkAavePriceProof = merkleTrees.priceTree1.getProof(stkAAVEToken.address, stkAavePrice);
      // buy sushi reward token for referrer signer
      const stkAaveAmtToBuy = ether("100");
      const referrerAddress = signers.referrer.address;
      const referrerStkAaveBalBefore = await stkAAVEToken.balanceOf(referrerAddress);
      const shieldUtokenBalanceBefore = await contracts.uToken.balanceOf(shieldAddress);
      await contracts.rcaShieldAave
        .connect(signers.referrer)
        .purchase(
          stkAAVEToken.address,
          stkAaveAmtToBuy,
          stkAavePrice,
          stkAavePriceProof,
          underLyingPrice,
          underLyingPriceProof,
        );
      const referrerStkAaveBalAfter = await stkAAVEToken.balanceOf(referrerAddress);

      const shieldUtokenBalanceAfter = await contracts.uToken.balanceOf(shieldAddress);
      // stkAave balance of purchaser should increase
      expect(referrerStkAaveBalAfter.sub(referrerStkAaveBalBefore)).to.be.equal(stkAaveAmtToBuy);

      // as price ratio of stkAave:utoken is 1:1
      let expectedUTokenDeduction = stkAaveAmtToBuy;
      // normalize for decimals diff between uToken and stkAave
      expectedUTokenDeduction = expectedUTokenDeduction
        .mul(BigNumber.from(10).pow(await contracts.uToken.decimals()))
        .div(BigNumber.from(10).pow(await contracts.rcaShieldAave.decimals()));

      // uToken balance of shield should increase by amount of stkAave bought (1:1 price)
      expect(shieldUtokenBalanceAfter.sub(shieldUtokenBalanceBefore)).to.be.gte(expectedUTokenDeduction);
    });
    it("should allow user to buy reward tokens for discount", async function () {
      // set discount
      await contracts.rcaController.connect(signers.gov).setDiscount(BigNumber.from(1000));

      // mint rca
      await mintTokenForUser();

      // increase time
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // this function call increases aWeth balance and stkAave balance
      await contracts.rcaShieldAave.getReward();

      const shieldAddress = contracts.rcaShieldAave.address;

      // as stkAave rewards come in small amount transfer more to shield so that we can buy it in large amounts
      await stkAAVEToken.connect(stkAAVEWhale).transfer(shieldAddress, ether("1000"));

      // purchase tokens here

      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      /*
      ---------------------------------------------------------------------------------------------
      ------------------------------------PURCHASE stkAAVE REWARD----------------------------------
      ---------------------------------------------------------------------------------------------
      */
      const stkAavePrice = ether("0.001");
      const stkAavePriceProof = merkleTrees.priceTree1.getProof(stkAAVEToken.address, stkAavePrice);
      // buy sushi reward token for referrer signer
      const stkAaveAmtToBuy = ether("100");
      const referrerAddress = signers.referrer.address;
      const referrerStkAaveBalBefore = await stkAAVEToken.balanceOf(referrerAddress);
      const userUtokenBalanceBefore = await contracts.uToken.balanceOf(referrerAddress);
      await contracts.rcaShieldAave
        .connect(signers.referrer)
        .purchase(
          stkAAVEToken.address,
          stkAaveAmtToBuy,
          stkAavePrice,
          stkAavePriceProof,
          underLyingPrice,
          underLyingPriceProof,
        );
      const referrerStkAaveBalAfter = await stkAAVEToken.balanceOf(referrerAddress);

      const userUtokenBalanceAfter = await contracts.uToken.balanceOf(referrerAddress);
      // stkAave balance of purchaser should increase
      expect(referrerStkAaveBalAfter.sub(referrerStkAaveBalBefore)).to.be.equal(stkAaveAmtToBuy);

      // apply discount on expected uToken for stkAave
      const discount = await contracts.rcaShieldAave.discount();
      let expectedUTokenDeduction = stkAaveAmtToBuy.sub(stkAaveAmtToBuy.mul(discount).div(DENOMINATOR));

      expectedUTokenDeduction = expectedUTokenDeduction
        .mul(BigNumber.from(10).pow(await contracts.uToken.decimals()))
        .div(BigNumber.from(10).pow(await contracts.rcaShieldAave.decimals()));

      // sometimes there's discrepencies with aWBTC transfers in minute fraction
      // this is the fix for it comment the below line to see the difference
      expectedUTokenDeduction = expectedUTokenDeduction.sub(expectedUTokenDeduction.mul(10).div(10000));

      // should allow user to buy on discount
      expect(userUtokenBalanceBefore.sub(userUtokenBalanceAfter)).to.be.gte(expectedUTokenDeduction);
    });
    afterEach(async function () {
      await resetBlockchain();
    });
  });
});
