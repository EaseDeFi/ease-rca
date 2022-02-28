import { artifacts, ethers, waffle } from "hardhat";
import type { Artifact } from "hardhat/types";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import type { RcaTreasury } from "../src/types/RcaTreasury";
import { expect } from "chai";

type Signers = {
  gov: SignerWithAddress;
  notGov: SignerWithAddress;
  otherAccounts: SignerWithAddress[];
};
describe("RcaTreasury", function () {
  const signers = {} as Signers;
  let rcaTreasury: RcaTreasury;
  before(async function () {
    const _signers: SignerWithAddress[] = await ethers.getSigners();
    signers.gov = _signers[0];
  });

  beforeEach(async function () {
    const rcaTreasuryArtifact: Artifact = await artifacts.readArtifact("RcaTreasury");
    rcaTreasury = <RcaTreasury>await waffle.deployContract(signers.gov, rcaTreasuryArtifact, [signers.gov.address]);
  });
  describe("Governable", function () {
    it("should return valid governor", async function () {
      expect(await rcaTreasury.governor()).to.equal(signers.gov.address);
    });
  });
});
