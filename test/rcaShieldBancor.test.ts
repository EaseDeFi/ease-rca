import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { Contracts, MerkleProofs, MerkleTrees, Signers } from "./types";
import { IStandardRewards } from "../src/types/IStandardRewards";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "./constants";
import { RcaShieldBancor } from "../src/types/RcaShieldBancor";
import { RcaShieldBancor__factory } from '../src/types/factories/RcaShieldBancor__factory'
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockERC20 } from "../src/types/MockERC20";
import { RcaController } from "../src/types/RcaController";
import { RcaController__factory } from "../src/types/factories/RcaController__factory";
import { RcaTreasury } from "../src/types/RcaTreasury";
import { RcaTreasury__factory } from "../src/types/factories/RcaTreasury__factory";
import { ether, getExpectedRcaValue, getSignatureDetailsFromCapOracle, increase, mine, resetBlockchain } from "./utils";
import BalanceTree from "./balance-tree";

// SOME TESTS ONLY WORK AROUND BLOCK HEIGHT 14780000 AND HIGHER DUE TO WHALE BALANCE AND ONCHAIN DEPLOYED CONTRACTS

describe("RcaShieldBancor", function () {
  const idETH = BigNumber.from(MAINNET_ADDRESSES.contracts.bancor.idETH);
  const contracts = {} as Contracts
  let standardRewards: IStandardRewards;
  let bntToken: MockERC20;
  const signers = {} as Signers;
  const merkleProofs = {} as MerkleProofs;
  const merkleTrees = {} as MerkleTrees;

  before(async function () {
    await resetBlockchain();
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

    // impersonate bnEthWhale
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.bnEthWhale]);
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.bnEthWhale);

    // bnETH
    contracts.uToken = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.bancor.bnETH)
    );

    bntToken = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.bancor.bntToken)
    );

    standardRewards = <IStandardRewards>(
      await ethers.getContractAt("IStandardRewards", MAINNET_ADDRESSES.contracts.bancor.standardRewards)
    );

    // send some bnETH tokens to the referrer
    await contracts.uToken.connect(signers.user).transfer(signers.referrer.address, ether("100"));

    // rca contract factories
    const rcaShieldBancorFactory = <RcaShieldBancor__factory>await ethers.getContractFactory("RcaShieldBancor");
    const rcaControllerFactory = <RcaController__factory>await ethers.getContractFactory("RcaController");
    const rcaTreasuryFactory = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");

    contracts.rcaTreasury = <RcaTreasury>await rcaTreasuryFactory.deploy(signers.gov.address);
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
    await contracts.rcaController.deployed();
    
    contracts.rcaShieldBancor = <RcaShieldBancor>(
      await rcaShieldBancorFactory.deploy(
        "RcaShield Bancor",
        "RcaBancor",
        contracts.uToken.address,
        BigNumber.from(18),
        signers.gov.address,
        contracts.rcaController.address,
        standardRewards.address,
        idETH
      )
    );
    await contracts.rcaShieldBancor.deployed();
    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldBancor.address);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldBancor.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") }
    ]);

    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShieldBancor.address, amount: ether("0.0007") },
      { account: contracts.rcaController.address, amount: ether("0.0007") },
      { account: contracts.uToken.address, amount: ether("0.0007") },
      { account: bntToken.address, amount: ether("0.0007") },
    ]);
    
    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldBancor.address, ether("100"));
    merkleProofs.priceProof1 = merkleTrees.priceTree1.getProof(contracts.uToken.address, ether("0.0007"));

    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());

    // approve uToken to shield
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldBancor.address, ether("10000000"));
    await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShieldBancor.address, ether("10000000"));
  });

  async function mintTokenForUser(): Promise<void>;
  async function mintTokenForUser(_userAddress: string, _uAmount: BigNumber, _shieldAddress: string): Promise<void>;
  async function mintTokenForUser(_userAddress?: string, _uAmount?: BigNumber, _shieldAddress?: string): Promise<void> {
    let userAddress;
    let uAmount;
    let shieldAddress;
    if (_userAddress == undefined || _uAmount == undefined || _shieldAddress == undefined) {
      userAddress = signers.user.address;
      uAmount = ether("1000");
      shieldAddress = contracts.rcaShieldBancor.address;
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

    await contracts.rcaShieldBancor
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
      // expect(await contracts.rcaShieldBancor.bancorNetwork()).to.be.equal(bancorNetwork.address);
      expect(await contracts.rcaShieldBancor.standardRewards()).to.be.equal(standardRewards.address);
      expect(await contracts.rcaShieldBancor.id()).to.be.equal(idETH);
    });
  });

  describe("mintTo()", function () {
    it("Should deposit bnTokens to Standard Rewards V3 after mintTo self", async function () {
      let userAddress = signers.user.address;
      let uAmount = ether("100");
      const shieldAddress = contracts.rcaShieldBancor.address;
      await mintTokenForUser(userAddress, uAmount, shieldAddress);

      let expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldBancor,
        uAmountForRcaValue: ether("100"),
        uToken: contracts.uToken
      });

      // Check if RCA value received is same as uAmount
      let rcaBal = await contracts.rcaShieldBancor.balanceOf(userAddress)  
      expect(rcaBal).to.be.equal(expectedRcaValue);

      let shieldDepositInfo = await standardRewards.providerStake(shieldAddress, idETH);
      expect(shieldDepositInfo).to.be.equal(uAmount)

      // Try to mint RCA for another user

      // update details for another user
      userAddress = signers.referrer.address;
      uAmount = ether("50");

      let sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress,
      });

      // returns: expiry, vInt, r, s
      sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmount,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress
      });

      expectedRcaValue = await getExpectedRcaValue({
        newCumLiqForClaims: BigNumber.from(0),
        rcaShield: contracts.rcaShieldBancor,
        uAmountForRcaValue: uAmount,
        uToken: contracts.uToken
      });

      await contracts.rcaShieldBancor
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
          merkleProofs.liqProof1
        );

      // Check if RCA value received is same as uAmount
      rcaBal = await contracts.rcaShieldBancor.balanceOf(userAddress); 
      expect(rcaBal).to.be.equal(expectedRcaValue);

      shieldDepositInfo = await standardRewards.providerStake(shieldAddress, idETH);
      const totalUDepositedToShield = uAmount.add(ether("100"));
      expect(shieldDepositInfo).to.be.equal(totalUDepositedToShield);

    });
  });

  describe("getReward()", function () {
    it("Should update shield balance with reward tokens", async function () {
      const shieldAddress = contracts.rcaShieldBancor.address;
      await mintTokenForUser(signers.user.address, ether("100"), shieldAddress);

      await increase(TIME_IN_SECS.halfYear);
      await mine();
      const shieldBancorBalanceBefore = await bntToken.balanceOf(shieldAddress);
      await contracts.rcaShieldBancor.getReward();
      const shieldBancorBalanceAfter = await bntToken.balanceOf(shieldAddress);
      expect(shieldBancorBalanceAfter).to.be.gt(shieldBancorBalanceBefore);
    });

    afterEach(async function () {
      await resetBlockchain();
    });
  });

  describe("purchase()", function () {
    it("Should not allow user to buy uToken", async function () {
      await mintTokenForUser();
      await increase(TIME_IN_SECS.halfYear);
      await mine();

      await contracts.rcaShieldBancor.getReward();

      const bntPrice = ether("0.0007")
      const bntPriceProof = merkleTrees.priceTree1.getProof(bntToken.address, bntPrice);
      const bntAmountToBuy = ether("100");

      // underlying price proof
      const underLyingPrice = ether("0.0007");
      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);

      await expect(
        contracts.rcaShieldBancor
        .connect(signers.user)
        .purchase(
          contracts.uToken.address,
          bntAmountToBuy,
          bntPrice,
          bntPriceProof,
          underLyingPrice,
          underLyingPriceProof
        ),
      ).to.be.revertedWith("cannot buy underlying token");
    });

    //TODO: make the test activate or deactivte isProgramActive status to get consistent results. This might fluctuate with block height since bancor team might change this or is just "false" for future blocks that have not been minted yet.
    it("Should allow a user to buy claimed BNT tokens and let the shield deposit uToken into StandardRewards contract", async function () {
      await mintTokenForUser();
      await increase(TIME_IN_SECS.week);
      await mine();
      
      await contracts.rcaShieldBancor.getReward();

      const bntPrice = ether("0.0007");
      const bntPriceProof = merkleTrees.priceTree1.getProof(bntToken.address, bntPrice);
      const bntAmountToBuy = ether("10");

      // underlying price proof
      const underLyingPrice = ether("0.0007");
      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underLyingPrice);

      const shieldAddress = contracts.rcaShieldBancor.address;
      const userAddress = signers.user.address

      const userBNTBalanceBefore = await bntToken.balanceOf(userAddress);
      const shieldBNTBalanceBefore = await standardRewards.providerStake(shieldAddress, idETH);

      await contracts.rcaShieldBancor
        .connect(signers.user)
        .purchase(
          bntToken.address,
          bntAmountToBuy,
          bntPrice,
          bntPriceProof,
          underLyingPrice,
          underLyingPriceProof
        );

      const userBNTBalanceAfter = await bntToken.balanceOf(userAddress);
      const shieldBNTBalanceAfter = await standardRewards.providerStake(shieldAddress, idETH);

      expect(userBNTBalanceAfter.sub(userBNTBalanceBefore)).to.be.equal(bntAmountToBuy);
      expect(shieldBNTBalanceAfter.sub(shieldBNTBalanceBefore)).to.be.equal(bntAmountToBuy);
    });

    it("Should activate and deactivate rewards program for pool", async function () {
      const isActive = await standardRewards.isProgramActive(idETH);
      expect(isActive).to.be.equal(true);
    }); 

    afterEach(async function () {
      await resetBlockchain();
    });
  });
});