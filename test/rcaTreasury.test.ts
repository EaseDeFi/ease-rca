import { artifacts, ethers, waffle } from "hardhat";
import type { Artifact } from "hardhat/types";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import type { RcaTreasury } from "../src/types/RcaTreasury";
import { expect } from "chai";
import { BigNumber } from "ethers";
import ClaimTree from "./claim-tree";
import { ether } from "./utils";
// null claim root
const NULL_ROOT = "0x0000000000000000000000000000000000000000000000000000000000000000";

type Signers = {
  gov: SignerWithAddress;
  notGov: SignerWithAddress;
  pendingGov: SignerWithAddress;
  claimer: SignerWithAddress;
  claimer1: SignerWithAddress;
  otherAccounts: SignerWithAddress[];
};
describe("RcaTreasury", function () {
  const signers = {} as Signers;
  let rcaTreasury: RcaTreasury;
  let claimTree1: ClaimTree;
  let claimTree2: ClaimTree;
  const hackId1 = BigNumber.from(1);
  const hackId2 = BigNumber.from(2);
  before(async function () {
    const _signers: SignerWithAddress[] = await ethers.getSigners();
    signers.gov = _signers[0];
    signers.notGov = _signers[1];
    signers.pendingGov = _signers[2];
    signers.claimer = _signers[3];
    signers.claimer1 = _signers[4];
    signers.otherAccounts = _signers.slice(5);
  });

  beforeEach(async function () {
    const rcaTreasuryArtifact: Artifact = await artifacts.readArtifact("RcaTreasury");
    rcaTreasury = <RcaTreasury>await waffle.deployContract(signers.gov, rcaTreasuryArtifact, [signers.gov.address]);
    // send funds to Treasury
    await signers.gov.sendTransaction({ to: rcaTreasury.address, value: ether("100") });
    claimTree1 = new ClaimTree([
      { user: signers.claimer.address, hackId: hackId1, claimAmount: ether("1") },
      { user: signers.claimer1.address, hackId: hackId1, claimAmount: ether(".5") },
    ]);
    claimTree2 = new ClaimTree([
      { user: signers.claimer.address, hackId: hackId2, claimAmount: ether(".1") },
      { user: signers.claimer1.address, hackId: hackId2, claimAmount: ether(".2") },
    ]);
    // Set claim root
    await rcaTreasury.setClaimsRoot(hackId1, claimTree1.getHexRoot());
  });

  it("should be able to recieve ethers", async function () {
    const balanceBefore = await ethers.provider.getBalance(rcaTreasury.address);
    await signers.otherAccounts[0].sendTransaction({ to: rcaTreasury.address, value: ether("1") });
    const balanceAfter = await ethers.provider.getBalance(rcaTreasury.address);
    // balance should be updated
    expect(balanceAfter.sub(balanceBefore)).to.equal(ether("1"));
  });

  describe("Governable", function () {
    it("should return valid governor", async function () {
      expect(await rcaTreasury.governor()).to.equal(signers.gov.address);
    });
    it("should return valid value when isGov() is called", async function () {
      expect(await rcaTreasury.isGov()).to.be.equal(true);
      expect(await rcaTreasury.connect(signers.notGov).isGov()).to.be.equal(false);
    });

    it("should allow governor to transfer ownership", async function () {
      await rcaTreasury.transferOwnership(signers.pendingGov.address);
      // recieveOwnership valid call
      expect(await rcaTreasury.connect(signers.pendingGov).receiveOwnership())
        .to.emit(rcaTreasury, "OwnershipTransferred")
        .withArgs(signers.gov.address, signers.pendingGov.address);
      // governor address shoud be updated to pending gov address
      expect(await rcaTreasury.governor()).to.equal(signers.pendingGov.address);
    });

    describe("Previledged", function () {
      it("should block from previledged functions", async function () {
        await expect(
          rcaTreasury.connect(signers.notGov).transferOwnership(signers.otherAccounts[0].address),
        ).to.be.revertedWith("msg.sender is not owner");
        // transfer ownership
        await rcaTreasury.transferOwnership(signers.pendingGov.address);
        // recieveOwnership invalid call
        await expect(rcaTreasury.receiveOwnership()).to.be.revertedWith("Only pending governor can call this function");
      });
    });
  });

  describe("Previledged", function () {
    it("should block from previledged functions", async function () {
      // should not allow notGov to set claims root
      await expect(
        rcaTreasury.connect(signers.notGov).setClaimsRoot(hackId1, claimTree2.getHexRoot()),
      ).to.be.revertedWith("msg.sender is not owner");

      // should not allow notGov to withdraw funds from treasury
      await expect(rcaTreasury.connect(signers.notGov).withdraw(signers.notGov.address, ether("1"))).to.be.revertedWith(
        "msg.sender is not owner",
      );
    });
  });

  describe("setClaimsRoot()", function () {
    it("should not allow non gov to set new root", async function () {
      await expect(
        rcaTreasury.connect(signers.notGov).setClaimsRoot(hackId2, claimTree2.getHexRoot()),
      ).to.be.revertedWith("msg.sender is not owner");
    });
    it("should allow governor to set new root", async function () {
      await expect(rcaTreasury.connect(signers.gov).setClaimsRoot(hackId2, claimTree2.getHexRoot()))
        .to.emit(rcaTreasury, "Root")
        .withArgs(hackId2, claimTree2.getHexRoot());

      // hackId should have correct corrosponding roots
      expect(await rcaTreasury.claimsRoots(hackId1)).to.equal(claimTree1.getHexRoot());
      expect(await rcaTreasury.claimsRoots(hackId2)).to.equal(claimTree2.getHexRoot());
    });
  });

  describe("withdraw()", function () {
    it("should allow governor to withdraw funds from treasury", async function () {
      const transferValue = ether("2");
      const balanceBefore = await ethers.provider.getBalance(signers.notGov.address);
      await rcaTreasury.withdraw(signers.notGov.address, transferValue);
      const balanceAfter = await ethers.provider.getBalance(signers.notGov.address);
      // balance should increase by transfer value
      expect(balanceAfter.sub(balanceBefore)).to.equal(transferValue);
    });
  });

  describe("verifyClaim()", function () {
    it("should succeed if called with correct arguments", async function () {
      const user = signers.claimer.address;
      const claimAmount = ether("1");
      await rcaTreasury.verifyClaim(user, hackId1, claimAmount, claimTree1.getProof(user, hackId1, claimAmount));
    });
    it("should revert if called with incorrect arguments", async function () {
      const user = signers.claimer.address;
      const claimAmount = ether("1");
      const wrongClaimAmount = ether("2");
      const wrongHackId = BigNumber.from(3);

      await expect(
        rcaTreasury.verifyClaim(
          signers.notGov.address,
          hackId1,
          claimAmount,
          claimTree1.getProof(user, hackId1, claimAmount),
        ),
      ).to.be.revertedWith("Incorrect capacity proof.");
      await expect(
        rcaTreasury.verifyClaim(user, wrongHackId, claimAmount, claimTree1.getProof(user, hackId1, claimAmount)),
      ).to.be.revertedWith("Incorrect capacity proof.");
      await expect(
        rcaTreasury.verifyClaim(user, hackId1, wrongClaimAmount, claimTree1.getProof(user, hackId1, claimAmount)),
      ).to.be.revertedWith("Incorrect capacity proof.");
    });
  });

  describe("claimFor()", async function () {
    it("should be able to claim cover if arguments are valid", async function () {
      const user = signers.claimer.address;
      const claimAmount = ether("1");
      const balanceBefore = await ethers.provider.getBalance(user);
      await rcaTreasury.claimFor(user, claimAmount, hackId1, claimTree1.getProof(user, hackId1, claimAmount));
      const balanceAfter = await ethers.provider.getBalance(user);
      // Balance of user should increase by cover claim value
      expect(balanceAfter.sub(balanceBefore)).to.equal(claimAmount);
    });
  });

  describe("STATE:claimsRoots", function () {
    it("should return correct corrosponding roots", async function () {
      // Hex root should be empty
      expect(await rcaTreasury.claimsRoots(hackId2)).to.equal(NULL_ROOT);

      await rcaTreasury.connect(signers.gov).setClaimsRoot(hackId2, claimTree2.getHexRoot());
      // hackId should have correct corrosponding roots
      expect(await rcaTreasury.claimsRoots(hackId1)).to.equal(claimTree1.getHexRoot());
      expect(await rcaTreasury.claimsRoots(hackId2)).to.equal(claimTree2.getHexRoot());
    });
  });

  describe("STATE:claimed", function () {
    it("should update claimed mapping if user claims the cover", async function () {
      const user = signers.claimer.address;
      const claimAmount = ether("1");

      // Check claimed should be false
      expect(await rcaTreasury.claimed(user, hackId1)).to.equal(false);
      // Claim cover
      await rcaTreasury.claimFor(
        signers.claimer.address,
        ether("1"),
        hackId1,
        claimTree1.getProof(user, hackId1, claimAmount),
      );
      // check claimed should be true
      expect(await rcaTreasury.claimed(signers.claimer.address, hackId1)).to.equal(true);
    });
  });
});
