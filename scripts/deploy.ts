import "@nomiclabs/hardhat-ethers";
import hre, { ethers } from "hardhat";
import { ether } from "../test/utils";
import { BigNumber, Signer } from "ethers";

import { RcaShield } from "../src/types/RcaShield";
import { RcaController } from "../src/types/RcaController";
import { RcaTreasury } from "../src/types/RcaTreasury";
import { RcaTreasury__factory } from "../src/types/factories/RcaTreasury__factory";
import { RcaController__factory } from "../src/types/factories/RcaController__factory";
import { RcaShield__factory } from "../src/types/factories/RcaShield__factory";
import { RcaShieldAave__factory } from "../src/types/factories/RcaShieldAave__factory";
import { RcaShieldCompound__factory } from "../src/types/factories/RcaShieldCompound__factory";
import { RcaShieldConvex__factory } from "../src/types/factories/RcaShieldConvex__factory";
import { RcaShieldOnsen__factory } from "../src/types/factories/RcaShieldOnsen__factory";

import type { Contracts, Signers } from "../test/types";
import { rcaTokens } from "./vaultDetails";
import { MockERC20 } from "../src/types/MockERC20";
import { RcaShieldCompound } from "../src/types/RcaShieldCompound";
import { parseUnits } from "ethers/lib/utils";
import { RcaShieldAave } from "../src/types/RcaShieldAave";
import { RcaShieldOnsen } from "../src/types/RcaShieldOnsen";
import { RcaShieldConvex } from "../src/types/RcaShieldConvex";

import { config } from "dotenv";

