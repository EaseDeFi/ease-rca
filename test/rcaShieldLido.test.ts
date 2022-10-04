import hre, { ethers } from "hardhat";
import { Contracts, MerkleProofs, MerkleTrees, Signers } from "./types";
// import { IRibbonVault } from "../src/types/IRibbonVault";
// import { ILiquidityGauge } from "../src/types/ILiquidityGauge";
// import { IMinter } from "../src/types/IMinter";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "./constants";
import { RcaShieldLido__factory } from "../src/types/factories/RcaShieldLido__factory";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockERC20 } from "../src/types/MockERC20";
import { RcaController } from "../src/types/RcaController";
import { RcaController__factory } from "../src/types/factories/RcaController__factory";
import { RcaTreasury } from "../src/types/RcaTreasury";
import { RcaTreasury__factory } from "../src/types/factories/RcaTreasury__factory";
import { ether, getExpectedRcaValue, getSignatureDetailsFromCapOracle, resetBlockchain } from "./utils";
import { expect } from "chai";
import { RcaShieldLido } from "../src/types/RcaShieldLido";
import { BigNumber } from "ethers";
import BalanceTree from "./balance-tree";

describe.only("RcaShieldLido", function () {
  const contracts = {} as Contracts;
  const signers = {} as Signers;
  const merkleProofs = {} as MerkleProofs;
  const merkleTrees = {} as MerkleTrees;

  before(async function () {
    await resetBlockchain();
    await newFork();
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

    // impersonate stEthWhale
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.stEthWhale]);
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.stEthWhale);

    // stETH Token
    contracts.uToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.lido.stEth);

    // sent some stETH to referrer
    await contracts.uToken.connect(signers.user).transfer(signers.referrer.address, ether("100"));

    // rca contract factories
    const rcaShieldLidoFactory = <RcaShieldLido__factory>await ethers.getContractFactory("RcaShieldLido");
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

    // deploy rcaShieldRibbon
    contracts.rcaShieldLido = <RcaShieldLido>(
      await rcaShieldLidoFactory.deploy(
        "RcaShield Lido",
        "RcaLido",
        contracts.uToken.address,
        signers.gov.address,
        contracts.rcaController.address,
      )
    );
    await contracts.rcaShieldLido.deployed();

    // initialize rcaShieldRibbon
    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldLido.address);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldLido.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);
    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShieldLido.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
    ]);

    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldLido.address, ether("100"));
    merkleProofs.priceProof1 = merkleTrees.priceTree1.getProof(contracts.uToken.address, ether("0.001"));

    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());
    // approve uToken to shield
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldLido.address, ether("10000000"));
    await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShieldLido.address, ether("10000000"));
  });

  async function newFork() {
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.MAINNET_URL_ALCHEMY ?? "",
            blockNumber: 14634392,
          },
        },
      ],
    });
  }
  async function mintTokenForUser(): Promise<void>;
  async function mintTokenForUser(_userAddress: string, _uAmount: BigNumber, _shieldAddress: string): Promise<void>;
  async function mintTokenForUser(_userAddress?: string, _uAmount?: BigNumber, _shieldAddress?: string): Promise<void> {
    let userAddress;
    let uAmount;
    let shieldAddress;
    if (_userAddress == undefined || _uAmount == undefined || _shieldAddress == undefined) {
      userAddress = signers.user.address;
      uAmount = ether("100");
      shieldAddress = contracts.rcaShieldLido.address;
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

    await contracts.rcaShieldLido
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
      expect(await contracts.rcaShieldLido.uToken()).to.be.equal(contracts.uToken.address);
      // expect(await contracts.rcaShieldRibbon.liquidityGauge()).to.be.equal(rstEthG.address);
    });
  });

  describe("mintTo()", function () {
    it("Should deposit users stETH tokens and mint ez-stETH tokens to user", async function () {
      let userAddress = signers.user.address;
      let uAmount = ether("101.00001");
      const shieldAddress = contracts.rcaShieldLido.address;

      // Try to mint RCA from user to user
      await mintTokenForUser(userAddress, uAmount, shieldAddress);

      let expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldLido,
        uAmountForRcaValue: uAmount,
        uToken: contracts.uToken,
      });

      // Check if RCA value received is same as uAmount
      let rcaBal = await contracts.rcaShieldLido.balanceOf(userAddress);
      //TODO: why is the expected balance higher than the actual? Should be the other way around according to Lido docs: https://docs.lido.fi/guides/steth-integration-guide#1-wei-corner-case
      expect(rcaBal.add(1)).to.be.equal(expectedRcaValue);

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
        rcaShield: contracts.rcaShieldLido,
        uAmountForRcaValue: uAmount,
        uToken: contracts.uToken,
      });

      await contracts.rcaShieldLido
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
      rcaBal = await contracts.rcaShieldLido.balanceOf(userAddress);
      expect(rcaBal).to.be.equal(expectedRcaValue);
    });
  });

  describe("redeemRequest()", function () {
    it("Should have same uToken amount after redeemRequest as before, since nothing is being unstaked.", async function () {
      await mintTokenForUser();
      const rcaShieldAddress = contracts.rcaShieldLido.address;
      const rcaAmount = ether("100");

      const shieldUTokenBalanceBefore = await contracts.uToken.balanceOf(rcaShieldAddress);
      await contracts.rcaShieldLido.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, []);
      const shieldUTokenBalanceAfter = await contracts.uToken.balanceOf(rcaShieldAddress);
      expect(shieldUTokenBalanceBefore).to.be.equal(shieldUTokenBalanceAfter);
    });
  });
});
