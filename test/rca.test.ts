import { expect } from "chai";
import { ethers } from "hardhat";
import {
  fastForward,
  getTimestamp,
  mine,
  ether,
  getSignatureDetailsFromCapOracle,
  getExpectedUValue,
  getExpectedRcaValue,
} from "./utils";
import { BigNumber } from "ethers";

import BalanceTree from "./balance-tree";

import type { Contracts, MerkleProofs, MerkleTrees, Signers } from "./types";
import {
  MockERC20,
  MockERC20__factory,
  MockRouter,
  MockRouter__factory,
  RcaController,
  RcaController__factory,
  RcaShield,
  RcaShield__factory,
  RcaTreasury,
  RcaTreasury__factory,
} from "../src/types";

// Testing base RCA functionalities
// comment to rerun jobs
describe("RCAs and Controller", function () {
  const contracts = {} as Contracts;
  const signers = {} as Signers;
  const merkleTrees = {} as MerkleTrees;
  const merkleProofs = {} as MerkleProofs;

  const withDrawalDelay = BigNumber.from(86400);
  const discount = BigNumber.from(200); // 2%
  const apr = BigNumber.from(0);
  const denominator = BigNumber.from(10000);
  beforeEach(async function () {
    const accounts = await ethers.getSigners();
    signers.gov = accounts[0];
    signers.user = accounts[1];
    signers.priceOracle = accounts[2];
    signers.capOracle = accounts[3];
    signers.guardian = accounts[4];
    signers.referrer = accounts[5];
    signers.otherAccounts = accounts.slice(6);

    const TOKEN = <MockERC20__factory>await ethers.getContractFactory("MockERC20");
    contracts.uToken = <MockERC20>await TOKEN.deploy("Test Token", "TEST", BigNumber.from(18));

    // Setup as a bad router that will fail when correctly routed.
    const ROUTER = <MockRouter__factory>await ethers.getContractFactory("MockRouter");
    contracts.router = <MockRouter>await ROUTER.deploy();

    const RCA_TREASURY = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");
    contracts.rcaTreasury = <RcaTreasury>await RCA_TREASURY.connect(signers.gov).deploy(signers.gov.address);

    const RCA_CONTROLLER = <RcaController__factory>await ethers.getContractFactory("RcaController");
    contracts.rcaController = <RcaController>await RCA_CONTROLLER.connect(signers.guardian).deploy(
      signers.gov.address, // governor
      signers.guardian.address, // guardian
      signers.priceOracle.address, // price oracle
      signers.capOracle.address, // capacity oracle
      apr, // apr
      discount, // discount (2 %)
      withDrawalDelay, // 1 day withdrawal delay
      contracts.rcaTreasury.address, // treasury address
    );

    const RCA_SHIELD = <RcaShield__factory>await ethers.getContractFactory("RcaShield");

    contracts.rcaShield = <RcaShield>await RCA_SHIELD.deploy(
      "Test Token RCA", // token name
      "TEST-RCA", // symbol
      contracts.uToken.address, // underlying token
      signers.gov.address, // governor
      contracts.rcaController.address, // rcaController
    );

    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShield.address);

    await contracts.uToken.mint(signers.user.address, ether("1000000"));
    await contracts.uToken.mint(signers.referrer.address, ether("1000000"));

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShield.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);

    // Set liquidation tree.
    merkleTrees.liqTree2 = new BalanceTree([
      { account: contracts.rcaShield.address, amount: ether("0") },
      { account: contracts.rcaController.address, amount: ether("0") },
    ]);

    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.uToken.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
    ]);

    // Set reserved tree with 0 reserved.
    merkleTrees.resTree1 = new BalanceTree([
      { account: contracts.rcaShield.address, amount: ether("0") },
      { account: contracts.rcaController.address, amount: ether("0") },
    ]);

    // Set reserved tree with 10% reserved.
    merkleTrees.resTree2 = new BalanceTree([
      { account: contracts.rcaShield.address, amount: BigNumber.from(1000) },
      { account: contracts.rcaController.address, amount: BigNumber.from(1000) },
    ]);

    merkleProofs.priceProof1 = merkleTrees.priceTree1.getProof(contracts.uToken.address, ether("0.001"));
    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShield.address, ether("100"));
    merkleProofs.liqProof2 = merkleTrees.liqTree2.getProof(contracts.rcaShield.address, ether("0"));
    merkleProofs.resProof1 = merkleTrees.resTree1.getProof(contracts.rcaShield.address, ether("0"));
    merkleProofs.resProof2 = merkleTrees.resTree2.getProof(contracts.rcaShield.address, BigNumber.from(1000));

    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());
  });

  describe("Initialize", function () {
    // Approve rcaShield to take 1,000 underlying tokens, mint, should receive back 1,000 RCA tokens.
    it("should initialize rcaController correctly", async function () {
      expect(await contracts.rcaController.apr()).to.be.equal(0);
      expect(await contracts.rcaController.discount()).to.be.equal(200);
      expect(await contracts.rcaController.withdrawalDelay()).to.be.equal(86400);
      expect(await contracts.rcaController.treasury()).to.be.equal(contracts.rcaTreasury.address);
      expect(await contracts.rcaController.priceOracle()).to.be.equal(signers.priceOracle.address);
      expect(await contracts.rcaController.capOracle()).to.be.equal(signers.capOracle.address);
      expect(await contracts.rcaController.governor()).to.be.equal(signers.gov.address);
      expect(await contracts.rcaController.guardian()).to.be.equal(signers.guardian.address);

      expect(await contracts.rcaController.shieldMapping(contracts.rcaShield.address)).to.be.equal(true);
    });

    // Approve rcaShield to take 1,000 underlying tokens, mint, should receive back 1,000 RCA tokens.
    it("should initialize shield correctly", async function () {
      expect(await contracts.rcaShield.apr()).to.be.equal(0);
      expect(await contracts.rcaShield.discount()).to.be.equal(200);
      expect(await contracts.rcaShield.withdrawalDelay()).to.be.equal(86400);
      expect(await contracts.rcaShield.treasury()).to.be.equal(contracts.rcaTreasury.address);
      expect(await contracts.rcaShield.percentReserved()).to.be.equal(0);
      expect(await contracts.rcaShield.name()).to.be.equal("Test Token RCA");
      expect(await contracts.rcaShield.symbol()).to.be.equal("TEST-RCA");
      expect(await contracts.rcaShield.uToken()).to.be.equal(contracts.uToken.address);
    });
  });

  describe("Mint", function () {
    beforeEach(async function () {
      await contracts.uToken.connect(signers.user).approve(contracts.rcaShield.address, ether("10000000"));
      await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShield.address, ether("10000000"));
    });
    describe("#feature", function () {
      it("should be able to mint an RCA token", async function () {
        let userAddress = signers.user.address;
        let uAmount = ether("100");
        const rcaAmount = ether("100");
        // returns: expiry, vInt, r, s
        const sigValues = await getSignatureDetailsFromCapOracle({
          amount: uAmount,
          capOracle: signers.capOracle,
          controller: contracts.rcaController,
          userAddress,
          shieldAddress: contracts.rcaShield.address,
        });
        await expect(
          contracts.rcaShield
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
            ),
        )
          .to.emit(contracts.rcaShield, "Mint")
          .withArgs(
            signers.user.address,
            signers.user.address,
            signers.referrer.address,
            uAmount
              .mul(BigNumber.from(10).pow(await contracts.uToken.decimals()))
              .div(BigNumber.from(10).pow(await contracts.rcaShield.decimals())),
            rcaAmount,
            await getTimestamp(),
          );

        const rcaBal = await contracts.rcaShield.balanceOf(signers.user.address);
        expect(rcaBal).to.be.equal(ether("100"));
        // Testing minting to a different address here as well
        userAddress = signers.referrer.address;
        uAmount = ether("50");
        const sigValues2 = await getSignatureDetailsFromCapOracle({
          amount: uAmount,
          capOracle: signers.capOracle,
          controller: contracts.rcaController,
          userAddress,
          shieldAddress: contracts.rcaShield.address,
        });
        await contracts.rcaShield
          .connect(signers.referrer)
          .mintTo(
            signers.referrer.address,
            signers.user.address,
            ether("50"),
            sigValues2.expiry,
            sigValues2.vInt,
            sigValues2.r,
            sigValues2.s,
            0,
            merkleProofs.liqProof1,
          );

        const ownerBal = await contracts.rcaShield.balanceOf(signers.referrer.address);
        expect(ownerBal).to.be.equal(ether("50"));
      });
      // If one request is made after another, the amounts should add to last amounts and the endTime should restart.
      it("should mint correctly with wonky (technical term) updates", async function () {
        const userAddress = signers.user.address;
        const uAmount = ether("1000");
        const newCumLiqForClaims = ether("100");
        // returns: expiry, vInt, r, s
        const sigValues = await getSignatureDetailsFromCapOracle({
          amount: uAmount,
          capOracle: signers.capOracle,
          controller: contracts.rcaController,
          userAddress,
          shieldAddress: contracts.rcaShield.address,
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
            newCumLiqForClaims,
            merkleProofs.liqProof1,
          );

        await contracts.rcaController
          .connect(signers.gov)
          .setLiqTotal(merkleTrees.liqTree1.getHexRoot(), merkleTrees.resTree1.getHexRoot());
        await contracts.rcaController.connect(signers.gov).setApr(2000);
        await contracts.rcaController.connect(signers.guardian).setPercentReserved(merkleTrees.resTree2.getHexRoot());

        // Wait about half a year, so about 10% should be taken.
        await fastForward(31536000 / 2);
        await mine();

        // returns: expiry, vInt, r, s
        const sigValues2 = await getSignatureDetailsFromCapOracle({
          amount: uAmount,
          capOracle: signers.capOracle,
          controller: contracts.rcaController,
          userAddress,
          shieldAddress: contracts.rcaShield.address,
        });
        await contracts.rcaShield
          .connect(signers.user)
          .mintTo(
            signers.user.address,
            signers.user.address,
            uAmount,
            sigValues2.expiry,
            sigValues2.vInt,
            sigValues2.r,
            sigValues2.s,
            newCumLiqForClaims,
            merkleProofs.liqProof1,
          );

        const rcaAmountForUvalue = ether("1");
        const percentReserved = BigNumber.from(1000); // 10% == 1000
        const expectedUValue = await getExpectedUValue({
          newCumLiqForClaims,
          percentReserved,
          rcaAmountForUvalue,
          rcaShield: contracts.rcaShield,
          uToken: contracts.uToken,
        });
        const uAmountForRcaValue = ether("1");

        // calculate expected rca value
        const expectedRcaValue = await getExpectedRcaValue({
          newCumLiqForClaims,
          uAmountForRcaValue,
          rcaShield: contracts.rcaShield,
          uToken: contracts.uToken,
        });

        const uValue = await contracts.rcaShield.uValue(rcaAmountForUvalue, newCumLiqForClaims, percentReserved);
        const rcaValue = await contracts.rcaShield.rcaValue(uAmountForRcaValue, newCumLiqForClaims);

        expect(uValue).to.be.equal(expectedUValue);
        expect(rcaValue).to.be.equal(expectedRcaValue);
      });
      it("should revert if amtForSale is too high", async function () {
        const userAddress = signers.user.address;
        const uAmount = ether("100");
        // returns: expiry, vInt, r, s
        const sigValues = await getSignatureDetailsFromCapOracle({
          amount: uAmount,
          capOracle: signers.capOracle,
          controller: contracts.rcaController,
          userAddress,
          shieldAddress: contracts.rcaShield.address,
        });
        await contracts.rcaController
          .connect(signers.gov)
          .setLiqTotal(merkleTrees.liqTree1.getHexRoot(), merkleTrees.resTree2.getHexRoot());

        await expect(
          contracts.rcaShield
            .connect(signers.user)
            .mintTo(
              signers.user.address,
              signers.referrer.address,
              uAmount,
              sigValues.expiry,
              sigValues.vInt,
              sigValues.r,
              sigValues.s,
              ether("100"),
              merkleProofs.liqProof1,
            ),
        ).to.be.revertedWith("amtForSale is too high.");

        // Testing minting to a different address here as well
      });
    });
    describe("#events", function () {
      it("should emit mint event with valid args from rcaController", async function () {
        // returns: expiry, v, r, s
        const userAddress = signers.user.address;
        const rcaShieldAddress = contracts.rcaShield.address;
        const uAmount = ether("100");
        const sigValues = await getSignatureDetailsFromCapOracle({
          amount: uAmount,
          capOracle: signers.capOracle,
          controller: contracts.rcaController,
          userAddress,
          shieldAddress: contracts.rcaShield.address,
        });
        await expect(
          contracts.rcaShield
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
            ),
        )
          .to.emit(contracts.rcaController, "Mint")
          .withArgs(rcaShieldAddress, userAddress, (await getTimestamp()).add(1));
      });
      it("should emit mint event with valid args from rcaShield", async function () {
        // returns: expiry, v, r, s
        const userAddress = signers.user.address;
        const uAmount = ether("100");
        const rcaAmount = ether("100");
        const sigValues = await getSignatureDetailsFromCapOracle({
          amount: uAmount,
          capOracle: signers.capOracle,
          controller: contracts.rcaController,
          userAddress,
          shieldAddress: contracts.rcaShield.address,
        });
        await expect(
          contracts.rcaShield
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
            ),
        )
          .to.emit(contracts.rcaShield, "Mint")
          .withArgs(
            signers.user.address,
            signers.user.address,
            signers.referrer.address,
            uAmount
              .mul(BigNumber.from(10).pow(await contracts.uToken.decimals()))
              .div(BigNumber.from(10).pow(await contracts.rcaShield.decimals())),
            rcaAmount,
            await getTimestamp(),
          );
      });
    });
    describe("#protocolUpdates", function () {
      // Approve rcaShield to take 1,000 underlying tokens, mint, should receive back 1,000 RCA tokens.
      it("should only update desired controller state variables on mint", async function () {
        const userAddress = signers.user.address;
        const uAmount = ether("100");
        // returns: expiry, v, r, s
        const sigValues = await getSignatureDetailsFromCapOracle({
          amount: uAmount,
          capOracle: signers.capOracle,
          controller: contracts.rcaController,
          userAddress,
          shieldAddress: contracts.rcaShield.address,
        });
        const beforeShieldUpdated = await contracts.rcaController.lastShieldUpdate(contracts.rcaShield.address);
        const cumLiqForClaimsBefore = await contracts.rcaShield.cumLiqForClaims();
        const amtForSaleBefore = await contracts.rcaShield.amtForSale();

        // increase evm time so that updated state can be tested
        await fastForward(200);
        await mine();

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
        const afterShieldUpdated = await contracts.rcaController.lastShieldUpdate(contracts.rcaShield.address);
        const cumLiqForClaimsAfter = await contracts.rcaShield.cumLiqForClaims();
        const amtForSaleAfter = await contracts.rcaShield.amtForSale();

        expect(afterShieldUpdated.sub(beforeShieldUpdated).toNumber()).to.be.closeTo(200, 8);

        // cumLiqForClaims should not update because this is mint
        expect(cumLiqForClaimsAfter.sub(cumLiqForClaimsBefore)).to.equal(BigNumber.from(0));

        // amtForSale should not update because this is mint
        expect(amtForSaleBefore.sub(amtForSaleAfter)).to.equal(BigNumber.from(0));
      });
    });
  });
  describe("Redeem", function () {
    beforeEach(async function () {
      await contracts.uToken.connect(signers.user).approve(contracts.rcaShield.address, ether("1000"));
      const uAmount = ether("100");
      const userAddress = signers.user.address;
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShield.address,
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
    });

    describe("#feature", function () {
      it("should be able to initiate and finalize redeem of RCA token", async function () {
        const userUTokenBalanceBefore = await contracts.uToken.balanceOf(signers.user.address);
        const userRcaBalBefore = await contracts.rcaShield.balanceOf(signers.user.address);
        await contracts.rcaShield
          .connect(signers.user)
          .redeemRequest(ether("100"), 0, merkleProofs.liqProof2, 0, merkleProofs.resProof1);

        const timestamp = await getTimestamp();

        // Check request data
        const redeemRequest = await contracts.rcaShield.withdrawRequests(signers.user.address);
        expect(redeemRequest.rcaAmount).to.be.equal(ether("100"));
        expect(redeemRequest.uAmount).to.be.equal(ether("100"));
        const endTime = timestamp.add("86400");
        expect(redeemRequest.endTime).to.be.equal(endTime);

        // A bit more than 1 day withdrawal
        await fastForward(86500);

        await contracts.rcaShield
          .connect(signers.user)
          .redeemFinalize(signers.user.address, ethers.constants.AddressZero, 0, merkleProofs.liqProof1, 0, []);
        const userUTokenBalAfter = await contracts.uToken.balanceOf(signers.user.address);
        const userRcaBalAfter = await contracts.rcaShield.balanceOf(signers.user.address);
        expect(userRcaBalBefore.sub(userRcaBalAfter)).to.be.equal(redeemRequest.rcaAmount);
        expect(userUTokenBalAfter.sub(userUTokenBalanceBefore)).to.be.equal(redeemRequest.uAmount);
      });

      // If one request is made after another, the amounts should add to last amounts
      // and the endTime should restart.
      it("should be able to stack redeem requests and reset time", async function () {
        await contracts.rcaShield.connect(signers.user).redeemRequest(ether("50"), 0, [], 0, merkleProofs.resProof1);
        // By increasing half a day we can check timestamp changing
        let startTime = await getTimestamp();
        let redeemRequest = await contracts.rcaShield.withdrawRequests(signers.user.address);
        expect(redeemRequest.uAmount).to.be.equal(ether("50"));
        expect(redeemRequest.rcaAmount).to.be.equal(ether("50"));
        expect(redeemRequest.endTime).to.be.equal(startTime.add("86400"));

        // Wait half a day to make sure request time resets
        // (don't want both requests starting at the same time or we can't check).
        await fastForward(43200);

        await contracts.rcaShield.connect(signers.user).redeemRequest(ether("50"), 0, [], 0, merkleProofs.resProof1);
        startTime = await getTimestamp();
        redeemRequest = await contracts.rcaShield.withdrawRequests(signers.user.address);
        expect(redeemRequest.uAmount).to.be.equal(ether("100"));
        expect(redeemRequest.rcaAmount).to.be.equal(ether("100"));
        expect(redeemRequest.endTime).to.be.equal(startTime.add("86400"));
      });
      // check with router--this works backward with the mock and succeeds if not verified, fails if verified.
      it("should succeed if zapping router is not verified", async function () {
        await contracts.rcaShield
          .connect(signers.user)
          .redeemRequest(ether("100"), 0, merkleProofs.liqProof2, 0, merkleProofs.resProof1);

        // Check request data
        const timestamp = await getTimestamp();
        const requests = await contracts.rcaShield.withdrawRequests(signers.user.address);
        expect(requests[0]).to.be.equal(ether("100"));
        expect(requests[0]).to.be.equal(ether("100"));
        const endTime = timestamp.add("86400");
        expect(requests[2]).to.be.equal(endTime);

        // A bit more than 1 day withdrawal
        await fastForward(86500);

        // will fail if it routes
        await contracts.rcaShield
          .connect(signers.user)
          .redeemFinalize(contracts.router.address, ethers.constants.AddressZero, 0, merkleProofs.liqProof1, 0, []);
      });
      // check with router
      it("should fail if zapping router is verified", async function () {
        await contracts.rcaShield
          .connect(signers.user)
          .redeemRequest(ether("100"), 0, merkleProofs.liqProof2, 0, merkleProofs.resProof1);

        // Check request data
        const timestamp = await getTimestamp();
        const requests = await contracts.rcaShield.withdrawRequests(signers.user.address);
        expect(requests[0]).to.be.equal(ether("100"));
        expect(requests[0]).to.be.equal(ether("100"));
        const endTime = timestamp.add("86400");
        expect(requests[2]).to.be.equal(endTime);

        // A bit more than 1 day withdrawal
        await fastForward(86500);

        await contracts.rcaController.connect(signers.guardian).setRouterVerified(contracts.router.address, true);

        await expect(
          contracts.rcaShield
            .connect(signers.user)
            .redeemFinalize(contracts.router.address, ethers.constants.AddressZero, 0, merkleProofs.liqProof1, 0, []),
        ).to.be.reverted;
      });
    });
    describe("#events", function () {
      it("should emit RedeemRequest from rcaShield with valid args", async function () {
        const userAddress = signers.user.address;
        const rcaAmount = ether("50");
        const amtForSale = await contracts.rcaShield.amtForSale();
        const percentReserved = await contracts.rcaShield.percentReserved();
        const uAmount = await contracts.rcaShield.uValue(rcaAmount, amtForSale, percentReserved);
        const withdrawalDelay = await contracts.rcaShield.withdrawalDelay();
        const blockTimestamp = (await getTimestamp()).add(1);
        const endTime = withdrawalDelay.add(blockTimestamp);
        await expect(
          contracts.rcaShield.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, merkleProofs.resProof1),
        )
          .to.emit(contracts.rcaShield, "RedeemRequest")
          .withArgs(userAddress, uAmount, rcaAmount, endTime, (await getTimestamp()).add(1));
      });
      it("should emit RedeemRequest from rcaController with valid args", async function () {
        const rcaShieldAddress = contracts.rcaShield.address;
        const userAddress = signers.user.address;

        await expect(
          contracts.rcaShield.connect(signers.user).redeemRequest(ether("50"), 0, [], 0, merkleProofs.resProof1),
        )
          .to.emit(contracts.rcaController, "RedeemRequest")
          .withArgs(rcaShieldAddress, userAddress, (await getTimestamp()).add(1));
      });
      it("should emit Transfer from rcaShield with valid args", async function () {
        const rcaAmount = ether("50");
        const userAddress = signers.user.address;

        await expect(
          contracts.rcaShield.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, merkleProofs.resProof1),
        )
          .to.emit(contracts.rcaShield, "Transfer")
          .withArgs(userAddress, ethers.constants.AddressZero, rcaAmount);
      });
    });
    describe("#protocolUpdates", function () {
      it("should increase pending withdrawal by correct amount", async function () {
        const rcaAmount = ether("50");
        const pendingWithdrawalBefore = await contracts.rcaShield.pendingWithdrawal();
        await contracts.rcaShield.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, merkleProofs.resProof1);
        const pendingWithdrawalAfter = await contracts.rcaShield.pendingWithdrawal();
        expect(pendingWithdrawalAfter.sub(pendingWithdrawalBefore)).to.equal(rcaAmount);
      });

      it("should update withdraw requests of a user", async function () {
        const rcaAmount = ether("50");
        const withdrawalRequestBefore = await contracts.rcaShield.withdrawRequests(signers.user.address);
        await contracts.rcaShield.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, merkleProofs.resProof1);
        const withdrawalRequestAfter = await contracts.rcaShield.withdrawRequests(signers.user.address);

        // u amount should increase value of uAmount by rcaAmount being redeemed (1rca:1uToken)
        expect(withdrawalRequestAfter.uAmount.sub(withdrawalRequestBefore.uAmount)).to.equal(rcaAmount);

        expect(withdrawalRequestAfter.rcaAmount.sub(withdrawalRequestBefore.rcaAmount)).to.equal(rcaAmount);
        const withdrawalDelay = await contracts.rcaShield.withdrawalDelay();
        const blockTimestamp = await getTimestamp();
        // waiting period end time
        const endTime = withdrawalDelay.add(blockTimestamp);
        expect(withdrawalRequestAfter.endTime).to.equal(endTime);
      });

      it("should decrease circulating supply of rcaTokens", async function () {
        const rcaAmount = ether("50");
        const circulatingSupplyBefore = await contracts.rcaShield.totalSupply();
        await contracts.rcaShield.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, merkleProofs.resProof1);
        const circulatingSupplyAfter = await contracts.rcaShield.totalSupply();
        expect(circulatingSupplyBefore.sub(circulatingSupplyAfter)).to.equal(rcaAmount);
      });

      it("should update percentageReserved of a shield", async function () {
        const percentReserved = BigNumber.from(1000);
        await contracts.rcaController.connect(signers.guardian).setPercentReserved(merkleTrees.resTree2.getHexRoot());
        const rcaAmount = ether("50");
        const shieldPercentReservedBefore = await contracts.rcaShield.percentReserved();
        // initial percent reserved which is zero
        expect(shieldPercentReservedBefore).to.equal(BigNumber.from(0));
        await contracts.rcaShield
          .connect(signers.user)
          .redeemRequest(rcaAmount, 0, [], percentReserved, merkleProofs.resProof2);
        const shieldPercentReservedAfter = await contracts.rcaShield.percentReserved();
        // after redeem request shield percent reserved should update
        expect(shieldPercentReservedAfter).to.be.equal(percentReserved);
      });
      it("should never set percentreserved of a shield more than 33%", async function () {
        const percentReserved = BigNumber.from(5000);
        const reserveLimit = BigNumber.from(3300);
        const resTree = new BalanceTree([
          { account: contracts.rcaShield.address, amount: percentReserved },
          { account: contracts.rcaController.address, amount: BigNumber.from(1000) },
        ]);
        await contracts.rcaController.connect(signers.guardian).setPercentReserved(resTree.getHexRoot());
        const rcaAmount = ether("50");
        const shieldPercentReservedBefore = await contracts.rcaShield.percentReserved();
        // initial percent reserved which is zero
        expect(shieldPercentReservedBefore).to.equal(BigNumber.from(0));
        await contracts.rcaShield
          .connect(signers.user)
          .redeemRequest(
            rcaAmount,
            0,
            [],
            percentReserved,
            resTree.getProof(contracts.rcaShield.address, percentReserved),
          );
        const shieldPercentReservedAfter = await contracts.rcaShield.percentReserved();
        // after redeem request shield percent reserved should update to 33% even though the root is 34%
        expect(shieldPercentReservedAfter).to.be.equal(reserveLimit);
      });
    });
  });
  describe("Purchase", function () {
    beforeEach(async function () {
      // Set capacity proof. Sorta faking, it's a 1 leaf proof.
      // Won't provide super accurate gas pricing but shouldn't cost too much more.
      await contracts.uToken.connect(signers.user).approve(contracts.rcaShield.address, ether("1000"));

      const uAmount = ether("1000");
      const userAddress = signers.user.address;
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShield.address,
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
      await contracts.rcaController
        .connect(signers.gov)
        .setLiqTotal(merkleTrees.liqTree1.getHexRoot(), merkleTrees.resTree1.getHexRoot());
    });

    // Attempt to purchase 50 RCA tokens twice.
    describe("#feature", function () {
      it("should purchase an RCA token from liquidation", async function () {
        const uAmount = ether("50");
        const ethPerUToken = ether("0.001");
        const newCumLiqForClaims = ether("100");
        const discount = await contracts.rcaShield.discount();
        const userAddress = signers.user.address;

        const etherToSend = uAmount.mul(ethPerUToken).div(ether("1"));
        const ethDiscount = etherToSend.mul(discount).div(denominator);
        const ethToSendAfterDiscount = etherToSend.sub(ethDiscount);

        let userRcaBalanceBefore = await contracts.rcaShield.balanceOf(userAddress);
        await contracts.rcaShield.purchaseRca(
          userAddress,
          uAmount,
          ethPerUToken,
          merkleProofs.priceProof1,
          newCumLiqForClaims,
          merkleProofs.liqProof1,
          {
            value: ethToSendAfterDiscount,
          },
        );
        let userRcaBalanceAfter = await contracts.rcaShield.balanceOf(userAddress);
        let expectedRcaAmount = await getExpectedRcaValue({
          newCumLiqForClaims,
          rcaShield: contracts.rcaShield,
          uToken: contracts.uToken,
          uAmountForRcaValue: uAmount,
        });

        expect(userRcaBalanceAfter.sub(userRcaBalanceBefore)).to.equal(expectedRcaAmount);

        // user balance before purchasing RCA twice
        userRcaBalanceBefore = userRcaBalanceAfter;
        await contracts.rcaShield.purchaseRca(
          signers.user.address,
          uAmount,
          ethPerUToken,
          merkleProofs.priceProof1,
          newCumLiqForClaims,
          merkleProofs.liqProof1,
          {
            value: ethToSendAfterDiscount,
          },
        );

        userRcaBalanceAfter = await contracts.rcaShield.balanceOf(userAddress);

        // update expected rca amount after next rca purchase
        expectedRcaAmount = await getExpectedRcaValue({
          newCumLiqForClaims,
          rcaShield: contracts.rcaShield,
          uToken: contracts.uToken,
          uAmountForRcaValue: uAmount,
        });
        // difference of user balance before and after buying rca should be expectedRcaAmount
        expect(userRcaBalanceAfter.sub(userRcaBalanceBefore)).to.equal(expectedRcaAmount);
      });

      it("should purchase underlying tokens from liquidation", async function () {
        const uAmount = ether("50");
        const ethPerUToken = ether("0.001");
        const newCumLiqForClaims = ether("100");
        const userAddress = signers.user.address;

        const etherToSend = uAmount.mul(ethPerUToken).div(ether("1"));
        const ethDiscount = etherToSend.mul(discount).div(denominator);
        const ethToSendAfterDiscount = etherToSend.sub(ethDiscount);
        let uTokenBalanceBefore = await contracts.uToken.balanceOf(userAddress);
        await contracts.rcaShield.purchaseU(
          userAddress,
          uAmount,
          ethPerUToken,
          merkleProofs.priceProof1,
          newCumLiqForClaims,
          merkleProofs.liqProof1,
          {
            value: ethToSendAfterDiscount,
          },
        );
        let uTokenBalanceAfter = await contracts.uToken.balanceOf(userAddress);

        // difference balance should be equal uAmount being purchased
        expect(
          uTokenBalanceAfter
            .sub(uTokenBalanceBefore)
            .mul(BigNumber.from(10).pow(await contracts.rcaShield.decimals()))
            .div(BigNumber.from(10).pow(await contracts.uToken.decimals())),
        ).to.be.equal(uAmount);

        // purchase underlying token again
        uTokenBalanceBefore = uTokenBalanceAfter;
        await contracts.rcaShield.purchaseU(
          userAddress,
          uAmount,
          ethPerUToken,
          merkleProofs.priceProof1,
          newCumLiqForClaims,
          merkleProofs.liqProof1,
          {
            value: ethToSendAfterDiscount,
          },
        );
        uTokenBalanceAfter = await contracts.uToken.balanceOf(userAddress);

        // balance difference should be equal amount of uToken being purchased
        expect(
          uTokenBalanceAfter
            .sub(uTokenBalanceBefore)
            .mul(BigNumber.from(10).pow(await contracts.rcaShield.decimals()))
            .div(BigNumber.from(10).pow(await contracts.uToken.decimals())),
        ).to.be.equal(uAmount);
      });

      it("should increase treasury balance on rca purchase", async function () {
        const uAmount = ether("50");
        const ethPerUToken = ether("0.001");
        const newCumLiqForClaims = ether("100");
        const discount = await contracts.rcaShield.discount();
        const userAddress = signers.user.address;

        const etherToSend = uAmount.mul(ethPerUToken).div(ether("1"));
        const ethDiscount = etherToSend.mul(discount).div(denominator);
        const ethToSendAfterDiscount = etherToSend.sub(ethDiscount);
        const treasuryEthBalanceBefore = await ethers.provider.getBalance(contracts.rcaTreasury.address);

        await contracts.rcaShield.purchaseRca(
          userAddress,
          uAmount,
          ethPerUToken,
          merkleProofs.priceProof1,
          newCumLiqForClaims,
          merkleProofs.liqProof1,
          {
            value: ethToSendAfterDiscount,
          },
        );
        const treasuryEthBalanceAfter = await ethers.provider.getBalance(contracts.rcaTreasury.address);

        expect(treasuryEthBalanceAfter.sub(treasuryEthBalanceBefore)).to.be.equal(ethToSendAfterDiscount);
      });
      it("should increase treasury balance on uToken purchase from liquadation", async function () {
        const uAmount = ether("50");
        const ethPerUToken = ether("0.001");
        const newCumLiqForClaims = ether("100");
        const userAddress = signers.user.address;

        const etherToSend = uAmount.mul(ethPerUToken).div(ether("1"));
        const ethDiscount = etherToSend.mul(discount).div(denominator);
        const ethToSendAfterDiscount = etherToSend.sub(ethDiscount);
        const treasuryEthBalanceBefore = await ethers.provider.getBalance(contracts.rcaTreasury.address);
        await contracts.rcaShield.purchaseU(
          userAddress,
          uAmount,
          ethPerUToken,
          merkleProofs.priceProof1,
          newCumLiqForClaims,
          merkleProofs.liqProof1,
          {
            value: ethToSendAfterDiscount,
          },
        );
        const treasuryEthBalanceAfter = await ethers.provider.getBalance(contracts.rcaTreasury.address);
        // difference of treasury balance should be equal to amount sent to purchse uToken
        expect(treasuryEthBalanceAfter.sub(treasuryEthBalanceBefore)).to.be.equal(ethToSendAfterDiscount);
      });
    });
    describe("#events", function () {
      describe("#rcashiled", function () {
        it("should emit PurchaseRca event with valid args", async function () {
          const uAmount = ether("50");
          const ethPerUToken = ether("0.001");
          const newCumLiqForClaims = ether("100");
          const discount = await contracts.rcaShield.discount();
          const userAddress = signers.user.address;

          const etherToSend = uAmount.mul(ethPerUToken).div(ether("1"));
          const ethDiscount = etherToSend.mul(discount).div(denominator);
          const ethToSendAfterDiscount = etherToSend.sub(ethDiscount);

          const expectedRcaAmount = await getExpectedRcaValue({
            newCumLiqForClaims,
            rcaShield: contracts.rcaShield,
            uAmountForRcaValue: uAmount,
            uToken: contracts.uToken,
          });

          const timestamp = (await getTimestamp()).add(1);
          await expect(
            contracts.rcaShield.purchaseRca(
              userAddress,
              uAmount,
              ethPerUToken,
              merkleProofs.priceProof1,
              newCumLiqForClaims,
              merkleProofs.liqProof1,
              {
                value: ethToSendAfterDiscount,
              },
            ),
          )
            .to.emit(contracts.rcaShield, "PurchaseRca")
            .withArgs(userAddress, uAmount, expectedRcaAmount, ethPerUToken, ethToSendAfterDiscount, timestamp);
        });
        it("should emit PurchaseU event with valid args", async function () {
          const uAmount = ether("50");
          const ethPerUToken = ether("0.001");
          const newLiquidityForClaims = ether("100");
          const discount = await contracts.rcaShield.discount();
          const userAddress = signers.user.address;

          const etherToSend = uAmount.mul(ethPerUToken).div(ether("1"));
          const ethDiscount = etherToSend.mul(discount).div(denominator);
          const ethToSendAfterDiscount = etherToSend.sub(ethDiscount);

          await expect(
            contracts.rcaShield.purchaseU(
              userAddress,
              uAmount,
              ethPerUToken,
              merkleProofs.priceProof1,
              newLiquidityForClaims,
              merkleProofs.liqProof1,
              {
                value: ethToSendAfterDiscount,
              },
            ),
          )
            .to.emit(contracts.rcaShield, "PurchaseU")
            .withArgs(
              userAddress,

              uAmount
                .mul(BigNumber.from(10).pow(await contracts.uToken.decimals()))
                .div(BigNumber.from(10).pow(await contracts.rcaShield.decimals())),
              ethToSendAfterDiscount,
              ethPerUToken,
              await getTimestamp(),
            );
        });
      });
      describe("#rcaController", function () {
        it("should emit Purchase event purchaseRca call", async function () {
          const uAmount = ether("50");
          const ethPerUToken = ether("0.001");
          const newLiquidityForClaims = ether("100");
          const discount = await contracts.rcaShield.discount();
          const userAddress = signers.user.address;

          const etherToSend = uAmount.mul(ethPerUToken).div(ether("1"));
          const ethDiscount = etherToSend.mul(discount).div(denominator);
          const ethToSendAfterDiscount = etherToSend.sub(ethDiscount);

          const timestamp = (await getTimestamp()).add(1);
          await expect(
            contracts.rcaShield.purchaseRca(
              userAddress,
              uAmount,
              ethPerUToken,
              merkleProofs.priceProof1,
              newLiquidityForClaims,
              merkleProofs.liqProof1,
              {
                value: ethToSendAfterDiscount,
              },
            ),
          )
            .to.emit(contracts.rcaController, "Purchase")
            .withArgs(contracts.rcaShield.address, userAddress, timestamp);
        });
        it("should emit Purchase event purchaseU call", async function () {
          const uAmount = ether("50");
          const ethPerUToken = ether("0.001");
          const newLiquidityForClaims = ether("100");
          const discount = await contracts.rcaShield.discount();
          const userAddress = signers.user.address;

          const etherToSend = uAmount.mul(ethPerUToken).div(ether("1"));
          const ethDiscount = etherToSend.mul(discount).div(denominator);
          const ethToSendAfterDiscount = etherToSend.sub(ethDiscount);

          const timestamp = (await getTimestamp()).add(1);
          await expect(
            contracts.rcaShield.purchaseU(
              userAddress,
              uAmount,
              ethPerUToken,
              merkleProofs.priceProof1,
              newLiquidityForClaims,
              merkleProofs.liqProof1,
              {
                value: ethToSendAfterDiscount,
              },
            ),
          )
            .to.emit(contracts.rcaController, "Purchase")
            .withArgs(contracts.rcaShield.address, userAddress, timestamp);
        });
      });
    });
    describe("#protocolupdates", function () {
      it("should update amount for sale on successful rca Token buy", async function () {
        const uAmount = ether("50");
        const ethPerUToken = ether("0.001");
        const newCumLiqForClaims = ether("100");
        const discount = await contracts.rcaShield.discount();
        const userAddress = signers.user.address;

        const etherToSend = uAmount.mul(ethPerUToken).div(ether("1"));
        const ethDiscount = etherToSend.mul(discount).div(denominator);
        const ethToSendAfterDiscount = etherToSend.sub(ethDiscount);
        const amtForSaleBefore = await contracts.rcaShield.amtForSale();

        await contracts.rcaShield.purchaseRca(
          userAddress,
          uAmount,
          ethPerUToken,
          merkleProofs.priceProof1,
          newCumLiqForClaims,
          merkleProofs.liqProof1,
          {
            value: ethToSendAfterDiscount,
          },
        );
        const amtForSaleAfter = await contracts.rcaShield.amtForSale();

        expect(amtForSaleAfter.sub(amtForSaleBefore)).to.be.equal(uAmount);
      });
      it("should update amount for sale on successful uToken buy", async function () {
        const uAmount = ether("50");
        const ethPerUToken = ether("0.001");
        const newCumLiqForClaims = ether("100");
        const userAddress = signers.user.address;

        const etherToSend = uAmount.mul(ethPerUToken).div(ether("1"));
        const ethDiscount = etherToSend.mul(discount).div(denominator);
        const ethToSendAfterDiscount = etherToSend.sub(ethDiscount);
        const amtForSaleBefore = await contracts.rcaShield.amtForSale();
        await contracts.rcaShield.purchaseU(
          userAddress,
          uAmount,
          ethPerUToken,
          merkleProofs.priceProof1,
          newCumLiqForClaims,
          merkleProofs.liqProof1,
          {
            value: ethToSendAfterDiscount,
          },
        );
        const amtForSaleAfter = await contracts.rcaShield.amtForSale();

        expect(amtForSaleAfter.sub(amtForSaleBefore)).to.be.equal(uAmount);
      });
    });
  });
  describe("RcaController", function () {
    beforeEach(async function () {
      await contracts.rcaController.connect(signers.gov).setWithdrawalDelay(100000);
      await contracts.rcaController.connect(signers.gov).setDiscount(1000);
      await contracts.rcaController.connect(signers.gov).setApr(1000);
      await contracts.rcaController.connect(signers.gov).setTreasury(signers.user.address);
      await contracts.rcaController.connect(signers.guardian).setPercentReserved(merkleTrees.resTree2.getHexRoot());
    });

    describe("#protocolUpdates", function () {
      it("should update all variables", async function () {
        expect(await contracts.rcaController.apr()).to.be.equal(1000);
        expect(await contracts.rcaController.discount()).to.be.equal(1000);
        expect(await contracts.rcaController.withdrawalDelay()).to.be.equal(100000);
        expect(await contracts.rcaController.treasury()).to.be.equal(signers.user.address);

        // Mint call should update all variables on rcaShield
        await contracts.uToken.connect(signers.user).approve(contracts.rcaShield.address, ether("1000"));
        //                  to address, uAmount, capacity, cap proof, for sale, old cumulative, for sale proof
        const uAmount = ether("1000");
        const userAddress = signers.user.address;
        const sigValues = await getSignatureDetailsFromCapOracle({
          amount: uAmount,
          capOracle: signers.capOracle,
          controller: contracts.rcaController,
          userAddress,
          shieldAddress: contracts.rcaShield.address,
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
            ether("100"),
            merkleProofs.liqProof1,
          );

        expect(await contracts.rcaShield.apr()).to.be.equal(1000);
        expect(await contracts.rcaShield.discount()).to.be.equal(1000);
        expect(await contracts.rcaShield.withdrawalDelay()).to.be.equal(100000);
        expect(await contracts.rcaShield.treasury()).to.be.equal(signers.user.address);
      });
    });
  });
  describe("Views", function () {
    beforeEach(async function () {
      const uAmount = ether("1000");
      const userAddress = signers.user.address;

      await contracts.rcaController.connect(signers.gov).setApr(1000);
      await contracts.uToken.connect(signers.user).approve(contracts.rcaShield.address, uAmount);
      await contracts.rcaController
        .connect(signers.gov)
        .setLiqTotal(merkleTrees.liqTree2.getHexRoot(), merkleTrees.resTree1.getHexRoot());

      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        shieldAddress: contracts.rcaShield.address,
        userAddress,
      });
      await contracts.rcaShield
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
          merkleProofs.liqProof2,
        );
    });
    describe("#feature", function () {
      it("should update APR when needed", async function () {
        // Wait about half a year, so about 5% should be taken.
        await fastForward(31536000 / 2);
        await mine();

        const newCumLiqForClaims = ether("0");
        const rcaAmountForUvalue = ether("1");
        const percentReserved = BigNumber.from(0); // 10% == 1000
        // calculate expected underlying value
        const expectedUValue = await getExpectedUValue({
          newCumLiqForClaims,
          percentReserved,
          rcaAmountForUvalue,
          rcaShield: contracts.rcaShield,
          uToken: contracts.uToken,
        });

        const uAmountForRcaValue = ether("0.95");
        // calculate expected rca value
        const expectedRcaValue = await getExpectedRcaValue({
          newCumLiqForClaims,
          uAmountForRcaValue,
          rcaShield: contracts.rcaShield,
          uToken: contracts.uToken,
        });
        const uValue = await contracts.rcaShield.uValue(rcaAmountForUvalue, newCumLiqForClaims, percentReserved);
        const rcaValue = await contracts.rcaShield.rcaValue(uAmountForRcaValue, newCumLiqForClaims);
        // Sometimes test speed discrepancies make this fail (off by a few seconds so slightly under 95%).
        expect(uValue).to.be.equal(expectedUValue);
        expect(rcaValue).to.be.equal(expectedRcaValue);
      });

      // Mint => wait for half a year => set liquidity => wait half a year => check.
      // Should result in 50% of original being APR and 45% (90% of 50%) of subsequent
      it("should update correctly with tokens for sale", async function () {
        await fastForward(31536000 / 2);
        await mine();

        await contracts.rcaController
          .connect(signers.gov)
          .setLiqTotal(merkleTrees.liqTree1.getHexRoot(), merkleTrees.resTree1.getHexRoot());

        await fastForward(31536000 / 2);
        await mine();

        const newCumLiqForClaims = ether("100");
        const rcaAmountForUvalue = ether("1");
        const percentReserved = BigNumber.from(0); // 10% == 1000
        const expectedUValue = await getExpectedUValue({
          newCumLiqForClaims,
          percentReserved,
          rcaAmountForUvalue,
          rcaShield: contracts.rcaShield,
          uToken: contracts.uToken,
        });
        const uAmountForRcaValue = ether("1");

        // calculate expected rca value
        const expectedRcaValue = await getExpectedRcaValue({
          newCumLiqForClaims,
          uAmountForRcaValue,
          rcaShield: contracts.rcaShield,
          uToken: contracts.uToken,
        });

        const uValue = await contracts.rcaShield.uValue(rcaAmountForUvalue, newCumLiqForClaims, percentReserved);
        const rcaValue = await contracts.rcaShield.rcaValue(uAmountForRcaValue, newCumLiqForClaims);

        expect(uValue).to.be.equal(expectedUValue);
        expect(rcaValue).to.be.equal(expectedRcaValue);
      });

      // Verify APR updates for
      it("should update correctly with tokens for sale, percent paused, and APR change", async function () {
        await fastForward(31536000 / 2);
        await mine();

        await contracts.rcaController
          .connect(signers.gov)
          .setLiqTotal(merkleTrees.liqTree1.getHexRoot(), merkleTrees.resTree1.getHexRoot());
        await contracts.rcaController.connect(signers.gov).setApr(2000);
        await contracts.rcaController.connect(signers.guardian).setPercentReserved(merkleTrees.resTree2.getHexRoot());

        // Wait about half a year, so about 5% should be taken.
        await fastForward(31536000 / 2);
        await mine();
        const newCumLiqForClaims = ether("100");
        const rcaAmountForUvalue = ether("1");
        const percentReserved = BigNumber.from(100); // 10% == 1000
        const expectedUValue = await getExpectedUValue({
          newCumLiqForClaims,
          percentReserved,
          rcaAmountForUvalue,
          rcaShield: contracts.rcaShield,
          uToken: contracts.uToken,
        });
        const uAmountForRcaValue = ether("1");

        // calculate expected rca value
        const expectedRcaValue = await getExpectedRcaValue({
          newCumLiqForClaims,
          uAmountForRcaValue,
          rcaShield: contracts.rcaShield,
          uToken: contracts.uToken,
        });

        const rcaValue = await contracts.rcaShield.rcaValue(uAmountForRcaValue, newCumLiqForClaims);
        const uValue = await contracts.rcaShield.uValue(rcaAmountForUvalue, newCumLiqForClaims, percentReserved);

        /*
         * Okay let's see if I can do basic math:
         * Starting tokens == 1000, 10% APR for half a year (simplifying for (1+APR)^n==1+APR*n) on that is 5% or 50 tokens
         * 100 tokens are removed for liquidation, total for sale is now 150 so active is 850
         * 10% of that reserved is 85 tokens so active is 765 but total for sale is still 150.
         * 20% APR for half a year on active (not compounding APR and ignoring reserved and additional liquidations) is
         * then 100 tokens, so for sale is 250, reserved is 75 and active is 675.
         * uValue takes into account reserved and should return 0.675 underlying per RCA.
         * rcaValue does not take into account reserved, so its value is 1000 / 750 or ~1.333 per u.
         */
        // expect((uValue as any) / 1e18).to.be.approximately(0.675, 1e-6);
        // expect((rcaValue as any) / 1e18).to.be.approximately(1.333333, 1e-6);
        expect(uValue).to.be.equal(expectedUValue);
        expect(rcaValue).to.be.equal(expectedRcaValue);
      });
    });
  });

  describe("Privileged", function () {
    describe("#rcaController", function () {
      it("should block from privileged functions", async function () {
        await expect(contracts.rcaController.connect(signers.user).setWithdrawalDelay(100000)).to.be.revertedWith(
          "msg.sender is not owner",
        );
        await expect(contracts.rcaController.connect(signers.user).setDiscount(1000)).to.be.revertedWith(
          "msg.sender is not owner",
        );
        await expect(contracts.rcaController.connect(signers.user).setApr(1000)).to.be.revertedWith(
          "msg.sender is not owner",
        );
        await expect(
          contracts.rcaController.connect(signers.user).setTreasury(signers.user.address),
        ).to.be.revertedWith("msg.sender is not owner");
        await expect(
          contracts.rcaController.connect(signers.gov).setPercentReserved(merkleTrees.resTree1.getHexRoot()),
        ).to.be.revertedWith("msg.sender is not Guardian");

        await expect(
          contracts.rcaController.connect(signers.gov).setPrices(merkleTrees.priceTree1.getHexRoot()),
        ).to.be.revertedWith("msg.sender is not price oracle");
      });
    });
    describe("#rcaShield", function () {
      it("should block from privileged functions", async function () {
        await expect(contracts.rcaShield.connect(signers.user).setWithdrawalDelay(100000)).to.be.revertedWith(
          "Function must only be called by controller.",
        );
        await expect(contracts.rcaShield.connect(signers.user).setDiscount(1000)).to.be.revertedWith(
          "Function must only be called by controller.",
        );
        await expect(contracts.rcaShield.connect(signers.user).setApr(1000)).to.be.revertedWith(
          "Function must only be called by controller.",
        );
        await expect(contracts.rcaShield.connect(signers.user).setTreasury(signers.user.address)).to.be.revertedWith(
          "Function must only be called by controller.",
        );
        await expect(contracts.rcaShield.connect(signers.gov).setPercentReserved(1000)).to.be.revertedWith(
          "Function must only be called by controller.",
        );

        await expect(
          contracts.rcaShield.connect(signers.user).setController(signers.referrer.address),
        ).to.be.revertedWith("msg.sender is not owner");
        await expect(
          contracts.rcaShield.connect(signers.user).proofOfLoss(signers.referrer.address),
        ).to.be.revertedWith("msg.sender is not owner");
      });
    });
  });
});
