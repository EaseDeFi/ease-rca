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
  parseCToken,
  resetBlockchain,
} from "./utils";
import { RcaController__factory } from "../src/types/factories/RcaController__factory";
import { RcaTreasury__factory } from "../src/types/factories/RcaTreasury__factory";
import { RcaShieldCompound__factory } from "../src/types/factories/RcaShieldCompound__factory";
import { RcaTreasury } from "../src/types/RcaTreasury";
import { RcaController } from "../src/types/RcaController";
import { expect } from "chai";
import BalanceTree from "./balance-tree";
import { BigNumber } from "ethers";
import { IComptroller } from "../src/types/IComptroller";
import { RcaShieldCompound } from "../src/types/RcaShieldCompound";

describe("RcaShieldCompound", function () {
  const DENOMINATOR = BigNumber.from(10000);
  const contracts = {} as Contracts;
  const signers = {} as Signers;
  const merkleTrees = {} as MerkleTrees;
  const merkleProofs = {} as MerkleProofs;
  // reward tokens
  let compToken: MockERC20;
  let compWhale: SignerWithAddress;
  before(async function () {
    await resetBlockchain();
  });
  beforeEach(async function () {
    const _signers: SignerWithAddress[] = await ethers.getSigners();
    signers.gov = _signers[1];
    signers.notGov = _signers[2];
    signers.guardian = _signers[3];
    signers.priceOracle = _signers[4];
    signers.capOracle = _signers[5];
    signers.referrer = _signers[6];
    signers.otherAccounts = _signers.slice(7);
    //  impersonate whale
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.cCompWhale]);
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.compWhale]);
    // impersonate user to who is the whale of underlying token
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.cCompWhale);
    compWhale = await ethers.getSigner(MAINNET_ADDRESSES.accounts.compWhale);

    // Transfer eth from one of the account to user
    await signers.otherAccounts[0].sendTransaction({ to: signers.user.address, value: ether("1000") });

    await signers.otherAccounts[0].sendTransaction({ to: compWhale.address, value: ether("1000") });
    // here cComp token is the underlying token
    contracts.uToken = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.compound.cCompToken)
    );

    // TODO: check if pool contract is needed or is comprotoller contract enough?
    contracts.compoundComptroller = <IComptroller>(
      await ethers.getContractAt("IComptroller", MAINNET_ADDRESSES.contracts.compound.comptroller)
    );

    // transfer some uToken to referrer
    await contracts.uToken.connect(signers.user).transfer(signers.referrer.address, parseCToken("100"));
    // initialize necessary things
    const rcaShieldCompoundFactory = <RcaShieldCompound__factory>await ethers.getContractFactory("RcaShieldCompound");
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

    contracts.rcaShieldCompound = <RcaShieldCompound>(
      await rcaShieldCompoundFactory.deploy(
        "rcaCompound Shield",
        "rcaCOMP",
        contracts.uToken.address,
        await contracts.uToken.decimals(),
        signers.gov.address,
        contracts.rcaController.address,
        MAINNET_ADDRESSES.contracts.compound.comptroller,
      )
    );

    await contracts.rcaShieldCompound.deployed();

    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldCompound.address);

    // initialize reward token contracts
    compToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.compound.token);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldCompound.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);
    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShieldCompound.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: compToken.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
    ]);
    // Set reserved tree with 0 reserved.
    merkleTrees.resTree1 = new BalanceTree([
      { account: contracts.rcaShieldCompound.address, amount: ether("0") },
      { account: contracts.rcaController.address, amount: ether("0") },
    ]);

    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldCompound.address, ether("100"));
    merkleProofs.priceProof1 = merkleTrees.priceTree1.getProof(contracts.uToken.address, ether("0.001"));

    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());
    // approve underlying tokens to shield
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldCompound.address, ether("10000000"));
    await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShieldCompound.address, ether("10000000"));
  });
  describe("Initialize", function () {
    it("should initialize the shield with valid state", async function () {
      expect((await contracts.rcaShieldCompound.comptroller()).toLowerCase()).to.be.equal(
        MAINNET_ADDRESSES.contracts.compound.comptroller,
      );
      expect((await contracts.rcaShieldCompound.uToken()).toLowerCase()).to.be.equal(contracts.uToken.address);
    });
    it("should enter the compound market", async function () {
      const data = await contracts.compoundComptroller.getAssetsIn(contracts.rcaShieldCompound.address);

      // shield should enter the comp market against underlying token
      expect(data[0].toLowerCase()).to.be.eq(contracts.uToken.address);
    });
  });
  describe("mintTo()", function () {
    it("should increase uToken balance of shield on on RCA token mint", async function () {
      let userAddress = signers.user.address;
      let uAmount = ether("10");
      // returns: expiry, vInt, r, s
      let sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldCompound.address,
      });

      let expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldCompound,
        uAmountForRcaValue: uAmount,
        uToken: contracts.uToken,
      });

      let shieldUBalanceBefore = await contracts.uToken.balanceOf(contracts.rcaShieldCompound.address);
      await contracts.rcaShieldCompound
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
      let rcaBal = await contracts.rcaShieldCompound.balanceOf(userAddress);
      expect(rcaBal).to.be.equal(expectedRcaValue);
      let shieldUBalanceAfter = await contracts.uToken.balanceOf(contracts.rcaShieldCompound.address);

      expect(shieldUBalanceAfter.sub(shieldUBalanceBefore)).to.equal(
        uAmount
          .mul(BigNumber.from(10).pow(await contracts.uToken.decimals()))
          .div(BigNumber.from(10).pow(await contracts.rcaShieldCompound.decimals())),
      );

      // Try to mint RCA for another user

      // update details for another user
      userAddress = signers.referrer.address;
      uAmount = ether("20");
      expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldCompound,
        uAmountForRcaValue: uAmount,
        uToken: contracts.uToken,
      });

      // returns: expiry, vInt, r, s
      sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldCompound.address,
      });

      shieldUBalanceBefore = await contracts.uToken.balanceOf(contracts.rcaShieldCompound.address);
      await contracts.rcaShieldCompound
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
      rcaBal = await contracts.rcaShieldCompound.balanceOf(userAddress);
      expect(rcaBal).to.be.equal(expectedRcaValue);

      shieldUBalanceAfter = await contracts.uToken.balanceOf(contracts.rcaShieldCompound.address);
      expect(shieldUBalanceAfter.sub(shieldUBalanceBefore)).to.equal(
        uAmount
          .mul(BigNumber.from(10).pow(await contracts.uToken.decimals()))
          .div(BigNumber.from(10).pow(await contracts.rcaShieldCompound.decimals())),
      );
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
        shieldAddress: contracts.rcaShieldCompound.address,
      });
      await contracts.rcaShieldCompound
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
      const shieldAddress = contracts.rcaShieldCompound.address;
      const compBalanceBefore = await compToken.balanceOf(shieldAddress);

      //2. wait for half a year
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();

      //3. call getReward function
      await contracts.rcaShieldCompound.getReward();
      //4. check for reward token balances
      const compBalanceAfter = await compToken.balanceOf(shieldAddress);
      expect(compBalanceAfter).to.be.gt(compBalanceBefore);
    });

    afterEach(async function () {
      // reset blockchain so that blocks mined after evm_increaseTime don't cause an issue
      await resetBlockchain();
    });
  });
  describe("purchase()", function () {
    beforeEach(async function () {
      //   mint the token
      const userAddress = signers.user.address;
      const uAmount = ether("1000");
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        shieldAddress: contracts.rcaShieldCompound.address,
        userAddress,
      });

      // set discount so that we can test purchase for discount later.
      await contracts.rcaController.connect(signers.gov).setDiscount(BigNumber.from(1000));

      await contracts.rcaShieldCompound
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
    it("should allow user to purchase shield reward balance", async function () {
      // 1. wait for half a year
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // 2. call getReward function
      await contracts.rcaShieldCompound.getReward();
      // 3. call purchase function
      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      // token price proof
      const compTokenPrice = ether("0.001");
      const compTokenPriceProof = merkleTrees.priceTree1.getProof(compToken.address, compTokenPrice);
      // users compBalanceBefore before
      const compBalanceBefore = await compToken.balanceOf(signers.referrer.address);
      // buy comp reward token for referrer signer

      // Keeping amount low because number of blocks mined is taken into account while calling claimComp()
      const compAmount = BigNumber.from(10).pow(8);

      await contracts.rcaShieldCompound
        .connect(signers.referrer)
        .purchase(
          compToken.address,
          compAmount,
          compTokenPrice,
          compTokenPriceProof,
          underLyingPrice,
          underLyingPriceProof,
        );
      // users cComp balance should increase
      const compBalanceAfter = await compToken.balanceOf(signers.referrer.address);

      // user's cComp balance should increase by the amount he is buying
      expect(compBalanceAfter.sub(compBalanceBefore)).to.be.eq(compAmount);
    });
    it("should allow user to purchase shield reward balance with discount", async function () {
      // 1. wait for half a year
      await fastForward(TIME_IN_SECS.halfYear);
      await mine();
      // 2. call getReward function only gives small amount of rewards as comp rewards take block number into account
      await contracts.rcaShieldCompound.getReward();
      // 3. call purchase function
      // underlying price proof
      const underLyingPrice = ether("0.001");

      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);
      // token price proof
      const compTokenPrice = ether("0.001");
      const compTokenPriceProof = merkleTrees.priceTree1.getProof(compToken.address, compTokenPrice);
      // users compBalanceBefore before
      const compBalanceBefore = await compToken.balanceOf(signers.referrer.address);
      // buy comp reward token for referrer signer

      // transfer comp to contract to increase the COMP amount
      await compToken.connect(compWhale).transfer(contracts.rcaShieldCompound.address, ether("10"));
      // Keeping amount low because number of blocks mined is taken into account while calling claimComp()
      const compAmount = ether("10");

      const userAddress = signers.referrer.address;
      const userUtokenBalanceBefore = await contracts.uToken.balanceOf(userAddress);
      await contracts.rcaShieldCompound
        .connect(signers.referrer)
        .purchase(
          compToken.address,
          compAmount,
          compTokenPrice,
          compTokenPriceProof,
          underLyingPrice,
          underLyingPriceProof,
        );
      const compBalanceAfter = await compToken.balanceOf(signers.referrer.address);
      const userUtokenBalanceAfter = await contracts.uToken.balanceOf(userAddress);

      // users Comp balance should increase by 10 Comp
      expect(compBalanceAfter.sub(compBalanceBefore)).to.be.eq(compAmount);

      const discount = await contracts.rcaShieldCompound.discount();
      let expectedUTokenDeduction = compAmount.sub(compAmount.mul(discount).div(DENOMINATOR));

      // normalize for decimals descrepancies
      expectedUTokenDeduction = expectedUTokenDeduction
        .mul(BigNumber.from(10).pow(await contracts.uToken.decimals()))
        .div(BigNumber.from(10).pow(await compToken.decimals()));

      expect(userUtokenBalanceBefore.sub(userUtokenBalanceAfter)).to.be.eq(expectedUTokenDeduction);
    });
    afterEach(async function () {
      // reset blockchain so that blocks mined after evm_increaseTime don't cause an issue
      await resetBlockchain();
    });
  });
});
