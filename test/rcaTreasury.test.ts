import { ethers } from "hardhat";

import type { RcaTreasury } from "../src/types/RcaTreasury";
import { expect } from "chai";
import { BigNumber } from "ethers";
import ClaimTree from "./claim-tree";
import { ether } from "./utils";
import { Contracts, MerkleTrees, Signers } from "./types";
import { RcaTreasury__factory } from "../src/types/factories/RcaTreasury__factory";

describe("RcaTreasury", function () {
  const signers = {} as Signers;
  const contracts = {} as Contracts;
  const merkleTrees = {} as MerkleTrees;
  const hackId1 = BigNumber.from(1);
  const hackId2 = BigNumber.from(2);
  before(async function () {
    const accounts = await ethers.getSigners();
    signers.gov = accounts[0];
    signers.notGov = accounts[1];
    signers.pendingGov = accounts[2];
    signers.claimer = accounts[3];
    signers.claimer1 = accounts[4];
    signers.otherAccounts = accounts.slice(5);
  });

  beforeEach(async function () {
    const RCA_TREASURY = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");
    contracts.rcaTreasury = <RcaTreasury>await RCA_TREASURY.connect(signers.gov).deploy(signers.gov.address);

    // send funds to Treasury
    await signers.gov.sendTransaction({ to: contracts.rcaTreasury.address, value: ether("100") });
    merkleTrees.claimTree1 = new ClaimTree([
      { user: signers.claimer.address, hackId: hackId1, claimAmount: ether("1") },
      { user: signers.claimer1.address, hackId: hackId1, claimAmount: ether(".5") },
    ]);
    merkleTrees.claimTree2 = new ClaimTree([
      { user: signers.claimer.address, hackId: hackId2, claimAmount: ether(".1") },
      { user: signers.claimer1.address, hackId: hackId2, claimAmount: ether(".2") },
    ]);
    // Set claim root
    await contracts.rcaTreasury.setClaimsRoot(hackId1, merkleTrees.claimTree1.getHexRoot());
  });

  it("should be able to recieve ethers", async function () {
    const balanceBefore = await ethers.provider.getBalance(contracts.rcaTreasury.address);
    await signers.otherAccounts[0].sendTransaction({ to: contracts.rcaTreasury.address, value: ether("1") });
    const balanceAfter = await ethers.provider.getBalance(contracts.rcaTreasury.address);
    // balance should be updated
    expect(balanceAfter.sub(balanceBefore)).to.equal(ether("1"));
  });

  describe("Governable", function () {
    it("should return valid governor", async function () {
      expect(await contracts.rcaTreasury.governor()).to.equal(signers.gov.address);
    });
    it("should return valid value when isGov() is called", async function () {
      expect(await contracts.rcaTreasury.isGov()).to.be.equal(true);
      expect(await contracts.rcaTreasury.connect(signers.notGov).isGov()).to.be.equal(false);
    });

    it("should allow governor to transfer ownership", async function () {
      await contracts.rcaTreasury.transferOwnership(signers.pendingGov.address);
      // recieveOwnership valid call
      expect(await contracts.rcaTreasury.connect(signers.pendingGov).receiveOwnership())
        .to.emit(contracts.rcaTreasury, "OwnershipTransferred")
        .withArgs(signers.gov.address, signers.pendingGov.address);
      // governor address shoud be updated to pending gov address
      expect(await contracts.rcaTreasury.governor()).to.equal(signers.pendingGov.address);
    });

    describe("Previledged", function () {
      it("should block from previledged functions", async function () {
        await expect(
          contracts.rcaTreasury.connect(signers.notGov).transferOwnership(signers.otherAccounts[0].address),
        ).to.be.revertedWith("msg.sender is not owner");
        // transfer ownership
        await contracts.rcaTreasury.transferOwnership(signers.pendingGov.address);
        // recieveOwnership invalid call
        await expect(contracts.rcaTreasury.receiveOwnership()).to.be.revertedWith(
          "Only pending governor can call this function",
        );
      });
    });
  });

  describe("Previledged", function () {
    it("should block from previledged functions", async function () {
      // should not allow notGov to set claims root
      await expect(
        contracts.rcaTreasury.connect(signers.notGov).setClaimsRoot(hackId1, merkleTrees.claimTree2.getHexRoot()),
      ).to.be.revertedWith("msg.sender is not owner");

      // should not allow notGov to withdraw funds from treasury
      await expect(
        contracts.rcaTreasury.connect(signers.notGov).withdraw(signers.notGov.address, ether("1")),
      ).to.be.revertedWith("msg.sender is not owner");
    });
  });

  describe("setClaimsRoot()", function () {
    it("should not allow non gov to set new root", async function () {
      await expect(
        contracts.rcaTreasury.connect(signers.notGov).setClaimsRoot(hackId2, merkleTrees.claimTree2.getHexRoot()),
      ).to.be.revertedWith("msg.sender is not owner");
    });
    it("should allow governor to set new root", async function () {
      await expect(
        contracts.rcaTreasury.connect(signers.gov).setClaimsRoot(hackId2, merkleTrees.claimTree2.getHexRoot()),
      )
        .to.emit(contracts.rcaTreasury, "Root")
        .withArgs(hackId2, merkleTrees.claimTree2.getHexRoot());

      // hackId should have correct corrosponding roots
      expect(await contracts.rcaTreasury.claimsRoots(hackId1)).to.equal(merkleTrees.claimTree1.getHexRoot());
      expect(await contracts.rcaTreasury.claimsRoots(hackId2)).to.equal(merkleTrees.claimTree2.getHexRoot());
    });
  });

  describe("withdraw()", function () {
    it("should allow governor to withdraw funds from treasury", async function () {
      const transferValue = ether("2");
      const balanceBefore = await ethers.provider.getBalance(signers.notGov.address);
      await contracts.rcaTreasury.withdraw(signers.notGov.address, transferValue);
      const balanceAfter = await ethers.provider.getBalance(signers.notGov.address);
      // balance should increase by transfer value
      expect(balanceAfter.sub(balanceBefore)).to.equal(transferValue);
    });
  });

  describe("verifyClaim()", function () {
    it("should succeed if called with correct arguments", async function () {
      const user = signers.claimer.address;
      const claimAmount = ether("1");
      await contracts.rcaTreasury.verifyClaim(
        user,
        hackId1,
        claimAmount,
        merkleTrees.claimTree1.getProof(user, hackId1, claimAmount),
      );
    });
    it("should revert if called with incorrect arguments", async function () {
      const user = signers.claimer.address;
      const claimAmount = ether("1");
      const wrongClaimAmount = ether("2");
      const wrongHackId = BigNumber.from(3);

      await expect(
        contracts.rcaTreasury.verifyClaim(
          signers.notGov.address,
          hackId1,
          claimAmount,
          merkleTrees.claimTree1.getProof(user, hackId1, claimAmount),
        ),
      ).to.be.revertedWith("Incorrect capacity proof.");
      await expect(
        contracts.rcaTreasury.verifyClaim(
          user,
          wrongHackId,
          claimAmount,
          merkleTrees.claimTree1.getProof(user, hackId1, claimAmount),
        ),
      ).to.be.revertedWith("Incorrect capacity proof.");
      await expect(
        contracts.rcaTreasury.verifyClaim(
          user,
          hackId1,
          wrongClaimAmount,
          merkleTrees.claimTree1.getProof(user, hackId1, claimAmount),
        ),
      ).to.be.revertedWith("Incorrect capacity proof.");
    });
  });

  describe("claimFor()", async function () {
    it("should be able to claim cover if arguments are valid", async function () {
      const user = signers.claimer.address;
      const claimAmount = ether("1");
      const balanceBefore = await ethers.provider.getBalance(user);
      await contracts.rcaTreasury.claimFor(
        user,
        claimAmount,
        hackId1,
        merkleTrees.claimTree1.getProof(user, hackId1, claimAmount),
      );
      const balanceAfter = await ethers.provider.getBalance(user);
      // Balance of user should increase by cover claim value
      expect(balanceAfter.sub(balanceBefore)).to.equal(claimAmount);
    });
    it("should emit Claim event with valid args if claim is successful", async function () {
      const user = signers.claimer.address;
      const claimAmount = ether("1");
      expect(
        await contracts.rcaTreasury.claimFor(
          user,
          claimAmount,
          hackId1,
          merkleTrees.claimTree1.getProof(user, hackId1, claimAmount),
        ),
      )
        .to.emit(contracts.rcaTreasury, "Claim")
        .withArgs(user, hackId1, claimAmount);
    });
  });
  describe("transferOwnership", function () {
    it("should emit PendingOwnershipTransfer event with valid args", async function () {
      await expect(contracts.rcaTreasury.transferOwnership(signers.pendingGov.address))
        .to.emit(contracts.rcaTreasury, "PendingOwnershipTransfer")
        .withArgs(signers.gov.address, signers.pendingGov.address);
    });
  });

  describe("STATE:claimsRoots", function () {
    it("should return correct corrosponding roots", async function () {
      // Hex root should be empty
      expect(await contracts.rcaTreasury.claimsRoots(hackId2)).to.equal(ethers.constants.HashZero);

      await contracts.rcaTreasury.connect(signers.gov).setClaimsRoot(hackId2, merkleTrees.claimTree2.getHexRoot());
      // hackId should have correct corrosponding roots
      expect(await contracts.rcaTreasury.claimsRoots(hackId1)).to.equal(merkleTrees.claimTree1.getHexRoot());
      expect(await contracts.rcaTreasury.claimsRoots(hackId2)).to.equal(merkleTrees.claimTree2.getHexRoot());
    });
  });

  describe("STATE:claimed", function () {
    it("should update claimed mapping if user claims the cover", async function () {
      const user = signers.claimer.address;
      const claimAmount = ether("1");

      // Check claimed should be false
      expect(await contracts.rcaTreasury.claimed(user, hackId1)).to.equal(false);
      // Claim cover
      await contracts.rcaTreasury.claimFor(
        signers.claimer.address,
        ether("1"),
        hackId1,
        merkleTrees.claimTree1.getProof(user, hackId1, claimAmount),
      );
      // check claimed should be true
      expect(await contracts.rcaTreasury.claimed(signers.claimer.address, hackId1)).to.equal(true);
    });
  });
});
