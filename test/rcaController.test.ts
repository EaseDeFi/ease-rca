import { expect } from "chai";
import { ethers } from "hardhat";
import { fastForward, getTimestamp, mine, ether, getSignatureDetailsFromCapOracle } from "./utils";
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
describe("RCA controller", function () {
  const contracts = {} as Contracts;
  const signers = {} as Signers;
  const merkleTrees = {} as MerkleTrees;
  const merkleProofs = {} as MerkleProofs;

  const withDrawalDelay = BigNumber.from(86400);
  const discount = BigNumber.from(200); // 2%
  const apr = BigNumber.from(0);

  const rcaTokenName = "Test Token RCA";
  const rcaTokenSymbol = "TEST-RCA";
  beforeEach(async function () {
    const accounts = await ethers.getSigners();
    signers.gov = accounts[0];
    signers.user = accounts[1];
    signers.priceOracle = accounts[2];
    signers.capOracle = accounts[3];
    signers.guardian = accounts[4];
    signers.referrer = accounts[5];
    signers.notGov = accounts[6];

    signers.otherAccounts = accounts.slice(7);

    const TOKEN = <MockERC20__factory>await ethers.getContractFactory("MockERC20");
    contracts.uToken = <MockERC20>await TOKEN.deploy("Test Token", "TEST", BigNumber.from(18));

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
      rcaTokenName, // token name
      rcaTokenSymbol, // symbol
      contracts.uToken.address, // underlying token
      signers.gov.address, // governor
      contracts.rcaController.address, // rcaController
    );

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

    // Set price tree with different rate.
    merkleTrees.priceTree2 = new BalanceTree([
      { account: contracts.uToken.address, amount: ether("0.002") },
      { account: contracts.rcaController.address, amount: ether("0.002") },
    ]);
    // Set reserved tree with 0 reserved.
    merkleTrees.resTree1 = new BalanceTree([
      { account: contracts.rcaShield.address, amount: BigNumber.from(0) },
      { account: contracts.rcaController.address, amount: BigNumber.from(0) },
    ]);

    // Set reserved tree with 10% reserved.
    merkleTrees.resTree2 = new BalanceTree([
      { account: contracts.rcaShield.address, amount: BigNumber.from(1000) },
      { account: contracts.rcaController.address, amount: BigNumber.from(1000) },
    ]);

    merkleProofs.priceProof1 = merkleTrees.priceTree1.getProof(contracts.uToken.address, ether("0.001"));
    merkleProofs.priceProof2 = merkleTrees.priceTree2.getProof(contracts.uToken.address, ether("0.002"));
    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShield.address, ether("100"));
    merkleProofs.liqProof2 = merkleTrees.liqTree2.getProof(contracts.rcaShield.address, ether("0"));
    merkleProofs.resProof1 = merkleTrees.resTree1.getProof(contracts.rcaShield.address, ether("0"));
    merkleProofs.resProof2 = merkleTrees.resTree2.getProof(contracts.rcaShield.address, BigNumber.from(1000));

    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());
  });

  describe("#initialState", function () {
    beforeEach(async function () {
      // initialize shield
      await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShield.address);
    });
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
    });
  });
  describe("verifyCapacitySig()", function () {
    beforeEach(async function () {
      // initialize shield
      await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShield.address);
    });
    it("should succeed if valid arguments are passed", async function () {
      // approve tokens on user behalf
      await contracts.uToken.connect(signers.user).approve(contracts.rcaShield.address, ether("10000000"));
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
          merkleProofs.liqProof1,
        );
    });
    it("should revert if signature is expired", async function () {
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
      await fastForward(400);
      await mine();

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
      ).to.be.revertedWith("Capacity permission has expired.");
    });
    it("should revert if signer is not cap oracle", async function () {
      const userAddress = signers.user.address;
      const uAmount = ether("100");
      // returns: expiry, v, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.priceOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShield.address,
      });
      await fastForward(200);
      mine();

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
      ).to.be.revertedWith("Invalid capacity oracle signature.");
    });
  });
  describe("verifyLiq()", function () {
    beforeEach(async function () {
      const newLiquidityRoot = merkleTrees.liqTree1.getHexRoot();
      const newReservedRoot = merkleTrees.resTree1.getHexRoot();
      await contracts.rcaController.connect(signers.gov).setLiqTotal(newLiquidityRoot, newReservedRoot);
    });

    it("should succeed if valid arguments are passed", async function () {
      const shield = contracts.rcaShield.address;
      const proof = merkleProofs.liqProof1;
      const liqForClaims = ether("100");
      // if this doesn't throw error that means function call worked successfully
      await contracts.rcaController.verifyLiq(shield, liqForClaims, proof);
    });

    it("should revert if invalid args are passed", async function () {
      const newLiquidityRoot = merkleTrees.liqTree1.getHexRoot();
      const newReservedRoot = merkleTrees.resTree1.getHexRoot();
      await contracts.rcaController.connect(signers.gov).setLiqTotal(newLiquidityRoot, newReservedRoot);
      let shield = contracts.uToken.address;
      let proof = merkleProofs.liqProof1;
      let liqForClaims = ether("100");

      // if shield address is incorrect
      await expect(contracts.rcaController.verifyLiq(shield, liqForClaims, proof)).to.be.revertedWith(
        "Incorrect liq proof.",
      );

      // if liqForClaims is incorrect
      liqForClaims = ether("50");
      shield = contracts.rcaShield.address;
      await expect(contracts.rcaController.verifyLiq(shield, liqForClaims, proof)).to.be.revertedWith(
        "Incorrect liq proof.",
      );

      // if liqProof is incorrect
      liqForClaims = ether("100");
      proof = merkleProofs.liqProof2;
      await expect(contracts.rcaController.verifyLiq(shield, liqForClaims, proof)).to.be.revertedWith(
        "Incorrect liq proof.",
      );
    });
  });

  describe("verifyPrice()", function () {
    it("should succeed if valid arguments are passed", async function () {
      const ethPrice = ether("0.001");
      await contracts.rcaController.verifyPrice(contracts.uToken.address, ethPrice, merkleProofs.priceProof1);
    });
    it("should fail if invalid arguments are passed", async function () {
      let ethPrice = ether("0.002");
      let shieldAddress = contracts.rcaShield.address;
      let priceProof = merkleProofs.priceProof1;
      // when eth price is wrong
      await expect(contracts.rcaController.verifyPrice(shieldAddress, ethPrice, priceProof)).to.be.revertedWith(
        "Incorrect price proof.",
      );
      ethPrice = ether("0.001");
      // when price proof is wrong
      ethPrice = ether("0.001");
      priceProof = merkleProofs.priceProof2;
      await expect(contracts.rcaController.verifyPrice(shieldAddress, ethPrice, priceProof)).to.be.revertedWith(
        "Incorrect price proof.",
      );
      // when shieldAddress is wrong
      shieldAddress = contracts.rcaTreasury.address;
      priceProof = merkleProofs.priceProof1;
      await expect(contracts.rcaController.verifyPrice(shieldAddress, ethPrice, priceProof)).to.be.revertedWith(
        "Incorrect price proof.",
      );
    });
  });

  describe("verifyReserved()", function () {
    beforeEach(async function () {
      const newLiquidityRoot = merkleTrees.liqTree1.getHexRoot();
      const newReservedRoot = merkleTrees.resTree2.getHexRoot();
      await contracts.rcaController.connect(signers.gov).setLiqTotal(newLiquidityRoot, newReservedRoot);
    });
    it("should succeed if valid arguments are passed", async function () {
      const shield = contracts.rcaShield.address;
      const proof = merkleProofs.resProof2;
      const reservedPercentage = BigNumber.from(1000);
      // if this doesn't throw error that means function call worked successfully
      await contracts.rcaController.verifyReserved(shield, reservedPercentage, proof);
    });
    it("should fail if invalid arguments are passed", async function () {
      let shield = contracts.uToken.address;
      let proof = merkleProofs.resProof2;
      let reservedPercentage = BigNumber.from(1000);
      // when shield address is wrong
      await expect(contracts.rcaController.verifyReserved(shield, reservedPercentage, proof)).to.be.revertedWith(
        "Incorrect capacity proof.",
      );
      // when reserve proof is wrong
      shield = contracts.rcaShield.address;
      proof = merkleProofs.resProof1;
      await expect(contracts.rcaController.verifyReserved(shield, reservedPercentage, proof)).to.be.revertedWith(
        "Incorrect capacity proof.",
      );
      // when reserve precentage is wrong
      proof = merkleProofs.resProof2;
      reservedPercentage = BigNumber.from(500);
      await expect(contracts.rcaController.verifyReserved(shield, reservedPercentage, proof)).to.be.revertedWith(
        "Incorrect capacity proof.",
      );
    });
  });
  describe("balancesOfs() & requestOfs()", function () {
    it("should return correct uToken balance of a user", async function () {
      const user = signers.user.address;
      const uToken = contracts.uToken.address;
      const userUTokenBalance = await contracts.uToken.balanceOf(user);
      const balances = await contracts.rcaController.balanceOfs(user, [uToken]);
      expect(balances[0]).to.equal(userUTokenBalance);
    });
    it("should return correct withdraw request of a user", async function () {
      const user = signers.user.address;
      const requests = await contracts.rcaController.requestOfs(user, [contracts.rcaShield.address]);
      expect(requests[0][0]).to.equal(0);
      expect(requests[0][1]).to.equal(0);
      expect(requests[0][2]).to.equal(0);
    });
  });
  describe("getMessageHash()", function () {
    it("should return correct message hash", async function () {
      const user = signers.user.address;
      const shield = contracts.rcaShield.address;
      const amount = ether("1");
      const nonce = await contracts.rcaController.nonces(user);
      const expiry = BigNumber.from(1000);
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const messageHash = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ["string", "uint256", "address", "address", "address", "uint256", "uint256", "uint256"],
          ["EASE_RCA_CONTROLLER_1.0", chainId, contracts.rcaController.address, user, shield, amount, nonce, expiry],
        ),
      );
      expect(await contracts.rcaController.getMessageHash(user, shield, amount, nonce, expiry)).to.equal(messageHash);
    });
  });
  describe("initializeShield()", function () {
    it("should update protocol state", async function () {
      const shieldAddress = contracts.rcaShield.address;
      await contracts.rcaController.connect(signers.gov).initializeShield(shieldAddress);
      // check shield mapping for shield address
      expect(await contracts.rcaController.shieldMapping(shieldAddress)).to.equal(true);
      // check if active shields is updated
      expect(await contracts.rcaController.activeShields(shieldAddress)).to.be.equal(true);
      // check if last shield update is updated
      const blockTimestamp = await getTimestamp();
      expect(await contracts.rcaController.lastShieldUpdate(shieldAddress)).to.equal(blockTimestamp);
    });
    it("should emit ShieldCreated event with valid arguments", async function () {
      const shieldAddress = contracts.rcaShield.address;
      const uTokenAddress = contracts.uToken.address;
      const blockTimestamp = (await getTimestamp()).add(1);
      await expect(contracts.rcaController.connect(signers.gov).initializeShield(shieldAddress))
        .to.emit(contracts.rcaController, "ShieldCreated")
        .withArgs(shieldAddress, uTokenAddress, rcaTokenName, rcaTokenSymbol, blockTimestamp);
    });
  });
  describe("setLiqTotal()", function () {
    let liqRoot: string;
    let reservedRoot: string;
    beforeEach(async function () {
      liqRoot = merkleTrees.liqTree1.getHexRoot();
      reservedRoot = merkleTrees.resTree1.getHexRoot();
      await contracts.rcaController.connect(signers.gov).setLiqTotal(liqRoot, reservedRoot);
    });

    it("should set new liqForClaims, reservedRoot, and update the protocol state correctly", async function () {
      // check for old roots
      expect(await contracts.rcaController.liqForClaimsRoot()).to.equal(liqRoot);
      expect(await contracts.rcaController.reservedRoot()).to.equal(reservedRoot);

      const newLiqRoot = merkleTrees.liqTree2.getHexRoot();
      const newReservedRoot = merkleTrees.resTree2.getHexRoot();
      // update price root and reserved root
      await contracts.rcaController.connect(signers.gov).setLiqTotal(newLiqRoot, newReservedRoot);
      // check for updated roots
      expect(await contracts.rcaController.liqForClaimsRoot()).to.equal(newLiqRoot);
      expect(await contracts.rcaController.reservedRoot()).to.equal(newReservedRoot);
    });
  });
  describe("setWithdrawalDelay()", function () {
    it("should revert if new withdrawal delay is more than 7 days", async function () {
      // set new withdrawal delay
      const withDrawalDelay = BigNumber.from(8 * 24 * 60 * 60);
      await expect(contracts.rcaController.connect(signers.gov).setWithdrawalDelay(withDrawalDelay)).to.be.revertedWith(
        "Withdrawal delay may not be more than 7 days.",
      );
    });
    it("should set new withdrawal delay and update protocol state correctly", async function () {
      // set new withdrawal delay
      const withDrawalDelay = BigNumber.from(2 * 24 * 60 * 60);
      await contracts.rcaController.connect(signers.gov).setWithdrawalDelay(withDrawalDelay);
      // check for new
      const systemUpdates = await contracts.rcaController.systemUpdates();
      const blockTimestamp = await getTimestamp();
      expect(systemUpdates.withdrawalDelayUpdate).to.equal(blockTimestamp);
      expect(await contracts.rcaController.withdrawalDelay()).to.equal(withDrawalDelay);
    });
  });
  describe("setDiscount()", function () {
    it("should revert if new discount is more than 25%", async function () {
      const discount = BigNumber.from(2600);
      await expect(contracts.rcaController.connect(signers.gov).setDiscount(discount)).to.be.revertedWith(
        "Discount may not be more than 25%.",
      );
    });
    it("should set new discount and update protocol state correctly", async function () {
      const newDiscount = BigNumber.from(1500);
      await contracts.rcaController.connect(signers.gov).setDiscount(newDiscount);
      // check for new discount update
      expect(await contracts.rcaController.discount()).to.equal(newDiscount);
      const systemUpdates = await contracts.rcaController.systemUpdates();
      const blockTimestamp = await getTimestamp();
      // check for last system updates for discount
      expect(systemUpdates.discountUpdate).to.equal(blockTimestamp);
    });
  });
  describe("setApr()", function () {
    it("should revert if new apr is more than 20%", async function () {
      const apr = BigNumber.from(2100);
      await expect(contracts.rcaController.connect(signers.gov).setApr(apr)).to.be.revertedWith(
        "APR may not be more than 20%.",
      );
    });
    it("should set new apr and update protocol state correctly", async function () {
      const newApr = BigNumber.from(1500);
      await contracts.rcaController.connect(signers.gov).setApr(newApr);
      // check for new apr update
      expect(await contracts.rcaController.apr()).to.equal(newApr);
      const systemUpdates = await contracts.rcaController.systemUpdates();
      const blockTimestamp = await getTimestamp();
      // check for last system updates for aprUpdate
      expect(systemUpdates.aprUpdate).to.equal(blockTimestamp);
    });
  });
  describe("setTreasury()", function () {
    it("should set new treasury and update protocol state correctly", async function () {
      const newTreasuryAddress = signers.otherAccounts[0].address;
      await contracts.rcaController.connect(signers.gov).setTreasury(newTreasuryAddress);
      // check for new treasury update
      expect(await contracts.rcaController.treasury()).to.equal(newTreasuryAddress);
      const systemUpdates = await contracts.rcaController.systemUpdates();
      const blockTimestamp = await getTimestamp();
      // check for last system updates for treasuryUpdate
      expect(systemUpdates.treasuryUpdate).to.equal(blockTimestamp);
    });
  });
  describe("cancelShield()", function () {
    it("should cancel shield support", async function () {
      const shieldAddress = contracts.rcaShield.address;
      await contracts.rcaController.connect(signers.gov).initializeShield(shieldAddress);
      expect(await contracts.rcaController.activeShields(shieldAddress)).to.be.equal(true);

      // cancleShield support
      await contracts.rcaController.connect(signers.gov).cancelShield([shieldAddress]);
      expect(await contracts.rcaController.activeShields(shieldAddress)).to.be.equal(false);
    });
    it("should emit ShieldCancelled event with valid args", async function () {
      const shieldAddress = contracts.rcaShield.address;
      await contracts.rcaController.connect(signers.gov).initializeShield(shieldAddress);
      expect(await contracts.rcaController.activeShields(shieldAddress))
        .to.emit(contracts.rcaController, "ShieldCancelled")
        .withArgs([shieldAddress]);

      // cancleShield support
      await contracts.rcaController.connect(signers.gov).cancelShield([shieldAddress]);
      expect(await contracts.rcaController.activeShields(shieldAddress)).to.be.equal(false);
    });
  });
  describe("setPercentReserved()", function () {
    it("should set precentReserved and update protocol state correctly", async function () {
      const newReservedRoot = merkleTrees.resTree2.getHexRoot();
      await contracts.rcaController.connect(signers.guardian).setPercentReserved(newReservedRoot);
      // check for new reserved root update
      expect(await contracts.rcaController.reservedRoot()).to.equal(newReservedRoot);
      const systemUpdates = await contracts.rcaController.systemUpdates();
      const blockTimestamp = await getTimestamp();
      // check for last system updates for reservedUpdate
      expect(systemUpdates.reservedUpdate).to.equal(blockTimestamp);
    });
  });
  describe("setPrices()", function () {
    it("should set priceRoot and update protocol state correctly", async function () {
      const newPriceRoot = merkleTrees.priceTree2.getHexRoot();
      await contracts.rcaController.connect(signers.priceOracle).setPrices(newPriceRoot);
      // check for new priceRoot root update
      expect(await contracts.rcaController.priceRoot()).to.equal(newPriceRoot);
    });
  });
  describe("setRouterVerified()", function () {
    it("should whitelist a router", async function () {
      const newRouter = signers.notGov.address;
      await contracts.rcaController.connect(signers.guardian).setRouterVerified(newRouter, true);
      expect(await contracts.rcaController.isRouterVerified(newRouter)).to.be.equal(true);
    });
    it("should remove whitelisted router", async function () {
      const newRouter = signers.notGov.address;
      // white list router
      await contracts.rcaController.connect(signers.guardian).setRouterVerified(newRouter, true);
      // delist router
      await contracts.rcaController.connect(signers.guardian).setRouterVerified(newRouter, false);
      expect(await contracts.rcaController.isRouterVerified(newRouter)).to.be.equal(false);
    });
  });

  describe("#previledged", function () {
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
      await expect(
        contracts.rcaController.connect(signers.gov).setPrices(merkleTrees.priceTree1.getHexRoot()),
      ).to.be.revertedWith("msg.sender is not price oracle");
      await expect(
        contracts.rcaController.connect(signers.gov).setRouterVerified(contracts.rcaShield.address, true),
      ).to.be.revertedWith("msg.sender is not Guardian");
    });
  });
});
