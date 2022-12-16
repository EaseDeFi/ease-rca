import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import hre, { ethers } from "hardhat";
import { MockERC20 } from "../src/types/MockERC20";
import { IMasterChef } from "../src/types/IMasterChef";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "./constants";
import { Contracts, MerkleProofs, MerkleTrees, Signers } from "./types";
import {
  ether,
  getExpectedRcaValue,
  getSignatureDetailsFromCapOracle,
  fastForward,
  mine,
  resetBlockchain,
} from "./utils";
import { RcaShieldOnsen } from "../src/types/RcaShieldOnsen";
import { RcaController__factory } from "../src/types/factories/RcaController__factory";
import { RcaTreasury__factory } from "../src/types/factories/RcaTreasury__factory";
import { RcaShieldOnsen__factory } from "../src/types/factories/RcaShieldOnsen__factory";
import { RcaTreasury } from "../src/types/RcaTreasury";
import { RcaController } from "../src/types/RcaController";
import { BigNumber } from "ethers";
import BalanceTree from "./balance-tree";
import { expect } from "chai";

describe("RcaShieldOnsen:BITWETH", function () {
  const DENOMINATOR = BigNumber.from(10000);
  const BITWETH_PID = BigNumber.from(MAINNET_ADDRESSES.contracts.onsen.bitWethPid);
  const contracts = {} as Contracts;
  const signers = {} as Signers;
  const merkleTrees = {} as MerkleTrees;
  const merkleProofs = {} as MerkleProofs;
  let sushiToken: MockERC20;
  let masterChefV2: IMasterChef;
  let sushiWhale: SignerWithAddress;
  before(async function () {
    await resetBlockchain();
  });
  beforeEach(async function () {
    //
    const _signers: SignerWithAddress[] = await ethers.getSigners();
    signers.user = _signers[0];
    signers.gov = _signers[1];
    signers.notGov = _signers[2];
    signers.guardian = _signers[3];
    signers.priceOracle = _signers[4];
    signers.capOracle = _signers[5];
    signers.referrer = _signers[6];
    signers.otherAccounts = _signers.slice(7);
    // impersonate bitWethWhale

    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.bitWethWhale]);
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.sushiWhale]);
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.bitWethWhale);
    sushiWhale = await ethers.getSigner(MAINNET_ADDRESSES.accounts.sushiWhale);

    // Transfer all eth from one of the account to user
    await signers.otherAccounts[0].sendTransaction({ to: signers.user.address, value: ether("1000") });
    await signers.otherAccounts[0].sendTransaction({ to: sushiWhale.address, value: ether("1000") });

    // btc weth pair
    contracts.uToken = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.onsen.bitWethPair)
    );
    // sushi token
    sushiToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.onsen.sushiToken);

    // sushi masterchef
    masterChefV2 = <IMasterChef>(
      await ethers.getContractAt("IMasterChef", MAINNET_ADDRESSES.contracts.onsen.masterChefV2)
    );

    // send some btcWeth lp tokens to the referrer
    await contracts.uToken.connect(signers.user).transfer(signers.referrer.address, ether("100"));

    // rca contract factories
    const rcaShieldOnsenFactory = <RcaShieldOnsen__factory>await ethers.getContractFactory("RcaShieldOnsen");
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
        0,
        TIME_IN_SECS.day,
        contracts.rcaTreasury.address,
      )
    );
    // Wait for contract to get deployed
    await contracts.rcaController.deployed();

    contracts.rcaShieldOnsen = <RcaShieldOnsen>(
      await rcaShieldOnsenFactory.deploy(
        "RcaShield Onsen",
        "RcaOnsen",
        contracts.uToken.address,
        BigNumber.from(18),
        signers.gov.address,
        contracts.rcaController.address,
        masterChefV2.address,
        BITWETH_PID,
      )
    );
    await contracts.rcaShieldOnsen.deployed();

    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldOnsen.address);
    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldOnsen.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);
    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShieldOnsen.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
      { account: sushiToken.address, amount: ether("0.001") },
    ]);
    // Set reserved tree with 0 reserved.
    merkleTrees.resTree1 = new BalanceTree([
      { account: contracts.rcaShieldOnsen.address, amount: ether("0") },
      { account: contracts.rcaController.address, amount: ether("0") },
    ]);

    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldOnsen.address, ether("100"));
    merkleProofs.priceProof1 = merkleTrees.priceTree1.getProof(contracts.uToken.address, ether("0.001"));

    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());
    // approve underlying tokens to shield
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldOnsen.address, ether("10000000"));
    await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShieldOnsen.address, ether("10000000"));
  });
  async function mintTokenForUser() {
    const userAddress = signers.user.address;
    const uAmount = ether("1000");
    const shieldAddress = contracts.rcaShieldOnsen.address;
    // returns: expiry, vInt, r, s
    const sigValues = await getSignatureDetailsFromCapOracle({
      amount: uAmount,
      capOracle: signers.capOracle,
      controller: contracts.rcaController,
      userAddress,
      shieldAddress,
    });

    await contracts.rcaShieldOnsen
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
    it("should initialize the shield with valid state", async function () {
      expect(await contracts.rcaShieldOnsen.pid()).to.be.equal(BITWETH_PID);
      expect(await contracts.rcaShieldOnsen.masterChef()).to.be.equal(masterChefV2.address);
    });
  });
  describe("mintTo()", function () {
    it("should deposit lp tokens to masterchef v2 after mint", async function () {
      let userAddress = signers.user.address;
      let uAmount = ether("100");
      // returns: expiry, vInt, r, s
      let sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldOnsen.address,
      });

      let expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldOnsen,
        uAmountForRcaValue: uAmount,
        uToken: contracts.uToken,
      });
      const shieldAddress = contracts.rcaShieldOnsen.address;

      await contracts.rcaShieldOnsen
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
      let rcaBal = await contracts.rcaShieldOnsen.balanceOf(userAddress);
      expect(rcaBal).to.be.equal(expectedRcaValue);

      // details of the deposited bitWeth lp and it's rewards
      // returns deposited amount and rewardDebt
      let shieldDepositInfo = await masterChefV2.userInfo(BITWETH_PID, shieldAddress);
      // deposited lp token should be equal to the amount of uAmount used to buy rca
      expect(shieldDepositInfo.amount).to.be.equal(uAmount);

      // Try to mint RCA for another user

      // update details for another user
      userAddress = signers.referrer.address;
      uAmount = ether("50");
      expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldOnsen,
        uAmountForRcaValue: uAmount,
        uToken: contracts.uToken,
      });

      // returns: expiry, vInt, r, s
      sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldOnsen.address,
      });

      await contracts.rcaShieldOnsen
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
      rcaBal = await contracts.rcaShieldOnsen.balanceOf(userAddress);
      expect(rcaBal).to.be.equal(expectedRcaValue);

      // details of the deposited bitWeth lp and it's rewards
      // returns deposited amount and rewardDebt
      shieldDepositInfo = await masterChefV2.userInfo(BITWETH_PID, shieldAddress);

      // sum to two rca's buys
      const totalUDepositedToShield = uAmount.add(ether("100"));
      // deposited lp token should be equal to the amount of uAmount used to buy rca
      expect(shieldDepositInfo.amount).to.be.equal(totalUDepositedToShield);
    });
  });
  describe("getReward()", function () {
    it("should update shield balance with reward tokens", async function () {
      const userAddress = signers.user.address;
      const uAmount = ether("100");
      const shieldAddress = contracts.rcaShieldOnsen.address;
      // returns: expiry, vInt, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress,
      });

      await contracts.rcaShieldOnsen
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
      // increase evm time by half year
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      const shieldSushiBalanceBefore = await sushiToken.balanceOf(shieldAddress);
      await contracts.rcaShieldOnsen.getReward();
      const shieldSushiBalanceAfter = await sushiToken.balanceOf(shieldAddress);

      // shield sushi balance should increase on harvest
      expect(shieldSushiBalanceAfter).to.be.gt(shieldSushiBalanceBefore);
    });
    afterEach(async function () {
      await resetBlockchain();
    });
  });
  describe("purchase()", function () {
    it("should not allow user to buy underlying token", async function () {
      // mint and claim rewards
      await mintTokenForUser();
      // wait for half year
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // call get reward
      await contracts.rcaShieldOnsen.getReward();
      const shieldAddress = contracts.rcaShieldOnsen.address;
      // as rewards are block count dependent send some sushi to contract from whale
      await sushiToken.connect(sushiWhale).transfer(shieldAddress, ether("1000"));
      // purchase tokens here

      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      /*
      ---------------------------------------------------------------------------------------------
      ------------------------------------PURCHASE SUSHI REWARD------------------------------------
      ---------------------------------------------------------------------------------------------
      */
      const sushiPrice = ether("0.001");
      const sushiPriceProof = merkleTrees.priceTree1.getProof(sushiToken.address, sushiPrice);
      // buy sushi reward token for referrer signer
      const sushiAmtToBuy = ether("100");
      await expect(
        contracts.rcaShieldOnsen
          .connect(signers.referrer)
          .purchase(
            contracts.uToken.address,
            sushiAmtToBuy,
            sushiPrice,
            sushiPriceProof,
            underLyingPrice,
            underLyingPriceProof,
          ),
      ).to.be.revertedWith("cannot buy underlying token");
    });
    it("should allow user to buy harvested sushi and deposit uTokens to sushi masterchef", async function () {
      // mint and claim rewards
      await mintTokenForUser();
      // wait for half year
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // call get reward
      await contracts.rcaShieldOnsen.getReward();

      const shieldAddress = contracts.rcaShieldOnsen.address;
      // as rewards are block count dependent send some sushi to contract from whale
      await sushiToken.connect(sushiWhale).transfer(shieldAddress, ether("1000"));
      // purchase tokens here

      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      /*
      ---------------------------------------------------------------------------------------------
      ------------------------------------PURCHASE SUSHI REWARD------------------------------------
      ---------------------------------------------------------------------------------------------
      */
      const sushiPrice = ether("0.001");
      const sushiPriceProof = merkleTrees.priceTree1.getProof(sushiToken.address, sushiPrice);
      // buy sushi reward token for referrer signer
      const sushiAmtToBuy = ether("100");
      const userAddress = signers.referrer.address;
      const referrerSushiBalBefore = await sushiToken.balanceOf(userAddress);
      const shieldDepositInfoBefore = await masterChefV2.userInfo(BITWETH_PID, shieldAddress);

      await contracts.rcaShieldOnsen
        .connect(signers.referrer)
        .purchase(
          sushiToken.address,
          sushiAmtToBuy,
          sushiPrice,
          sushiPriceProof,
          underLyingPrice,
          underLyingPriceProof,
        );

      const referrerSushiBalAfter = await sushiToken.balanceOf(userAddress);
      const shieldDepositInfoAfter = await masterChefV2.userInfo(BITWETH_PID, shieldAddress);
      // reward token balance of user purchasing it should increase
      expect(referrerSushiBalAfter.sub(referrerSushiBalBefore)).to.be.equal(sushiAmtToBuy);
      // as uToken price and sushi price are 1:1 we can assume uTokens reduced from user is sushi amount we buy
      expect(shieldDepositInfoAfter.amount.sub(shieldDepositInfoBefore.amount)).to.be.equal(sushiAmtToBuy);
    });
    it("should allow user to buy harvested sushi on discount", async function () {
      // set discount
      await contracts.rcaController.connect(signers.gov).setDiscount(BigNumber.from(1000));
      // mint and claim rewards
      await mintTokenForUser();
      // wait for half year
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // call get reward
      await contracts.rcaShieldOnsen.getReward();

      const shieldAddress = contracts.rcaShieldOnsen.address;
      // as rewards are block count dependent send some sushi to contract from whale
      await sushiToken.connect(sushiWhale).transfer(shieldAddress, ether("1000"));
      // purchase tokens here

      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      /*
      ---------------------------------------------------------------------------------------------
      ------------------------------------PURCHASE SUSHI REWARD------------------------------------
      ---------------------------------------------------------------------------------------------
      */
      const sushiPrice = ether("0.001");
      const sushiPriceProof = merkleTrees.priceTree1.getProof(sushiToken.address, sushiPrice);
      // buy sushi reward token for referrer signer
      const sushiAmtToBuy = ether("100");
      const userAddress = signers.referrer.address;
      const referrerUTokenBalanceBefore = await contracts.uToken.balanceOf(userAddress);
      await contracts.rcaShieldOnsen
        .connect(signers.referrer)
        .purchase(
          sushiToken.address,
          sushiAmtToBuy,
          sushiPrice,
          sushiPriceProof,
          underLyingPrice,
          underLyingPriceProof,
        );
      const refferUTokenBalanceAfter = await contracts.uToken.balanceOf(userAddress);
      // reward token balance of user purchasing it should increase
      const discount = await contracts.rcaShieldOnsen.discount();
      // uToken amount to pay for amount of sushi being bought
      const expectedUTokenDeduction = sushiAmtToBuy.sub(sushiAmtToBuy.mul(discount).div(DENOMINATOR));

      expect(referrerUTokenBalanceBefore.sub(refferUTokenBalanceAfter)).to.be.equal(expectedUTokenDeduction);
    });
    afterEach(async function () {
      await resetBlockchain();
    });
  });
  describe("redeemRequest()", function () {
    it("should withdraw lp tokens from sushi masterchef", async function () {
      // mint tokens so that user can redeem it
      await mintTokenForUser();

      const rcaAmount = ether("100");
      const expectedUTokenToWithdraw = ether("100");
      const shieldAddress = contracts.rcaShieldOnsen.address;
      // balances before redeem request
      const shieldDepositInfoBefore = await masterChefV2.userInfo(BITWETH_PID, shieldAddress);
      const shieldUtokenBalanceBefore = await contracts.uToken.balanceOf(shieldAddress);

      // redeem request
      await contracts.rcaShieldOnsen.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, []);
      // balances after redeem request
      const shieldDepositInfoAfter = await masterChefV2.userInfo(BITWETH_PID, shieldAddress);
      const shieldUtokenBalanceAfter = await contracts.uToken.balanceOf(shieldAddress);

      expect(shieldUtokenBalanceAfter.sub(shieldUtokenBalanceBefore)).to.be.equal(expectedUTokenToWithdraw);
      expect(shieldDepositInfoBefore.amount.sub(shieldDepositInfoAfter.amount)).to.be.equal(expectedUTokenToWithdraw);
    });
  });
});