config();
async function main() {
  const privateKeys: string[] = [];
  function populateWithPrivateKeys() {
    let i = 1;
    while (process.env[`PRIVATE_KEY${i}`] !== undefined) {
      privateKeys.push(`0x${process.env[`PRIVATE_KEY${i}`] as string}`);
      i++;
    }
  }
  // fill with private keys
  populateWithPrivateKeys();
  if (privateKeys.length < 30) {
    throw new Error("Provide at least 30 private keys in your .env");
  }

  // account to
  let shieldDeployerIndex = 5;
  const contracts = {} as Contracts;
  const signers = {} as Signers;

  const withdrawalDelay = BigNumber.from(3600);
  const discount = BigNumber.from(0); // 0%
  const apr = BigNumber.from(0);

  // Need to make governance our DAO
  // Need to make guardian our multisig
  // Need to make capacity oracle...something?
  // Need to fake token transfers of...all of these???
  // Need to make price oracle...something?
  // impersonate send from kraken to me
  const kraken = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
  const gov_addy = "0x5AFeDEF13Bd7B3e363db724420D773cAa8B88763";
  const guardian_addy = "0x1f28ed9d4792a567dad779235c2b766ab84d8e33";
  const priceOracle_addy = "0xEa5EDef10E0a7CB6C8C87C2F35B36f0f8E608eBC";
  const capOracle_addy = "0xEa5edeF10d62c08c447C5c0e9a9d7523777886a7";
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [kraken],
  });
  const krakenWhale = await ethers.getSigner(kraken);
  // fund vanity address creator private keys
  const accounts: Signer[] = [];
  for (const privateKey of privateKeys) {
    const signer = new ethers.Wallet(privateKey, ethers.provider);
    accounts.push(signer);
    krakenWhale.sendTransaction({ to: await signer.getAddress(), value: ether("2") });
  }

  // me should be PRIVATE_KEY1
  const me = await accounts[0].getAddress();
  // const me = "0x43a408Cf8d543a80019056760a74b4c2Fc55f41b";
  await krakenWhale.sendTransaction({ to: me, value: ether("1000") });
  // impersonate send from kraken to me
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [gov_addy],
  });
  signers.gov = await ethers.getSigner(gov_addy);
  await krakenWhale.sendTransaction({ to: signers.gov.address, value: ether("1000") });

  console.log("Governance:", gov_addy);
  console.log("User/guardian:", guardian_addy);
  console.log("Price oracle:", priceOracle_addy);
  console.log("Capacity oracle:", capOracle_addy);

  const RCA_TREASURY = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");
  // deploy treasury with privateKey 4
  contracts.rcaTreasury = <RcaTreasury>await RCA_TREASURY.connect(accounts[3]).deploy(gov_addy);

  console.log("Treasury:", contracts.rcaTreasury.address);

  const RCA_CONTROLLER = <RcaController__factory>await ethers.getContractFactory("RcaController");
  // deploy controller with privateKey 5
  contracts.rcaController = <RcaController>await RCA_CONTROLLER.connect(accounts[4]).deploy(
    gov_addy, // governor
    guardian_addy, // guardian
    priceOracle_addy, // price oracle
    capOracle_addy, // capacity oracle
    apr, // apr
    discount, // discount (0%)
    withdrawalDelay, // 1 hour withdrawal delay for now
    contracts.rcaTreasury.address, // treasury address
  );

  console.log("Controller", contracts.rcaController.address);

  // deploy and initialize rca against yearn vaults
  async function initializeYearnVaults() {
    const RCA_SHIELD = <RcaShield__factory>await ethers.getContractFactory("RcaShield");
    for (let i = 0; i < rcaTokens.yearn.length; i++) {
      const details = rcaTokens.yearn[i];
      const shield = <RcaShield>await RCA_SHIELD.connect(accounts[shieldDeployerIndex++]).deploy(
        details.name, // token name
        details.symbol, // symbol
        details.address, // underlying token
        gov_addy, // governor
        contracts.rcaController.address, // rcaController
      );
      console.log(details.name, shield.address);

      details.shield = shield.address;
      //   initialize shield
      await contracts.rcaController.connect(signers.gov).initializeShield(shield.address);
      try {
        // hardhat impersonate account of whale and send token to user
        await hre.network.provider.request({
          method: "hardhat_impersonateAccount",
          params: [details.whale],
        });

        const token = <MockERC20>await ethers.getContractAt("MockERC20", details.address);

        //   fund the whale in case they don't have ether
        await krakenWhale.sendTransaction({ to: details.whale, value: ether("10") });

        const whaleSigner = await ethers.getSigner(details.whale);
        const transferAmount = await token.balanceOf(details.whale);
        //   transfer token to me_address
        await token.connect(whaleSigner).transfer(me, transferAmount);
      } catch {
        console.log(`Underlying token transfer for ${details.name} failed!!`);
      }
    }
  }
  // deploy and initialize rca against compound vaults
  async function initializeCompoundVaults() {
    const compoundComptroller = "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b";
    const RCA_SHIELD = <RcaShieldCompound__factory>await ethers.getContractFactory("RcaShieldCompound");
    for (let i = 0; i < rcaTokens.compound.length; i++) {
      const details = rcaTokens.compound[i];
      const shield = <RcaShieldCompound>await RCA_SHIELD.connect(accounts[shieldDeployerIndex++]).deploy(
        details.name, // token name
        details.symbol, // symbol
        details.address, // underlying token
        details.decimals,
        gov_addy, // governor
        contracts.rcaController.address, // rcaController
        compoundComptroller,
      );

      console.log(details.name, shield.address);

      details.shield = shield.address;
      //   initialize shield
      await contracts.rcaController.connect(signers.gov).initializeShield(shield.address);

      try {
        // hardhat impersonate account of whale and send token to user
        await hre.network.provider.request({
          method: "hardhat_impersonateAccount",
          params: [details.whale],
        });

        const token = <MockERC20>await ethers.getContractAt("MockERC20", details.address);

        //   fund the whale in case they don't have ether
        await krakenWhale.sendTransaction({ to: details.whale, value: ether("10") });

        const whaleSigner = await ethers.getSigner(details.whale);
        const transferAmount = await token.balanceOf(details.whale);
        //   transfer token to me_address
        await token.connect(whaleSigner).transfer(me, transferAmount);
      } catch {
        console.log(`Underlying token transfer for ${details.name} failed!!`);
      }
    }
  }
  async function initializeAaveVaults() {
    const aaveIncentivesController = "0xd784927Ff2f95ba542BfC824c8a8a98F3495f6b5";
    const RCA_SHIELD = <RcaShieldAave__factory>await ethers.getContractFactory("RcaShieldAave");
    for (let i = 0; i < rcaTokens.aave.length; i++) {
      const details = rcaTokens.aave[i];
      const shield = <RcaShieldAave>await RCA_SHIELD.connect(accounts[shieldDeployerIndex++]).deploy(
        details.name, // token name
        details.symbol, // symbol
        details.address, // underlying token
        details.decimals,
        gov_addy, // governor
        contracts.rcaController.address, // rcaController
        aaveIncentivesController,
      );

      console.log(details.name, shield.address);

      details.shield = shield.address;
      //   initialize shield
      await contracts.rcaController.connect(signers.gov).initializeShield(shield.address);

      try {
        // hardhat impersonate account of whale and send token to user
        await hre.network.provider.request({
          method: "hardhat_impersonateAccount",
          params: [details.whale],
        });

        const token = <MockERC20>await ethers.getContractAt("MockERC20", details.address);

        //   fund the whale in case they don't have ether
        await krakenWhale.sendTransaction({ to: details.whale, value: ether("10") });

        const whaleSigner = await ethers.getSigner(details.whale);
        const transferAmount = parseUnits("1000", details.decimals);
        await token.connect(whaleSigner).transfer(me, transferAmount);
      } catch {
        console.log(`Underlying token transfer for ${details.name} failed!!`);
      }
    }
  }
  async function initializeOnsenVaults() {
    const masterChefV2 = "0xEF0881eC094552b2e128Cf945EF17a6752B4Ec5d";
    const RCA_SHIELD = <RcaShieldOnsen__factory>await ethers.getContractFactory("RcaShieldOnsen");
    for (let i = 0; i < rcaTokens.onsen.length; i++) {
      const details = rcaTokens.onsen[i];
      const shield = <RcaShieldOnsen>await RCA_SHIELD.connect(accounts[shieldDeployerIndex++]).deploy(
        details.name, // token name
        details.symbol, // symbol
        details.address, // underlying token
        details.decimals,
        gov_addy, // governor
        contracts.rcaController.address, // rcaController
        masterChefV2,
        details.pid || 0,
      );

      console.log(details.name, shield.address);

      details.shield = shield.address;
      //   initialize shield
      await contracts.rcaController.connect(signers.gov).initializeShield(shield.address);
      try {
        // hardhat impersonate account of whale and send token to user
        await hre.network.provider.request({
          method: "hardhat_impersonateAccount",
          params: [details.whale],
        });

        const token = <MockERC20>await ethers.getContractAt("MockERC20", details.address);

        //   fund the whale in case they don't have ether
        await krakenWhale.sendTransaction({ to: details.whale, value: ether("10") });

        const whaleSigner = await ethers.getSigner(details.whale);
        const transferAmount = await token.balanceOf(details.whale);
        //   transfer token to me_address
        await token.connect(whaleSigner).transfer(me, transferAmount);
      } catch {
        console.log(`Underlying token transfer for ${details.name} failed!!`);
      }
    }
  }
  // deploy rca against convex vaults
  async function initializeConvexVaults() {
    const rewardPool = "0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e";
    const RCA_SHIELD = <RcaShieldConvex__factory>await ethers.getContractFactory("RcaShieldConvex");
    for (let i = 0; i < rcaTokens.convex.length; i++) {
      const details = rcaTokens.convex[i];
      const shield = <RcaShieldConvex>await RCA_SHIELD.connect(accounts[shieldDeployerIndex++]).deploy(
        details.name, // token name
        details.symbol, // symbol
        details.address, // underlying token
        gov_addy, // governor
        contracts.rcaController.address, // rcaController
        rewardPool,
      );

      console.log(details.name, shield.address);

      details.shield = shield.address;
      //   initialize shield
      await contracts.rcaController.connect(signers.gov).initializeShield(shield.address);

      try {
        // hardhat impersonate account of whale and send token to user
        await hre.network.provider.request({
          method: "hardhat_impersonateAccount",
          params: [details.whale],
        });

        const token = <MockERC20>await ethers.getContractAt("MockERC20", details.address);

        //   fund the whale in case they don't have ether
        await krakenWhale.sendTransaction({ to: details.whale, value: ether("10") });

        const whaleSigner = await ethers.getSigner(details.whale);
        const transferAmount = await token.balanceOf(details.whale);
        //   transfer token to me_address
        await token.connect(whaleSigner).transfer(me, transferAmount);
      } catch {
        console.log(`Underlying token transfer for ${details.name} failed!!`);
      }
    }
  }

  try {
    await initializeYearnVaults();
  } catch (err) {
    console.log("failed to launch yearn vault");
  }
  try {
    await initializeCompoundVaults();
  } catch (err) {
    console.log("failed to launch compound vault");
  }
  try {
    await initializeAaveVaults();
  } catch (err) {
    console.log(err);
    console.log("failed to launch aave vault");
  }
  try {
    await initializeOnsenVaults();
  } catch (err) {
    console.log("failed to launch onsen vault");
  }
  try {
    await initializeConvexVaults();
  } catch (err) {
    console.log("failed to launch convex vault");
  }

  console.log(rcaTokens);
}

main();
