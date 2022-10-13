import hre, { ethers } from "hardhat";
import { Contracts, MerkleProofs, MerkleTrees, Signers } from "./types";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "./constants";
import {
  RcaShieldRocketPool,
  RcaShieldRocketPool__factory,
  MockERC20,
  RcaController,
  RcaController__factory,
  RcaTreasury,
  RcaTreasury__factory,
} from "../src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ether,
  getExpectedRcaValue,
  getSignatureDetailsFromCapOracle,
  getTimestamp,
  increase,
  mine,
  resetBlockchain,
} from "./utils";
import { expect } from "chai";
import { BigNumber } from "ethers";
import BalanceTree from "./balance-tree";

const FORK_BLOCK_NUMBER = 15500000;

const VAULT_METADATA = {
  name: "rETH Ease Vault",
  symbol: "ez-rETH",
};

describe("RcaShieldRocketpool", function () {
  const contracts = {} as Contracts;
  const signers = {} as Signers;
  const merkleProofs = {} as MerkleProofs;
  const merkleTrees = {} as MerkleTrees;
  let userAddress: string;

  before(async function () {
    await resetBlockchain(FORK_BLOCK_NUMBER);
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

    // impersonate rEthWhale and send him ETH
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.rEthWhale]);
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.rEthWhale);
    await signers.otherAccounts[0].sendTransaction({
      to: signers.user.address,
      value: ether("100"),
    });

    // rETH Token
    contracts.uToken = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.rocketPool.rEthToken)
    );

    // sent some rETH to referrer
    await contracts.uToken.connect(signers.user).transfer(signers.referrer.address, ether("100"));

    // rca contract factories
    const rcaShieldRocketpoolFactory = <RcaShieldRocketPool__factory>(
      await ethers.getContractFactory("RcaShieldRocketPool")
    );
    const rcaControllerFactory = <RcaController__factory>await ethers.getContractFactory("RcaController");
    const rcaTreasuryFactory = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");

    // deploy rcaTreasury
    contracts.rcaTreasury = <RcaTreasury>await rcaTreasuryFactory.deploy(signers.gov.address);
    await contracts.rcaTreasury.deployed();

    // deploy rcaController
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
    await contracts.rcaController.deployed();

    // deploy rcaShieldRocketpool
    contracts.rcaShieldRocketPool = <RcaShieldRocketPool>(
      await rcaShieldRocketpoolFactory.deploy(
        VAULT_METADATA.name,
        VAULT_METADATA.symbol,
        contracts.uToken.address,
        signers.gov.address,
        contracts.rcaController.address,
      )
    );
    await contracts.rcaShieldRocketPool.deployed();

    // initialize rcaShieldRocketpool
    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldRocketPool.address);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldRocketPool.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);
    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShieldRocketPool.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
    ]);

    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldRocketPool.address, ether("100"));
    merkleProofs.priceProof1 = merkleTrees.priceTree1.getProof(contracts.uToken.address, ether("0.001"));

    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());
    // approve uToken to shield
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldRocketPool.address, ether("10000000"));
    await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShieldRocketPool.address, ether("10000000"));
    // init variables
    userAddress = signers.user.address;
  });

  async function mintTokenForUser(_userAddress?: string, _uAmount?: BigNumber, _shieldAddress?: string): Promise<void> {
    let userAddress;
    let uAmount;
    let shieldAddress;
    if (_userAddress == undefined || _uAmount == undefined || _shieldAddress == undefined) {
      userAddress = signers.user.address;
      uAmount = ether("100");
      shieldAddress = contracts.rcaShieldRocketPool.address;
    } else {
      userAddress = _userAddress;
      uAmount = _uAmount;
      shieldAddress = _shieldAddress;
    }

    // returns: expiry, vInt, r, s
    const sigValues = await getSignatureDetailsFromCapOracle({
      amount: uAmount,
      capOracle: signers.capOracle,
      controller: contracts.rcaController,
      userAddress,
      shieldAddress,
    });

    await contracts.rcaShieldRocketPool
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
    it("Should initialize the shield with valid state", async function () {
      expect(await contracts.rcaShieldRocketPool.name()).to.be.equal(VAULT_METADATA.name);
      expect(await contracts.rcaShieldRocketPool.symbol()).to.be.equal(VAULT_METADATA.symbol);
      expect(await contracts.rcaShieldRocketPool.uToken()).to.be.equal(contracts.uToken.address);
      expect(await contracts.rcaShieldRocketPool.governor()).to.be.equal(signers.gov.address);
      expect(await contracts.rcaShieldRocketPool.controller()).to.be.equal(contracts.rcaController.address);
    });
  });

  describe("mintTo()", function () {
    it("Should deposit users rETH tokens and mint ez-rETH tokens to user", async function () {
      let userAddress = signers.user.address;
      let uAmount = ether("101.00002");
      const shieldAddress = contracts.rcaShieldRocketPool.address;

      // Try to mint RCA from user to user
      await mintTokenForUser(userAddress, uAmount, shieldAddress);

      let expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldRocketPool,
        uAmountForRcaValue: uAmount,
        uToken: contracts.uToken,
      });

      // Check if RCA value received is same as uAmount
      let rcaBal = await contracts.rcaShieldRocketPool.balanceOf(userAddress);
      expect(rcaBal).to.be.equal(expectedRcaValue);

      // Try to mint RCA from referrer to user

      // update details for another user
      userAddress = signers.referrer.address;
      uAmount = ether("50");

      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress,
      });

      expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldRocketPool,
        uAmountForRcaValue: uAmount,
        uToken: contracts.uToken,
      });

      await contracts.rcaShieldRocketPool
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

      // Check if RCA value received is same as uAmount
      rcaBal = await contracts.rcaShieldRocketPool.balanceOf(userAddress);
      expect(rcaBal).to.be.equal(expectedRcaValue);
    });
  });

  describe("redeemRequest()", function () {
    it("Should allow user to submit withdraw request", async function () {
      await mintTokenForUser();
      const rcaAmount = ether("100");
      await contracts.rcaShieldRocketPool.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, []);
      const endTime = (await getTimestamp()).add(TIME_IN_SECS.day);
      const withdrawRequest = await contracts.rcaShieldRocketPool.withdrawRequests(userAddress);
      expect(withdrawRequest.rcaAmount).to.equal(rcaAmount);
      // since ez-token:underlying token is 1:1 for this case
      expect(withdrawRequest.uAmount).to.equal(rcaAmount);
      expect(withdrawRequest.endTime).to.equal(endTime);
    });
  });
  describe("redeemFinalize()", function () {
    it("Should allow user to submit and finalize withdraw request", async function () {
      await mintTokenForUser();
      const rcaAmount = ether("100");

      const userUtokenBalBefore = await contracts.uToken.balanceOf(userAddress);
      await contracts.rcaShieldRocketPool.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, []);
      // fast forward
      await increase(TIME_IN_SECS.day);
      await mine();

      await contracts.rcaShieldRocketPool
        .connect(signers.user)
        .redeemFinalize(userAddress, ethers.constants.AddressZero, 0, merkleProofs.liqProof1, 0, []);
      const userUtokenBalAfter = await contracts.uToken.balanceOf(userAddress);

      expect(userUtokenBalAfter.sub(userUtokenBalBefore)).to.gte(rcaAmount);
    });
  });
});
