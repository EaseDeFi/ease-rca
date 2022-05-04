import hre, { ethers } from "hardhat";
import { Signers } from "../types";
import { Contracts } from "./types";
import { EaseToken__factory } from "../../src/types/factories/EaseToken__factory";
import { TokenSwap__factory } from "../../src/types/factories/TokenSwap__factory";
import { TokenSwap } from "../../src/types/TokenSwap";
import { IERC20 } from "../../src/types/IERC20";
import { MAINNET_ADDRESSES } from "./constants";
import { EaseToken } from "../../src/types/EaseToken";
import { ether, resetBlockchain } from "../utils";
import { getContractAddress } from "ethers/lib/utils";
import { expect } from "chai";

describe("TokenSwap", function () {
  const signers = {} as Signers;
  const contracts = {} as Contracts;
  before(async function () {
    await resetBlockchain();
    const accounts = await ethers.getSigners();
    signers.user = accounts[0];
    signers.gov = accounts[1];
    signers.otherAccounts = accounts.slice(2);
  });
  beforeEach(async function () {
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.armorWhale]);
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.armorWhale);
    // transfer eth to user
    await signers.gov.sendTransaction({ to: signers.user.address, value: ether("1000") });

    const EASE_TOKEN_FACTORY = <EaseToken__factory>await ethers.getContractFactory("EaseToken");
    const TOKEN_SWAP_FACTORY = <TokenSwap__factory>await ethers.getContractFactory("TokenSwap");

    contracts.armorToken = <IERC20>await ethers.getContractAt("IERC20", MAINNET_ADDRESSES.armorToken);

    const nonce = await signers.user.getTransactionCount();
    const tokenSwapAddress = getContractAddress({ from: signers.user.address, nonce });
    const easeTokenAddress = getContractAddress({ from: signers.user.address, nonce: nonce + 1 });

    contracts.tokenSwap = <TokenSwap>(
      await TOKEN_SWAP_FACTORY.connect(signers.user).deploy(easeTokenAddress, contracts.armorToken.address)
    );
    contracts.easeToken = <EaseToken>await EASE_TOKEN_FACTORY.connect(signers.user).deploy(tokenSwapAddress);
  });
  describe("Initialize", function () {
    it("should initialize contract properly", async function () {
      expect(await contracts.tokenSwap.armorToken()).to.be.equal(contracts.armorToken.address);
      expect(await contracts.tokenSwap.easeToken()).to.be.equal(contracts.easeToken.address);
    });
  });
  describe("swap()", function () {
    it("should allow user to swap ease tokens for armor token", async function () {
      const userAddress = signers.user.address;
      const amount = ether("1000");
      await contracts.armorToken.connect(signers.user).approve(contracts.tokenSwap.address, amount);
      const userEaseBalBefore = await contracts.easeToken.balanceOf(userAddress);
      await contracts.tokenSwap.connect(signers.user).swap(amount);
      const userEaseBalAfter = await contracts.easeToken.balanceOf(userAddress);
      expect(userEaseBalAfter.sub(userEaseBalBefore)).to.be.equal(amount);
    });
    it("should fail if non armor token holder tries to swap for ease token", async function () {
      const amount = ether("1000");
      await contracts.armorToken.connect(signers.gov).approve(contracts.tokenSwap.address, amount);
      await expect(contracts.tokenSwap.connect(signers.gov).swap(amount)).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance",
      );
    });
  });
});

describe("EaseToken", function () {
  const signers = {} as Signers;
  const contracts = {} as Contracts;
  before(async function () {
    await resetBlockchain();
    const accounts = await ethers.getSigners();
    signers.user = accounts[0];
    signers.gov = accounts[1];
    signers.otherAccounts = accounts.slice(2);
  });

  beforeEach(async function () {
    await hre.network.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.armorWhale]);
    signers.user = await ethers.getSigner(MAINNET_ADDRESSES.armorWhale);
    // transfer eth to user
    await signers.gov.sendTransaction({ to: signers.user.address, value: ether("1000") });

    const EASE_TOKEN_FACTORY = <EaseToken__factory>await ethers.getContractFactory("EaseToken");

    contracts.easeToken = <EaseToken>await EASE_TOKEN_FACTORY.connect(signers.user).deploy(signers.user.address);
  });

  describe("mint()", function () {
    it("should allow minter to mint the token", async function () {
      const amount = ether("1000");
      const userAddress = signers.user.address;
      const userEaseBalBefore = await contracts.easeToken.balanceOf(userAddress);
      await contracts.easeToken.connect(signers.user).mint(userAddress, amount);
      const userEaseBalAfter = await contracts.easeToken.balanceOf(userAddress);
      expect(userEaseBalAfter.sub(userEaseBalBefore)).to.be.equal(amount);
    });
    it("should not allow non minter to mint ease token", async function () {
      const amount = ether("1000");
      const userAddress = signers.user.address;
      await expect(contracts.easeToken.connect(signers.gov).mint(userAddress, amount)).to.revertedWith("only minter");
    });
  });
});
