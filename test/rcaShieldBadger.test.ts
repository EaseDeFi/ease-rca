import hre, { ethers } from "hardhat";
import { Contracts, MerkleProofs, MerkleTrees, RewardNode, Signers } from "./types";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "./constants";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockERC20 } from "../src/types/MockERC20";
import { RcaController } from "../src/types/RcaController";
import { RcaController__factory } from "../src/types/factories/RcaController__factory";
import { RcaTreasury } from "../src/types/RcaTreasury";
import { RcaTreasury__factory } from "../src/types/factories/RcaTreasury__factory";
import { ether, fastForward, getSignatureDetailsFromCapOracle, mine, resetBlockchain } from "./utils";
import { expect } from "chai";
import { BigNumber } from "ethers";
import BalanceTree from "./balance-tree";
import { parseEther } from "ethers/lib/utils";
import { IBadgerTreeV2, IERC20, RcaShieldBadger, RcaShieldBadger__factory } from "../src/types";
import RewardTree from "./reward-tree";

const RESET_BLOCK_NUMBER = 15664830;

type RewardTokens = {
  bAuraBal: IERC20;
  graviAuraBal: IERC20;
  badger: IERC20;
};

const rewardTokenAddresses = [
  "0x37d9D2C6035b744849C15F1BFEE8F268a20fCBd8", // bAuraBal
  "0xBA485b556399123261a5F9c95d413B4f93107407", // graviAuraBal
  "0x3472A5A71965499acd81997a54BBA8D852C6E53d", // BADGER
];

const cumulativeAmounts = [parseEther("10.1"), parseEther("10.2"), parseEther("10.3")];

