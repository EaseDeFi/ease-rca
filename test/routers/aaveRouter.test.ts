import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import hre, { ethers } from "hardhat";
import { BigNumber } from "ethers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import BalanceTree from "../balance-tree";
import { ether, getExpectedRcaValue, getSignatureDetailsFromCapOracle, resetBlockchain } from "../utils";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "../constants";
import type { Contracts, MerkleProofs, MerkleTrees, Routers, Signers } from "../types";

import type { RcaShieldAave } from "../../src/types/RcaShieldAave";
import type { MockERC20 } from "../../src/types/MockERC20";
import type { RcaController } from "../../src/types/RcaController";
import type { RcaTreasury } from "../../src/types/RcaTreasury";
import type { AaveRouter } from "../../src/types/AaveRouter";

// Factories
import type { RcaShieldAave__factory } from "../../src/types/factories/RcaShieldAave__factory";
import type { RcaController__factory } from "../../src/types/factories/RcaController__factory";
import type { RcaTreasury__factory } from "../../src/types/factories/RcaTreasury__factory";
import type { AaveRouter__factory } from "../../src/types/factories/AaveRouter__factory";
import { parseUnits } from "ethers/lib/utils";
describe("AaveRouter:aUSDC", function () {
  const signers = {} as Signers;
  const contracts = {} as Contracts;
  const merkleTrees = {} as MerkleTrees;
  const merkleProofs = {} as MerkleProofs;
  // make routers empty objects so that they won't be undefined
  contracts.routers = {} as Routers;
  // local whales
  let aaveWhale: SignerWithAddress;
  let stkAAVEWhale: SignerWithAddress;
  //  local tokens
  let aaveToken: MockERC20;
  let stkAAVEToken: MockERC20;
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

    // load mainnet contracts
    contracts.uToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.aave.aUSDC);
    aaveToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.aave.token);
    stkAAVEToken = <MockERC20>await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.aave.stkAAVEToken);

    const rcaShieldAaveFactory = <RcaShieldAave__factory>await ethers.getContractFactory("RcaShieldAave");
    const rcaControllerFactory = <RcaController__factory>await ethers.getContractFactory("RcaController");
    const rcaTreasuryFactory = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");
    const aaveRouterFactory = <AaveRouter__factory>await ethers.getContractFactory("AaveRouter");

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
        0,
        TIME_IN_SECS.day,
        contracts.rcaTreasury.address,
      )
    );
    // Wait for contract to get deployed
    await contracts.rcaController.deployed();

    contracts.rcaShieldAave = <RcaShieldAave>(
      await rcaShieldAaveFactory.deploy(
        "rcaAave Shield",
        "rcaAave",
        contracts.uToken.address,
        await contracts.uToken.decimals(),
        signers.gov.address,
        contracts.rcaController.address,
        MAINNET_ADDRESSES.contracts.aave.incentivesController,
      )
    );
    // Wait for contract to get deployed
    await contracts.rcaShieldAave.deployed();

    // initialize aaveShield
    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldAave.address);

    // initialize aave router
    contracts.routers.aaveRouter = <AaveRouter>(
      await aaveRouterFactory.deploy(
        contracts.uToken.address,
        MAINNET_ADDRESSES.contracts.tokens.usdc,
        MAINNET_ADDRESSES.contracts.uniswap.routerV2,
        contracts.rcaShieldAave.address,
        MAINNET_ADDRESSES.contracts.aave.lendingPool,
      )
    );
    await contracts.routers.aaveRouter.deployed();

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldAave.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);

    // Set liquidation tree.
    merkleTrees.liqTree2 = new BalanceTree([
      { account: contracts.rcaShieldAave.address, amount: ether("0") },
      { account: contracts.rcaController.address, amount: ether("0") },
    ]);

    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShieldAave.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
      { account: aaveToken.address, amount: ether("0.001") },
      { account: stkAAVEToken.address, amount: ether("0.001") },
    ]);
    // merkleProofs
    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldAave.address, ether("100"));
    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());

    // allowance
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldAave.address, ether("100000"));
    await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShieldAave.address, ether("100000"));
  });

  async function mintTokenForUser() {
    //   mint RCA and check for shields uToken balance
    const userAddress = signers.user.address;
    const uAmount = ether("100");
    // returns: expiry, vInt, r, s
    const sigValues = await getSignatureDetailsFromCapOracle({
      amount: uAmount,
      capOracle: signers.capOracle,
      controller: contracts.rcaController,
      userAddress,
      shieldAddress: contracts.rcaShieldAave.address,
    });
    await contracts.rcaShieldAave
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
  }

  // send funds to Treasury
  describe("Initialize", function () {
    it("should intialize the shield with valid state", async function () {
      expect(await contracts.routers.aaveRouter.aToken()).to.equal(contracts.uToken.address);
      expect(await contracts.routers.aaveRouter.baseToken()).to.equal(MAINNET_ADDRESSES.contracts.tokens.usdc);
      expect(await contracts.routers.aaveRouter.router()).to.equal(MAINNET_ADDRESSES.contracts.uniswap.routerV2);
      expect(await contracts.routers.aaveRouter.lendingPool()).to.equal(MAINNET_ADDRESSES.contracts.aave.lendingPool);
      expect(await contracts.routers.aaveRouter.shield()).to.equal(contracts.rcaShieldAave.address);
    });
  });
  describe("zapIn()", function () {
    it("should allow the user to zap in", async function () {
      //   mint RCA and check for shields uToken balance
      const userAddress = signers.user.address;
      const uAmount = parseUnits("1000", 6);
      const uAmountForShield = ether("1000");
      // returns: expiry, vInt, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmountForShield,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldAave.address,
      });
      const expectedRcaValue = await getExpectedRcaValue({
        rcaShield: contracts.rcaShieldAave,
        uToken: contracts.uToken,
        uAmountForRcaValue: uAmountForShield,
        newCumLiqForClaims: BigNumber.from(0),
      });
      const userRcaBalBefore = await contracts.rcaShieldAave.balanceOf(userAddress);
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["uint256", "tuple(address, uint256, uint8, bytes32, bytes32, uint256, bytes32[])"],
        [
          uAmount,
          [
            signers.referrer.address,
            sigValues.expiry,
            sigValues.vInt,
            sigValues.r,
            sigValues.s,
            0,
            merkleProofs.liqProof1,
          ],
        ],
      );
      // TODO: calculate amount of ethers required to buy base token (fix this later ser)
      await contracts.routers.aaveRouter.connect(signers.user).zapIn(userAddress, zapArgs, { value: ether("1") });

      const userRcaBalAfter = await contracts.rcaShieldAave.balanceOf(userAddress);

      expect(userRcaBalAfter.sub(userRcaBalBefore)).to.be.equal(expectedRcaValue);
    });
  });
});
