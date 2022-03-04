import { expect } from "chai";
import { ethers } from "hardhat";
import { increase, getTimestamp, mine, ether } from "./utils";
import { BigNumber } from "ethers";

import BalanceTree from "./balance-tree";
import { MockERC20 } from "../src/types/MockERC20";
import { RcaShield } from "../src/types/RcaShield";
import { RcaController } from "../src/types/RcaController";
import { RcaTreasury } from "../src/types/RcaTreasury";
import { RcaTreasury__factory } from "../src/types/factories/RcaTreasury__factory";
import { RcaController__factory } from "../src/types/factories/RcaController__factory";
import { RcaShield__factory } from "../src/types/factories/RcaShield__factory";
import { MockERC20__factory } from "../src/types/factories/MockERC20__factory";

import type { Contracts, MerkleProofs, MerkleTrees, Signers } from "./types";

// Testing base RCA functionalities
describe("RCAs and Controller", function () {
  const contracts = {} as Contracts;
  const signers = {} as Signers;
  const merkleTrees = {} as MerkleTrees;
  const merkleProofs = {} as MerkleProofs;

  beforeEach(async function () {
    const accounts = await ethers.getSigners();
    signers.gov = accounts[0];
    signers.user = accounts[1];
    signers.priceOracle = accounts[2];
    signers.capOracle = accounts[3];
    signers.guardian = accounts[4];
    signers.referrer = accounts[5];

    const TOKEN = <MockERC20__factory>await ethers.getContractFactory("MockERC20");
    contracts.uToken = <MockERC20>await TOKEN.deploy("Test Token", "TEST");

    const RCA_TREASURY = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");
    contracts.rcaTreasury = <RcaTreasury>await RCA_TREASURY.connect(signers.gov).deploy(signers.gov.address);

    const RCA_CONTROLLER = <RcaController__factory>await ethers.getContractFactory("RcaController");
    contracts.rcaController = <RcaController>await RCA_CONTROLLER.connect(signers.guardian).deploy(
      signers.gov.address, // governor
      signers.guardian.address, // guardian
      signers.priceOracle.address, // price oracle
      signers.capOracle.address, // capacity oracle
      0, // apr
      200, // discount (2 %)
      86400, // 1 day withdrawal delay
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

    //                                                                shield, protocol Id, %
    await contracts.rcaController
      .connect(signers.gov)
      .initializeShield(contracts.rcaShield.address, [1, 2], [10000, 10000]);

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
      { account: contracts.rcaShield.address, amount: ether("0.001") },
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

    merkleProofs.priceProof1 = merkleTrees.priceTree1.getProof(contracts.rcaShield.address, ether("0.001"));
    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShield.address, ether("100"));
    merkleProofs.liqProof2 = merkleTrees.liqTree2.getProof(contracts.rcaShield.address, ether("0"));
    merkleProofs.resProof1 = merkleTrees.resTree1.getProof(contracts.rcaShield.address, ether("0"));
    merkleProofs.resProof2 = merkleTrees.resTree2.getProof(contracts.rcaShield.address, BigNumber.from(1000));

    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());
  });

  async function getSig(userAddy: string, amount: BigNumber): Promise<[BigNumber, BigNumber, string, string]> {
    const nonce = await contracts.rcaController.nonces(userAddy);
    const timestamp = await getTimestamp();
    const expiry = timestamp.add(300);
    const hash = await contracts.rcaController.getMessageHash(
      userAddy,
      contracts.rcaShield.address,
      amount,
      nonce,
      expiry,
    );
    const signature = await signers.capOracle.signMessage(ethers.utils.arrayify(hash));

    const v = signature.substring(130, signature.length);
    const r = signature.substring(2, 66);
    const s = signature.substring(66, 130);
    const vInt = parseInt(v, 16);

    return [expiry, BigNumber.from(vInt), "0x" + r, "0x" + s];
  }

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
      const protocolPercents0 = await contracts.rcaController.shieldProtocolPercents(contracts.rcaShield.address, 0);
      const protocolPercents1 = await contracts.rcaController.shieldProtocolPercents(contracts.rcaShield.address, 1);
      expect(protocolPercents0.protocolId).to.be.equal(1);
      expect(protocolPercents1.protocolId).to.be.equal(2);
      expect(protocolPercents0.percent).to.be.equal(10000);
      expect(protocolPercents1.percent).to.be.equal(10000);
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

    // Approve rcaShield to take 1,000 underlying tokens, mint, should receive back 1,000 RCA tokens.
    it("should be able to mint an RCA token", async function () {
      // returns: expiry, v, r, s
      const userAddy = signers.user.address;
      const sigValues = await getSig(userAddy, ether("100"));
      await contracts.rcaShield
        .connect(signers.user)
        .mintTo(
          signers.user.address,
          signers.referrer.address,
          ether("100"),
          sigValues[0],
          sigValues[1],
          sigValues[2],
          sigValues[3],
          0,
          merkleProofs.liqProof1,
        );

      const rcaBal = await contracts.rcaShield.balanceOf(signers.user.address);
      expect(rcaBal).to.be.equal(ether("100"));

      // Testing minting to a different address here as well
      const sigValues2 = await getSig(signers.referrer.address, ether("50"));
      await contracts.rcaShield
        .connect(signers.referrer)
        .mintTo(
          signers.referrer.address,
          signers.user.address,
          ether("50"),
          sigValues2[0],
          sigValues2[1],
          sigValues2[2],
          sigValues2[3],
          0,
          merkleProofs.liqProof1,
        );

      const ownerBal = await contracts.rcaShield.balanceOf(signers.referrer.address);
      expect(ownerBal).to.be.equal(ether("50"));
    });

    // If one request is made after another, the amounts should add to last amounts and the endTime should restart.
    it("should mint correctly with wonky (technical term) updates", async function () {
      const sigValues = await getSig(signers.user.address, ether("1000"));
      await contracts.rcaShield
        .connect(signers.user)
        .mintTo(
          signers.user.address,
          signers.referrer.address,
          ether("1000"),
          sigValues[0],
          sigValues[1],
          sigValues[2],
          sigValues[3],
          ether("100"),
          merkleProofs.liqProof1,
        );

      await contracts.rcaController
        .connect(signers.gov)
        .setLiqTotal(merkleTrees.liqTree1.getHexRoot(), merkleTrees.resTree1.getHexRoot());
      await contracts.rcaController.connect(signers.gov).setApr(2000);
      await contracts.rcaController.connect(signers.guardian).setPercentReserved(merkleTrees.resTree2.getHexRoot());

      // Wait about half a year, so about 10% should be taken.
      increase(31536000 / 2);
      mine();

      const sigValues2 = await getSig(signers.user.address, ether("1000"));
      await contracts.rcaShield
        .connect(signers.user)
        .mintTo(
          signers.user.address,
          signers.user.address,
          ether("1000"),
          sigValues2[0],
          sigValues2[1],
          sigValues2[2],
          sigValues2[3],
          ether("100"),
          merkleProofs.liqProof1,
        );

      const uValue = <any>await contracts.rcaShield.uValue(ether("1"), ether("100"), 1000);
      const rcaValue = <any>await contracts.rcaShield.rcaValue(ether("1"), ether("100"));

      expect(uValue / 1e18).to.be.approximately(0.72, 1e-6);
      expect(rcaValue / 1e18).to.be.approximately(1.25, 1e-6);
    });
  });

  describe("Redeem", function () {
    beforeEach(async function () {
      await contracts.uToken.connect(signers.user).approve(contracts.rcaShield.address, ether("1000"));
      const sigValues = await getSig(signers.user.address, ether("100"));
      await contracts.rcaShield
        .connect(signers.user)
        .mintTo(
          signers.user.address,
          signers.referrer.address,
          ether("100"),
          sigValues[0],
          sigValues[1],
          sigValues[2],
          sigValues[3],
          0,
          merkleProofs.liqProof1,
        );
    });

    it("should be able to initiate and finalize redeem of RCA token", async function () {
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
      increase(86500);

      await contracts.rcaShield
        .connect(signers.user)
        .redeemFinalize(signers.user.address, false, ethers.constants.AddressZero, 0, merkleProofs.liqProof1);
      const rcaBal = await contracts.rcaShield.balanceOf(signers.user.address);
      const uBal = await contracts.uToken.balanceOf(signers.user.address);
      expect(rcaBal).to.be.equal(0);
      expect(uBal).to.be.equal(ether("1000000"));
    });

    // If one request is made after another, the amounts should add to last amounts
    // and the endTime should restart.
    it("should be able to stack redeem requests and reset time", async function () {
      await contracts.rcaShield.connect(signers.user).redeemRequest(ether("50"), 0, [], 0, merkleProofs.resProof1);
      // By increasing half a day we can check timestamp changing
      const startTime = await getTimestamp();
      let requests = await contracts.rcaShield.withdrawRequests(signers.user.address);
      expect(requests[0]).to.be.equal(ether("50"));
      expect(requests[1]).to.be.equal(ether("50"));
      expect(requests[2]).to.be.equal(startTime.add("86400"));

      // Wait half a day to make sure request time resets
      // (don't want both requests starting at the same time or we can't check).
      increase(43200);

      await contracts.rcaShield.connect(signers.user).redeemRequest(ether("50"), 0, [], 0, merkleProofs.resProof1);
      const secondTime = await getTimestamp();
      requests = await contracts.rcaShield.withdrawRequests(signers.user.address);
      expect(requests[0]).to.be.equal(ether("100"));
      expect(requests[1]).to.be.equal(ether("100"));
      expect(requests[2]).to.be.equal(secondTime.add("86400"));

      requests = await contracts.rcaShield.withdrawRequests(signers.user.address);
    });

    // check with zapper
  });

  describe("Purchase", function () {
    beforeEach(async function () {
      // Set capacity proof. Sorta faking, it's a 1 leaf proof.
      // Won't provide super accurate gas pricing but shouldn't cost too much more.
      await contracts.uToken.connect(signers.user).approve(contracts.rcaShield.address, ether("1000"));
      //                  to address, uAmount, capacity, cap proof, for sale, old cumulative, for sale proof
      const sigValues = await getSig(signers.user.address, ether("1000"));
      await contracts.rcaShield
        .connect(signers.user)
        .mintTo(
          signers.user.address,
          signers.referrer.address,
          ether("1000"),
          sigValues[0],
          sigValues[1],
          sigValues[2],
          sigValues[3],
          0,
          [],
        );
      await contracts.rcaController
        .connect(signers.gov)
        .setLiqTotal(merkleTrees.liqTree1.getHexRoot(), merkleTrees.resTree1.getHexRoot());
    });

    // Attempt to purchase 100 RCA tokens twice.
    it("should purchase an RCA token from liquidation", async function () {
      await contracts.rcaShield.purchaseRca(
        signers.user.address,
        ether("50"),
        ether("0.001"),
        merkleProofs.priceProof1,
        ether("100"),
        merkleProofs.liqProof1,
        {
          value: ether("0.049"),
        },
      );
      expect(await contracts.rcaShield.balanceOf(signers.user.address)).to.be.equal("1055555555555555555555");

      await contracts.rcaShield.purchaseRca(
        signers.user.address,
        ether("50"),
        ether("0.001"),
        merkleProofs.priceProof1,
        ether("100"),
        merkleProofs.liqProof1,
        {
          value: ether("0.049"),
        },
      );
      expect(await contracts.rcaShield.balanceOf(signers.user.address)).to.be.equal("1111111111111111111110");
    });

    it("should purchase underlying tokens from liquidation", async function () {
      await contracts.rcaShield.purchaseU(
        signers.user.address,
        ether("50"),
        ether("0.001"),
        merkleProofs.priceProof1,
        ether("100"),
        merkleProofs.liqProof1,
        {
          value: ether("0.049"),
        },
      );
      expect(await contracts.uToken.balanceOf(signers.user.address)).to.be.equal(ether("999050"));

      await contracts.rcaShield.purchaseU(
        signers.user.address,
        ether("50"),
        ether("0.001"),
        merkleProofs.priceProof1,
        ether("100"),
        merkleProofs.liqProof1,
        {
          value: ether("0.049"),
        },
      );
      expect(await contracts.uToken.balanceOf(signers.user.address)).to.be.equal(ether("999100"));
    });
  });

  describe("RcaController Updates", function () {
    beforeEach(async function () {
      await contracts.rcaController.connect(signers.gov).setWithdrawalDelay(100000);
      await contracts.rcaController.connect(signers.gov).setDiscount(1000);
      await contracts.rcaController.connect(signers.gov).setApr(1000);
      await contracts.rcaController.connect(signers.gov).setTreasury(signers.user.address);
      await contracts.rcaController.connect(signers.guardian).setPercentReserved(merkleTrees.resTree2.getHexRoot());
    });

    it("should update all variables", async function () {
      expect(await contracts.rcaController.apr()).to.be.equal(1000);
      expect(await contracts.rcaController.discount()).to.be.equal(1000);
      expect(await contracts.rcaController.withdrawalDelay()).to.be.equal(100000);
      expect(await contracts.rcaController.treasury()).to.be.equal(signers.user.address);

      // Mint call should update all variables on rcaShield
      await contracts.uToken.connect(signers.user).approve(contracts.rcaShield.address, ether("1000"));
      //                  to address, uAmount, capacity, cap proof, for sale, old cumulative, for sale proof
      const sigValues = await getSig(signers.user.address, ether("1000"));
      await contracts.rcaShield
        .connect(signers.user)
        .mintTo(
          signers.user.address,
          signers.referrer.address,
          ether("1000"),
          sigValues[0],
          sigValues[1],
          sigValues[2],
          sigValues[3],
          ether("100"),
          merkleProofs.liqProof1,
        );

      expect(await contracts.rcaShield.apr()).to.be.equal(1000);
      expect(await contracts.rcaShield.discount()).to.be.equal(1000);
      expect(await contracts.rcaShield.withdrawalDelay()).to.be.equal(100000);
      expect(await contracts.rcaShield.treasury()).to.be.equal(signers.user.address);

      it("should update for sale", async function () {
        await contracts.uToken.connect(signers.user).approve(contracts.rcaShield.address, ether("1000"));
        const sigValues = await getSig(signers.user.address, ether("1000"));
        await contracts.rcaShield
          .connect(signers.user)
          .mintTo(
            signers.user.address,
            signers.referrer.address,
            ether("1000"),
            sigValues[0],
            sigValues[1],
            sigValues[2],
            sigValues[3],
            ether("100"),
            merkleProofs.liqProof1,
          );

        expect(await contracts.rcaShield.amtForSale()).to.be.equal(ether("100"));
        expect(await contracts.rcaShield.cumLiqForClaims()).to.be.equal(ether("100"));
        expect(await contracts.rcaShield.percentReserved()).to.be.equal(0);
      });
    });
  });

  describe("Views", function () {
    beforeEach(async function () {
      await contracts.rcaController.connect(signers.gov).setApr(1000);
      await contracts.uToken.connect(signers.user).approve(contracts.rcaShield.address, ether("1000"));
      await contracts.rcaController
        .connect(signers.gov)
        .setLiqTotal(merkleTrees.liqTree2.getHexRoot(), merkleTrees.resTree1.getHexRoot());
      const sigValues = await getSig(signers.user.address, ether("1000"));
      await contracts.rcaShield
        .connect(signers.user)
        .mintTo(
          signers.user.address,
          signers.referrer.address,
          ether("1000"),
          sigValues[0],
          sigValues[1],
          sigValues[2],
          sigValues[3],
          0,
          merkleProofs.liqProof2,
        );
    });

    it("should update APR when needed", async function () {
      // Wait about half a year, so about 5% should be taken.
      increase(31536000 / 2);
      mine();

      const uValue = await contracts.rcaShield.uValue(ether("1"), 0, 0);
      const rcaValue = await contracts.rcaShield.rcaValue(ether("0.95"), 0);
      // Sometimes test speed discrepancies make this fail (off by a few seconds so slightly under 95%).
      expect(uValue).to.be.equal(ether("0.95"));
      expect(rcaValue).to.be.equal(ether("1"));
    });

    // Mint => wait for half a year => set liquidity => wait half a year => check.
    // Should result in 50% of original being APR and 45% (90% of 50%) of subsequent
    it("should update correctly with tokens for sale", async function () {
      increase(31536000 / 2);
      mine();

      await contracts.rcaController
        .connect(signers.gov)
        .setLiqTotal(merkleTrees.liqTree1.getHexRoot(), merkleTrees.resTree1.getHexRoot());

      increase(31536000 / 2);
      mine();

      const uValue = <any>await contracts.rcaShield.uValue(ether("1"), ether("100"), 0);
      const rcaValue = <any>await contracts.rcaShield.rcaValue(ether("1"), ether("100"));
      expect(uValue / 1e18).to.be.approximately(0.8, 1e-6);
      expect(rcaValue / 1e18).to.be.approximately(1.25, 1e-6);
    });

    // Verify APR updates for
    it("should update correctly with tokens for sale, percent paused, and APR change", async function () {
      increase(31536000 / 2);
      mine();

      await contracts.rcaController
        .connect(signers.gov)
        .setLiqTotal(merkleTrees.liqTree1.getHexRoot(), merkleTrees.resTree1.getHexRoot());
      await contracts.rcaController.connect(signers.gov).setApr(2000);
      await contracts.rcaController.connect(signers.guardian).setPercentReserved(merkleTrees.resTree2.getHexRoot());

      // Wait about half a year, so about 5% should be taken.
      increase(31536000 / 2);
      mine();

      const rcaValue = <any>await contracts.rcaShield.rcaValue(ether("1"), ether("100"));
      const uValue = <any>await contracts.rcaShield.uValue(ether("1"), ether("100"), 1000);
      const extraForSale = await contracts.rcaShield.getExtraForSale(ether("100"));

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
      expect(uValue / 1e18).to.be.approximately(0.675, 1e-6);
      expect(rcaValue / 1e18).to.be.approximately(1.333333, 1e-6);
    });
  });

  describe("Privileged", function () {
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
      await expect(contracts.rcaController.connect(signers.user).setTreasury(signers.user.address)).to.be.revertedWith(
        "msg.sender is not owner",
      );
      await expect(
        contracts.rcaController.connect(signers.gov).setPercentReserved(merkleTrees.resTree1.getHexRoot()),
      ).to.be.revertedWith("msg.sender is not Guardian");

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
        contracts.rcaController.connect(signers.gov).setPrices(merkleTrees.priceTree1.getHexRoot()),
      ).to.be.revertedWith("msg.sender is not price oracle");

      await expect(
        contracts.rcaShield.connect(signers.user).setController(signers.referrer.address),
      ).to.be.revertedWith("msg.sender is not owner");
      await expect(contracts.rcaShield.connect(signers.user).proofOfLoss(signers.referrer.address)).to.be.revertedWith(
        "msg.sender is not owner",
      );
    });
  });
});