describe("RcaShieldBadger", function () {
  const contracts = {} as Contracts;
  let userAddress: string;
  let rcaShieldAddress: string;
  const signers = {} as Signers;
  const merkleProofs = {} as MerkleProofs;
  const merkleTrees = {} as MerkleTrees;
  let badgerTree: IBadgerTreeV2;
  // const rootsMappingLocation = 167;
  const currRootLocation = 152;
  let rewardTree: RewardTree;
  let rewardNodes: RewardNode[] = [];
  const rewardTokens = {} as RewardTokens;

  before(async function () {
    await resetBlockchain(RESET_BLOCK_NUMBER);
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

    // impersonate rstEthWhale and unstake his rstEth from the gauge
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.accounts.graviAuraWhale]);

    await signers.user.sendTransaction({ value: parseEther("100"), to: MAINNET_ADDRESSES.accounts.graviAuraWhale });
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.accounts.graviAuraWhale);

    userAddress = signers.user.address;

    badgerTree = <IBadgerTreeV2>await ethers.getContractAt("IBadgerTreeV2", MAINNET_ADDRESSES.contracts.badger.tree);
    // graviAuraVault Token
    contracts.uToken = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.badger.graviAuraVault)
    );
    rewardTokens.bAuraBal = <IERC20>await ethers.getContractAt("IERC20", rewardTokenAddresses[0]);

    rewardTokens.graviAuraBal = <IERC20>await ethers.getContractAt("IERC20", rewardTokenAddresses[1]);

    rewardTokens.badger = <IERC20>await ethers.getContractAt("IERC20", rewardTokenAddresses[2]);

    // sent some graviAURA to referrer
    await contracts.uToken.connect(signers.user).transfer(signers.referrer.address, ether("10000"));

    // rca contract factories
    const RCAShieldBadgerFactory = <RcaShieldBadger__factory>await ethers.getContractFactory("RcaShieldBadger");
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

    // deploy rcaShieldBadger
    contracts.rcaShieldBadger = <RcaShieldBadger>(
      await RCAShieldBadgerFactory.deploy(
        "Ease Gravi Aura",
        "ez-graviAura",
        contracts.uToken.address,
        BigNumber.from(18),
        signers.gov.address,
        contracts.rcaController.address,
        MAINNET_ADDRESSES.contracts.badger.tree,
      )
    );
    await contracts.rcaShieldBadger.deployed();

    // initialize rcaShieldBadger
    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldBadger.address);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldBadger.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);
    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShieldBadger.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
      { account: rewardTokens.bAuraBal.address, amount: ether("0.001") },
      { account: rewardTokens.badger.address, amount: ether("0.001") },
      { account: rewardTokens.graviAuraBal.address, amount: ether("0.001") },
    ]);

    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldBadger.address, ether("100"));
    merkleProofs.priceProof1 = merkleTrees.priceTree1.getProof(contracts.uToken.address, ether("0.001"));
    rcaShieldAddress = contracts.rcaShieldBadger.address;

    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());
    // approve uToken to shield
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldBadger.address, ether("10000000"));
    await contracts.uToken.connect(signers.referrer).approve(contracts.rcaShieldBadger.address, ether("10000000"));

    rewardNodes = [
      {
        tokens: rewardTokenAddresses,
        cumulativeAmounts,
        index: BigNumber.from(1),
        cycle: BigNumber.from(6718),
        user: contracts.rcaShieldBadger.address.toLowerCase(),
      },
      {
        tokens: rewardTokenAddresses,
        cumulativeAmounts: [parseEther("15"), ...cumulativeAmounts.slice(1)],
        index: BigNumber.from(1),
        cycle: BigNumber.from(6718),
        user: signers.user.address.toLowerCase(),
      },
      {
        tokens: rewardTokenAddresses,
        cumulativeAmounts: [...cumulativeAmounts.slice(1), parseEther("15")],
        index: BigNumber.from(2),
        cycle: BigNumber.from(6718),
        user: signers.referrer.address.toLowerCase(),
      },
      {
        tokens: rewardTokenAddresses,
        cumulativeAmounts: [...cumulativeAmounts.slice(1), parseEther("15")],
        index: BigNumber.from(2),
        cycle: BigNumber.from(6718),
        user: signers.gov.address.toLowerCase(),
      },
    ];
    rewardTree = new RewardTree(rewardNodes);

    // update badger reward tree merkle root storage to satisfy our contract needs
    await ethers.provider.send("hardhat_setStorageAt", [
      badgerTree.address,
      ethers.utils.hexlify(currRootLocation),
      rewardTree.getHexRoot(),
    ]);
  });

  async function mintTo(_userAddress?: string, _uAmount?: BigNumber): Promise<void> {
    let userAddress;
    let uAmount;
    if (_userAddress == undefined || _uAmount == undefined) {
      userAddress = signers.user.address;
      uAmount = ether("5");
    } else {
      userAddress = _userAddress;
      uAmount = _uAmount;
    }

    // returns: expiry, vInt, r, s
    const sigValues = await getSignatureDetailsFromCapOracle({
      amount: uAmount,
      capOracle: signers.capOracle,
      controller: contracts.rcaController,
      userAddress,
      shieldAddress: contracts.rcaShieldBadger.address,
    });

    await contracts.rcaShieldBadger
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
      expect(await contracts.rcaShieldBadger.badgerTree()).to.be.equal(MAINNET_ADDRESSES.contracts.badger.tree);
    });
  });

  describe("mintTo()", function () {
    it("should mint ezToken to the user", async function () {
      const uAmount = parseEther("100");
      const userRCABalBefore = await contracts.rcaShieldBadger.balanceOf(userAddress);
      const shildUTokenBalBefore = await contracts.uToken.balanceOf(rcaShieldAddress);
      await mintTo(userAddress, uAmount);
      const userRCABalAfter = await contracts.rcaShieldBadger.balanceOf(userAddress);
      const shildUTokenBalAfter = await contracts.uToken.balanceOf(rcaShieldAddress);

      expect(userRCABalAfter.sub(userRCABalBefore)).to.gte(uAmount);
      // shield balance should update by deposited uToken amount
      expect(shildUTokenBalAfter.sub(shildUTokenBalBefore)).to.gte(uAmount);
    });
  });

  describe("getRewards()", function () {
    it("should collect rewards for the shield", async function () {
      // mint rca
      await mintTo();
      // node details for badger shield
      const node = rewardNodes[0];

      const amountsToClaim = [parseEther("1"), parseEther("2"), parseEther("3")];
      const proof = rewardTree.getProof(node.index, node.user, node.cycle, node.tokens, node.cumulativeAmounts);
      const bAuraBalanceBefore = await rewardTokens.bAuraBal.balanceOf(rcaShieldAddress);
      const graviAuraBalanceBefore = await rewardTokens.graviAuraBal.balanceOf(rcaShieldAddress);
      const badgerBalanceBefore = await rewardTokens.badger.balanceOf(rcaShieldAddress);
      // collect reward
      await contracts.rcaShieldBadger.getReward(
        node.tokens,
        node.cumulativeAmounts,
        node.index,
        node.cycle,
        proof,
        amountsToClaim,
      );
      const bAuraBalanceAfter = await rewardTokens.bAuraBal.balanceOf(rcaShieldAddress);
      const graviAuraBalanceAfter = await rewardTokens.graviAuraBal.balanceOf(rcaShieldAddress);
      const badgerBalanceAfter = await rewardTokens.badger.balanceOf(rcaShieldAddress);

      expect(bAuraBalanceAfter.sub(bAuraBalanceBefore)).to.equal(amountsToClaim[0]);

      expect(graviAuraBalanceAfter.sub(graviAuraBalanceBefore)).to.equal(amountsToClaim[1]);

      expect(badgerBalanceAfter.sub(badgerBalanceBefore)).to.equal(amountsToClaim[2]);
    });
  });

  describe("purchase()", function () {
    it("Should not allow users to purchase uToken", async function () {
      await mintTo();

      const node = rewardNodes[0];

      const amountsToClaim = [parseEther("1"), parseEther("2"), parseEther("3")];
      const proof = rewardTree.getProof(node.index, node.user, node.cycle, node.tokens, node.cumulativeAmounts);
      await contracts.rcaShieldBadger.getReward(
        node.tokens,
        node.cumulativeAmounts,
        node.index,
        node.cycle,
        proof,
        amountsToClaim,
      );

      const badgerAmtToBuy = ether("1");
      const badgerPrice = ether("0.001");
      const badgerPriceProof = merkleTrees.priceTree1.getProof(rewardTokens.badger.address, badgerPrice);
      const underlyingPrice = ether("0.001");
      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underlyingPrice);

      await expect(
        contracts.rcaShieldBadger
          .connect(signers.user)
          .purchase(
            contracts.uToken.address,
            badgerAmtToBuy,
            badgerPrice,
            badgerPriceProof,
            underlyingPrice,
            underLyingPriceProof,
          ),
      ).to.be.revertedWith("cannot buy underlying token");
    });
    it("Should allow users to purchase reward token", async function () {
      await mintTo();

      const node = rewardNodes[0];

      const amountsToClaim = [parseEther("1"), parseEther("2"), parseEther("3")];
      const proof = rewardTree.getProof(node.index, node.user, node.cycle, node.tokens, node.cumulativeAmounts);
      await contracts.rcaShieldBadger.getReward(
        node.tokens,
        node.cumulativeAmounts,
        node.index,
        node.cycle,
        proof,
        amountsToClaim,
      );

      const badgerAmtToBuy = ether("1");
      const badgerPrice = ether("0.001");
      const badgerPriceProof = merkleTrees.priceTree1.getProof(rewardTokens.badger.address, badgerPrice);
      const underlyingPrice = ether("0.001");
      const underLyingPriceProof = merkleTrees.priceTree1.getProof(contracts.uToken.address, underlyingPrice);
      const userBadgerBalBefore = await rewardTokens.badger.balanceOf(userAddress);
      await contracts.rcaShieldBadger
        .connect(signers.user)
        .purchase(
          rewardTokens.badger.address,
          badgerAmtToBuy,
          badgerPrice,
          badgerPriceProof,
          underlyingPrice,
          underLyingPriceProof,
        );
      const userBadgerBalAfter = await rewardTokens.badger.balanceOf(userAddress);
      expect(userBadgerBalAfter.sub(userBadgerBalBefore)).to.equal(badgerAmtToBuy);
    });
  });

  describe("redeem()", function () {
    it("should initiate redeem request and finalize it", async function () {
      await mintTo();
      const rcaAmount = ether("1");
      const expectedUTokenAmount = ether("1");

      await contracts.rcaShieldBadger.connect(signers.user).redeemRequest(rcaAmount, 0, [], 0, []);

      const uTokenBalanceBefore = await contracts.uToken.balanceOf(userAddress);
      // Fast Forward
      await fastForward(TIME_IN_SECS.week);
      await mine();

      // Finalize Redeem
      await contracts.rcaShieldBadger
        .connect(signers.user)
        .redeemFinalize(signers.user.address, ethers.constants.AddressZero, 0, [], 0, []);
      const uTokenBalanceAfter = await contracts.uToken.balanceOf(userAddress);
      expect(uTokenBalanceAfter.sub(uTokenBalanceBefore)).to.gte(expectedUTokenAmount);
    });
  });
});
