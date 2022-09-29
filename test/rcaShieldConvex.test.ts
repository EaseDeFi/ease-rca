import hre, { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { Contracts, MerkleProofs, MerkleTrees, Signers } from "./types";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "./constants";
import { MockERC20 } from "../src/types/MockERC20";
import {
  ether,
  getExpectedRcaValue,
  getSignatureDetailsFromCapOracle,
  fastForward,
  mine,
  resetBlockchain,
} from "./utils";
import { RcaController__factory } from "../src/types/factories/RcaController__factory";
import { RcaTreasury__factory } from "../src/types/factories/RcaTreasury__factory";
import { RcaShieldConvex__factory } from "../src/types/factories/RcaShieldConvex__factory";
import { RcaTreasury } from "../src/types/RcaTreasury";
import { RcaController } from "../src/types/RcaController";
import { RcaShieldConvex } from "../src/types/RcaShieldConvex";
import { IConvexRewardPool } from "../src/types/IConvexRewardPool";
import { expect } from "chai";
import BalanceTree from "./balance-tree";
import { BigNumber } from "ethers";

describe("RcaShieldConvex", function () {
  const DENOMINATOR = BigNumber.from(10000);
  const contracts = {} as Contracts;
  const signers = {} as Signers;
  const merkleTrees = {} as MerkleTrees;
  const merkleProofs = {} as MerkleProofs;

  // reward tokens
  let crvToken: MockERC20;
  let threeCRVToken: MockERC20;
  let cvxToken: MockERC20;

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
    //  impersonate cvcCRV whale
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.cvxCRVWhale]);
    // impersonate user to who is the whale of underlying token
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.cvxCRVWhale);

    // Transfer all eth from one of the account to user
    await signers.otherAccounts[0].sendTransaction({ to: signers.user.address, value: ether("1000") });

    // here cvxCRV token is the underlying token
    contracts.uToken = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.convex.cvxCrvToken)
    );

    contracts.cvxCRVToken = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.convex.cvxCrvToken)
    );

    contracts.cvxCRVPool = <IConvexRewardPool>(
      await ethers.getContractAt("IConvexRewardPool", MAINNET_ADDRESSES.contracts.convex.cvxCRVRewardPool)
    );

    // transfer some uToken to referrer
    await contracts.uToken.connect(signers.user).transfer(signers.referrer.address, ether("100"));
    // initialize necessary things
    const rcaShieldConvexFactory = <RcaShieldConvex__factory>await ethers.getContractFactory("RcaShieldConvex");
    const rcaControllerFactory = <RcaController__factory>await ethers.getContractFactory("RcaController");
    const rcaTreasuryFactory = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");
    // Wait for contract to get deployed
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
        200,
        TIME_IN_SECS.day,
        contracts.rcaTreasury.address,
      )
    );
    // Wait for contract to get deployed
    await contracts.rcaController.deployed();

    contracts.rcaShieldConvex = <RcaShieldConvex>(
      await rcaShieldConvexFactory.deploy(
        "rcaConvex Shield",
        "rcaCVX",
        contracts.uToken.address,
        signers.gov.address,
        contracts.rcaController.address,
        MAINNET_ADDRESSES.contracts.convex.cvxCRVRewardPool,
      )
    );

    await contracts.rcaShieldConvex.deployed();

    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldConvex.address);

    // initialize reward token contracts
    crvToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.convex.crvToken);
    threeCRVToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.convex.threeCRV);
    cvxToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.convex.token);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldConvex.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);
    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: crvToken.address, amount: ether("0.001") },
      { account: cvxToken.address, amount: ether("0.001") },
      { account: threeCRVToken.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
    ]);
    // Set reserved tree with 0 reserved.
    merkleTrees.resTree1 = new BalanceTree([
      { account: contracts.rcaShieldConvex.address, amount: ether("0") },
      { account: contracts.rcaController.address, amount: ether("0") },
    ]);

    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldConvex.address, ether("100"));
    merkleProofs.priceProof1 = merkleTrees.priceTree1.getProof(contracts.uToken.address, ether("0.001"));

    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());
    // approve underlying tokens to shield
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldConvex.address, ether("10000000"));
    await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShieldConvex.address, ether("10000000"));
  });
  describe("Initialize", function () {
    it("should initialize the shield with valid state", async function () {
      expect(await contracts.rcaShieldConvex.rewardPool()).to.be.equal(
        MAINNET_ADDRESSES.contracts.convex.cvxCRVRewardPool,
      );
      expect(await contracts.rcaShieldConvex.uToken()).to.be.equal(contracts.uToken.address);
    });
  });
  describe("mintTo()", function () {
    it("should stake cvxCRV token on RCA token mint", async function () {
      let userAddress = signers.user.address;
      let uAmount = ether("10");
      // returns: expiry, vInt, r, s
      let sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldConvex.address,
      });

      let expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldConvex,
        uAmountForRcaValue: uAmount,
        uToken: contracts.uToken,
      });

      await contracts.rcaShieldConvex
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

      // Check for the RCA value recieved against uAmount
      let rcaBal = await contracts.rcaShieldConvex.balanceOf(userAddress);
      expect(rcaBal).to.be.equal(expectedRcaValue);

      // Check for the staked amount to equal uAmount used to mint RCA
      let shieldPoolBalance = await contracts.cvxCRVPool.balanceOf(contracts.rcaShieldConvex.address);
      expect(shieldPoolBalance).to.be.equal(uAmount);

      // Try to mint RCA for another user

      // update details for another user
      userAddress = signers.referrer.address;
      uAmount = ether("20");
      expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldConvex,
        uAmountForRcaValue: uAmount,
        uToken: contracts.uToken,
      });

      // returns: expiry, vInt, r, s
      sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldConvex.address,
      });

      await contracts.rcaShieldConvex
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
          merkleProofs.liqProof1,
        );

      // Check for the RCA value recieved against uAmount
      rcaBal = await contracts.rcaShieldConvex.balanceOf(userAddress);
      expect(rcaBal).to.be.equal(expectedRcaValue);

      // Check for the staked amount to equal uAmount used to mint RCA
      shieldPoolBalance = await contracts.cvxCRVPool.balanceOf(contracts.rcaShieldConvex.address);
      // adding uAmount deposited by first user
      uAmount = uAmount.add(ether("10"));
      expect(shieldPoolBalance).to.be.equal(uAmount);
    });
  });
  describe("getReward()", function () {
    it("should update shield balance with reward tokens", async function () {
      //1. Mint a token
      const userAddress = signers.user.address;
      const uAmount = ether("1000");
      // returns: expiry, vInt, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldConvex.address,
      });
      await contracts.rcaShieldConvex
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

      // check reward balances of the shield
      const shieldAddress = contracts.rcaShieldConvex.address;
      const crvBalBefore = await crvToken.balanceOf(shieldAddress);
      const threeCRVBalBefore = await threeCRVToken.balanceOf(shieldAddress);
      const cvxBalBefore = await cvxToken.balanceOf(shieldAddress);

      //2. wait for half a year
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();

      //3. call getReward function
      await contracts.rcaShieldConvex.getReward();
      //4. check for reward token balances
      const crvBalAfter = await crvToken.balanceOf(shieldAddress);
      const threeCRVBalAfter = await threeCRVToken.balanceOf(shieldAddress);
      const cvxBalAfter = await cvxToken.balanceOf(shieldAddress);
      expect(crvBalAfter).to.be.gt(crvBalBefore);
      expect(cvxBalAfter).to.be.gt(cvxBalBefore);
      expect(threeCRVBalAfter).to.be.gt(threeCRVBalBefore);
    });

    afterEach(async function () {
      // reset blockchain so that blocks mined after evm_increaseTime don't cause an issue
      await resetBlockchain();
    });
  });
  describe("purchase()", function () {
    beforeEach(async function () {
      // 1. mint token
      const userAddress = signers.user.address;
      const uAmount = ether("1000");
      // returns: expiry, vInt, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldConvex.address,
      });
      // set discount so that we can test purchase for discount later.
      await contracts.rcaController.connect(signers.gov).setDiscount(BigNumber.from(1000));

      await contracts.rcaShieldConvex
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
    });
    it("should not allow user to purchase underlying token", async function () {
      // 1. wait for half a year
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // 2. call getReward function
      await contracts.rcaShieldConvex.getReward();
      // 3. call purchase function
      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      /*
      ---------------------------------------------------------------------------------------------
      ------------------------------------PURCHASE CRV REWARD--------------------------------------
      ---------------------------------------------------------------------------------------------
      */
      // token price proof for crv
      const crvPrice = ether("0.001");
      const crvPriceProof = merkleTrees.priceTree1.getProof(crvToken.address, crvPrice);
      // buy crv reward token for referrer signer
      const crvAmountToBuy = ether("1");
      await expect(
        contracts.rcaShieldConvex
          .connect(signers.referrer)
          .purchase(
            contracts.uToken.address,
            crvAmountToBuy,
            crvPrice,
            crvPriceProof,
            underLyingPrice,
            underLyingPriceProof,
          ),
      ).to.be.revertedWith("cannot buy underlying token");
    });
    it("should allow user to purchase shield reward balance", async function () {
      // 1. wait for half a year
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // 2. call getReward function
      await contracts.rcaShieldConvex.getReward();
      // 3. call purchase function
      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      /*
      ---------------------------------------------------------------------------------------------
      ------------------------------------PURCHASE CRV REWARD--------------------------------------
      ---------------------------------------------------------------------------------------------
      */
      // token price proof for crv
      const crvPrice = ether("0.001");
      const crvPriceProof = merkleTrees.priceTree1.getProof(crvToken.address, crvPrice);
      // users crvBalance before
      const crvBalBefore = await crvToken.balanceOf(signers.referrer.address);
      // buy crv reward token for referrer signer
      const crvAmountToBuy = ether("1");
      await contracts.rcaShieldConvex
        .connect(signers.referrer)
        .purchase(crvToken.address, crvAmountToBuy, crvPrice, crvPriceProof, underLyingPrice, underLyingPriceProof);
      // users crv balance should increase by 1 crv
      const crvBalAfter = await crvToken.balanceOf(signers.referrer.address);

      // user's crv balance should increase by the amount he is buying
      expect(crvBalAfter.sub(crvBalBefore)).to.be.eq(crvAmountToBuy);

      /*
      ---------------------------------------------------------------------------------------------
      ------------------------------------PURCHASE CVX REWARD--------------------------------------
      ---------------------------------------------------------------------------------------------
      */
      // token price proof for crv
      const cvxPrice = ether("0.001");
      const cvxPriceProof = merkleTrees.priceTree1.getProof(cvxToken.address, cvxPrice);
      // users cvxBalance before
      const cvxBalBefore = await cvxToken.balanceOf(signers.referrer.address);
      // buy cvx reward token for referrer signer
      const cvxAmountToBuy = ether("0.2");
      await contracts.rcaShieldConvex
        .connect(signers.referrer)
        .purchase(cvxToken.address, cvxAmountToBuy, cvxPrice, cvxPriceProof, underLyingPrice, underLyingPriceProof);

      // users cvx balance after
      const cvxBalAfter = await cvxToken.balanceOf(signers.referrer.address);

      // user's cvx balance should increase by the amount he is buying
      expect(cvxBalAfter.sub(cvxBalBefore)).to.be.eq(cvxAmountToBuy);
      /*
      ---------------------------------------------------------------------------------------------
      ------------------------------------PURCHASE 3CRV REWARD-------------------------------------
      ---------------------------------------------------------------------------------------------
      */
      // token price proof for 3crv
      const threeCrvPrice = ether("0.001");
      const threeCrvPriceProof = merkleTrees.priceTree1.getProof(threeCRVToken.address, threeCrvPrice);
      // users 3crv before
      const threeCrvbalanceBefore = await threeCRVToken.balanceOf(signers.referrer.address);
      // buy 3crv reward token for referrer signer
      const threeCrvAmountToBuy = ether("3");
      await contracts.rcaShieldConvex
        .connect(signers.referrer)
        .purchase(
          threeCRVToken.address,
          threeCrvAmountToBuy,
          threeCrvPrice,
          threeCrvPriceProof,
          underLyingPrice,
          underLyingPriceProof,
        );

      // users 3crv balance after
      const threeCrvbalanceAfter = await threeCRVToken.balanceOf(signers.referrer.address);

      // user's 3crv balance should increase by the amount he is buying
      expect(threeCrvbalanceAfter.sub(threeCrvbalanceBefore)).to.be.eq(threeCrvAmountToBuy);
    });

    it("should allow user to purchase shield reward balance on discount", async function () {
      // 1. wait for half a year
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // 2. call getReward function
      await contracts.rcaShieldConvex.getReward();
      // 3. call purchase function
      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      // token price proof
      const tokenPrice = ether("0.001");
      const tokenPriceProof = merkleTrees.priceTree1.getProof(
        MAINNET_ADDRESSES.contracts.convex.crvToken,
        underLyingPrice,
      );
      const userAddress = signers.referrer.address;
      // user balance before
      const userCRVBalanceBefore = await crvToken.balanceOf(userAddress);
      const userUtokenBalanceBefore = await contracts.uToken.balanceOf(userAddress);
      // buy crv reward token for referrer signer
      const amount = ether("1");
      await contracts.rcaShieldConvex
        .connect(signers.referrer)
        .purchase(
          MAINNET_ADDRESSES.contracts.convex.crvToken,
          amount,
          tokenPrice,
          tokenPriceProof,
          underLyingPrice,
          underLyingPriceProof,
        );
      // user balance after
      const userCRVBalanceAfter = await crvToken.balanceOf(userAddress);
      const userUtokenBalanceAfter = await contracts.uToken.balanceOf(userAddress);

      // user's crv balance should increase by the amount he is buying
      expect(userCRVBalanceAfter.sub(userCRVBalanceBefore)).to.be.eq(amount);
      // check if discount was applied
      const discount = await contracts.rcaShieldConvex.discount();
      const expectedUTokenDeduction = amount.sub(amount.mul(discount).div(DENOMINATOR));
      expect(userUtokenBalanceBefore.sub(userUtokenBalanceAfter)).to.be.eq(expectedUTokenDeduction);
    });

    afterEach(async function () {
      // reset blockchain so that blocks mined after evm_increaseTime don't cause an issue
      await resetBlockchain();
    });
  });
  describe("redeemRequest()", function () {
    this.beforeEach(async function () {
      // mint a token
      const userAddress = signers.user.address;
      const uAmount = ether("1000");
      // returns: expiry, vInt, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldConvex.address,
      });
      await contracts.rcaShieldConvex
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
    });
    it("should withraw uToken from rewardPool on redeemRequest", async function () {
      // redeem request
      const rcaAmount = ether("100");
      const shieldAddress = contracts.rcaShieldConvex.address;

      // shield balance before
      const shieldStakeBalanceBefore = await contracts.cvxCRVPool.balanceOf(shieldAddress);
      const shieldUtokenBalanceBefore = await contracts.uToken.balanceOf(shieldAddress);

      // redeem request to withdraw rcaAmount
      await contracts.rcaShieldConvex.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, []);

      // shield balance after
      const shieldStakeBalanceAfter = await contracts.cvxCRVPool.balanceOf(shieldAddress);
      const shieldUtokenBalanceAfter = await contracts.uToken.balanceOf(shieldAddress);

      // shield staked balance should decrease by rcaAmount we are redeeming
      expect(shieldStakeBalanceBefore.sub(shieldStakeBalanceAfter)).to.be.eq(rcaAmount);

      // shield uToken balance should increase by the amount user is trying to redeem
      expect(shieldUtokenBalanceAfter.sub(shieldUtokenBalanceBefore)).to.be.eq(rcaAmount);
    });
  });
});
