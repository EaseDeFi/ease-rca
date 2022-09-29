import "@nomiclabs/hardhat-ethers";
import hre, { ethers } from "hardhat";
import { ether } from "../test/utils";
import { BigNumber, Signer } from "ethers";

import { RcaShield } from "../src/types/RcaShield";
import { RcaShieldNormalized } from "../src/types/RcaShieldNormalized";
import { RcaController } from "../src/types/RcaController";
import { RcaTreasury } from "../src/types/RcaTreasury";
import { RcaTreasury__factory } from "../src/types/factories/RcaTreasury__factory";
import { RcaController__factory } from "../src/types/factories/RcaController__factory";
import { RcaShield__factory } from "../src/types/factories/RcaShield__factory";
import { RcaShieldNormalized__factory } from "../src/types/factories/RcaShieldNormalized__factory";
import { RcaShieldAave__factory } from "../src/types/factories/RcaShieldAave__factory";
import { RcaShieldCompound__factory } from "../src/types/factories/RcaShieldCompound__factory";
import { RcaShieldConvex__factory } from "../src/types/factories/RcaShieldConvex__factory";
import { RcaShieldOnsen__factory } from "../src/types/factories/RcaShieldOnsen__factory";

import type { Contracts, Signers } from "../test/types";
import { rcaTokens } from "./vaultDetails";
import { MockERC20 } from "../src/types/MockERC20";
import { RcaShieldCompound } from "../src/types/RcaShieldCompound";
import { formatUnits, parseUnits } from "ethers/lib/utils";
import { RcaShieldAave } from "../src/types/RcaShieldAave";
import { RcaShieldOnsen } from "../src/types/RcaShieldOnsen";
import { RcaShieldConvex } from "../src/types/RcaShieldConvex";

import { config } from "dotenv";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { FundMeTokenArgs } from "./types";

config();
// CONSTANTS
// ADDRESSES
const ETH_WHALE = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const GOV_ADDRESS = "0x5AFeDEF13Bd7B3e363db724420D773cAa8B88763";
const GUARDIAN_ADDRESS = "0x1f28ed9d4792a567dad779235c2b766ab84d8e33";
const PRICEORACLE_ADDRESS = "0xea5edef12b0f19e7bf0360940e89cf34be19c091";
const CAPORACLE_ADDRESS = "0xea5edef15d1e28f92981ff4f60257747cd99a247";

// OTHERS
const VANITY_TRANSFER_AMOUNT = ether("0.25");
const WITHDRAWAL_DELAY = BigNumber.from(0); // TODO: CHANGE FROM 0
const DISCOUNT = BigNumber.from(0); // 0%
const APR = BigNumber.from(0);

async function fundMeToken({ details, ethWhaleSigner, me }: FundMeTokenArgs) {
  try {
    // hardhat impersonate account of whale and send token to user
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [details.whale],
    });

    const token = <MockERC20>await ethers.getContractAt("MockERC20", details.address);

    //   fund the whale in case they don't have ether
    await ethWhaleSigner.sendTransaction({ to: details.whale, value: ether("10") });

    const whaleSigner = await ethers.getSigner(details.whale);
    const transferAmount = await token.balanceOf(details.whale);
    //   transfer token to me_address
    await token.connect(whaleSigner).transfer(me, transferAmount);
  } catch {
    console.log(`Underlying token transfer for ${details.name} failed!!`);
  }
}
// Assumptions
// canImpersonate? ETH_WHALE is the funder else PRIVATE_KEY1's wallet is
// PRIVATE_KEY2 =
// PRIVATE_KEY3 =
// PRIVATE_KEY4 = is treasury deployer TODO: CHANGE TREASURY PRIVATE KEY
// PRIVATE_KEY5 = is controller deployer
// PRIVATE_KEY6 and beyond are rca vault deployers
async function main() {
  const canImpersonate = ["localhost", "hardhat"].includes(hre.network.name);

  // Load private keys
  const privateKeys: string[] = [];
  function populateWithPrivateKeys() {
    let i = 1;
    while (process.env[`PRIVATE_KEY${i}`] !== undefined) {
      privateKeys.push(`0x${process.env[`PRIVATE_KEY${i}`] as string}`);
      i++;
    }
  }

  console.log("Attempting to populate.");

  // fill with private keys
  populateWithPrivateKeys();

  console.log("Populated.");

  if (privateKeys.length < 30) {
    throw new Error("Provide at least 30 private keys in your .env");
  }

  // Start deploying vaults from PRIVATE_KEY6
  let vaultDeployerIndex = 5;
  const contracts = {} as Contracts;
  const signers = {} as Signers;

  // Need to make governance our DAO
  // Need to make guardian our multisig
  // Need to make capacity oracle...something?
  // Need to fake token transfers of...all of these???
  // Need to make price oracle...something?
  // impersonate send from ethWhaleSigner to me

  const accounts: Signer[] = [];
  let ethWhaleSigner: Signer;
  if (canImpersonate) {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [ETH_WHALE],
    });
    ethWhaleSigner = await ethers.getSigner(ETH_WHALE);
  } else {
    // assuming PRIVATE_KEY1 as funder
    ethWhaleSigner = new ethers.Wallet(privateKeys[0], ethers.provider);
  }

  console.log("Funding accounts.");

  // fund rca vault deployer accounts
  for (const privateKey of privateKeys) {
    const signer = new ethers.Wallet(privateKey, ethers.provider);
    accounts.push(signer);
    await ethWhaleSigner.sendTransaction({ to: await signer.getAddress(), value: VANITY_TRANSFER_AMOUNT });
  }

  console.log("Accounts funded.");

  // me should be PRIVATE_KEY1
  const me = await accounts[0].getAddress();
  // const me = "0x43a408Cf8d543a80019056760a74b4c2Fc55f41b";
  // impersonate send from ethWhaleSigner to me
  if (canImpersonate) {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [GOV_ADDRESS],
    });
    signers.gov = await ethers.getSigner(GOV_ADDRESS);
  } else {
    signers.gov = new ethers.Wallet(privateKeys[0], ethers.provider) as unknown as SignerWithAddress;
  }
  // Whale Fund other accounts
  if (canImpersonate) {
    await ethWhaleSigner.sendTransaction({ to: me, value: ether("1000") });
    await ethWhaleSigner.sendTransaction({ to: signers.gov.address, value: ether("10") });
  }

  console.log("Initial Governance:", signers.gov.address);
  console.log("Real Governance:", GOV_ADDRESS);
  console.log("User/guardian:", GUARDIAN_ADDRESS);
  console.log("Price oracle:", PRICEORACLE_ADDRESS);
  console.log("Capacity oracle:", CAPORACLE_ADDRESS);

  const RCA_TREASURY = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");
  // deploy treasury with PRIVATE_KEY4
  contracts.rcaTreasury = <RcaTreasury>await RCA_TREASURY.connect(accounts[3]).deploy(GOV_ADDRESS);

  console.log("Treasury:", contracts.rcaTreasury.address);

  const RCA_CONTROLLER = <RcaController__factory>await ethers.getContractFactory("RcaController");

  // deploy controller with PRIVATE_KEY5
  contracts.rcaController = <RcaController>await RCA_CONTROLLER.connect(accounts[4]).deploy(
    signers.gov.address, // governor TODO: CHANGE GOVERNOR
    GUARDIAN_ADDRESS, // guardian
    PRICEORACLE_ADDRESS, // price oracle
    CAPORACLE_ADDRESS, // capacity oracle
    APR, // apr
    DISCOUNT, // discount (0%)
    WITHDRAWAL_DELAY, // 1 hour withdrawal delay for now
    contracts.rcaTreasury.address, // treasury address
  );

  console.log("Controller", contracts.rcaController.address);

  // deploy and initialize rca against yearn vaults
  async function initializeYearnVaults() {
    const RCA_SHIELD = <RcaShield__factory>await ethers.getContractFactory("RcaShield");
    const RCA_SHIELD_NORMALIZED = <RcaShieldNormalized__factory>await ethers.getContractFactory("RcaShieldNormalized");
    for (let i = 0; i < rcaTokens.yearn.length; i++) {
      const details = rcaTokens.yearn[i];
      let shield;
      if (details.decimals == 18) {
        shield = <RcaShield>await RCA_SHIELD.connect(accounts[vaultDeployerIndex++]).deploy(
          details.name, // token name
          details.symbol, // symbol
          details.address, // underlying token
          GOV_ADDRESS, // governor
          contracts.rcaController.address, // rcaController
        );
      } else {
        shield = <RcaShieldNormalized>await RCA_SHIELD_NORMALIZED.connect(accounts[vaultDeployerIndex++]).deploy(
          details.name, // token name
          details.symbol, // symbol
          details.address, // underlying token
          details.decimals,
          GOV_ADDRESS, // governor
          contracts.rcaController.address, // rcaController
        );
      }
      console.log(details.name, shield.address);

      details.shield = shield.address;
      //   initialize shield
      await contracts.rcaController.connect(signers.gov).initializeShield(shield.address);
      if (canImpersonate) {
        await fundMeToken({ details, me, ethWhaleSigner });
      }
    }
  }
  // deploy and initialize rca against compound vaults
  async function initializeCompoundVaults() {
    const compoundComptroller = "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b";
    const RCA_SHIELD = <RcaShieldCompound__factory>await ethers.getContractFactory("RcaShieldCompound");
    for (let i = 0; i < rcaTokens.compound.length; i++) {
      const details = rcaTokens.compound[i];
      const shield = <RcaShieldCompound>await RCA_SHIELD.connect(accounts[vaultDeployerIndex++]).deploy(
        details.name, // token name
        details.symbol, // symbol
        details.address, // underlying token
        details.decimals,
        GOV_ADDRESS, // governor
        contracts.rcaController.address, // rcaController
        compoundComptroller,
      );

      console.log(details.name, shield.address);

      details.shield = shield.address;
      //   initialize shield
      await contracts.rcaController.connect(signers.gov).initializeShield(shield.address);

      if (canImpersonate) {
        await fundMeToken({ details, me, ethWhaleSigner });
      }
    }
  }
  async function initializeAaveVaults() {
    const aaveIncentivesController = "0xd784927Ff2f95ba542BfC824c8a8a98F3495f6b5";
    const RCA_SHIELD = <RcaShieldAave__factory>await ethers.getContractFactory("RcaShieldAave");
    for (let i = 0; i < rcaTokens.aave.length; i++) {
      const details = rcaTokens.aave[i];
      const shield = <RcaShieldAave>await RCA_SHIELD.connect(accounts[vaultDeployerIndex++]).deploy(
        details.name, // token name
        details.symbol, // symbol
        details.address, // underlying token
        details.decimals,
        GOV_ADDRESS, // governor
        contracts.rcaController.address, // rcaController
        aaveIncentivesController,
      );

      console.log(details.name, shield.address);

      details.shield = shield.address;
      //   initialize shield
      await contracts.rcaController.connect(signers.gov).initializeShield(shield.address);
      if (canImpersonate) {
        try {
          // hardhat impersonate account of whale and send token to user
          await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [details.whale],
          });

          const token = <MockERC20>await ethers.getContractAt("MockERC20", details.address);

          //   fund the whale in case they don't have ether
          await ethWhaleSigner.sendTransaction({ to: details.whale, value: ether("10") });
          console.log(formatUnits(await token.balanceOf(details.whale), await token.decimals()));
          const whaleSigner = await ethers.getSigner(details.whale);
          const transferAmount = parseUnits("1000", details.decimals);
          await token.connect(whaleSigner).transfer(me, transferAmount);
        } catch {
          console.log(`Underlying token transfer for ${details.name} failed!!`);
        }
      }
    }
  }
  async function initializeOnsenVaults() {
    const RCA_SHIELD = <RcaShieldOnsen__factory>await ethers.getContractFactory("RcaShieldOnsen");
    for (let i = 0; i < rcaTokens.onsen.length; i++) {
      const details = rcaTokens.onsen[i];
      const shield = <RcaShieldOnsen>await RCA_SHIELD.connect(accounts[vaultDeployerIndex++]).deploy(
        details.name, // token name
        details.symbol, // symbol
        details.address, // underlying token
        details.decimals,
        GOV_ADDRESS, // governor
        contracts.rcaController.address, // rcaController
        details.rewardPool || "",
        details.pid || 0,
      );

      console.log(details.name, shield.address);

      details.shield = shield.address;
      //   initialize shield
      await contracts.rcaController.connect(signers.gov).initializeShield(shield.address);
      if (canImpersonate) {
        await fundMeToken({ details, me, ethWhaleSigner });
      }
    }
  }
  // deploy rca against convex vaults
  async function initializeConvexVaults() {
    const RCA_SHIELD = <RcaShieldConvex__factory>await ethers.getContractFactory("RcaShieldConvex");
    for (let i = 0; i < rcaTokens.convex.length; i++) {
      const details = rcaTokens.convex[i];
      const shield = <RcaShieldConvex>await RCA_SHIELD.connect(accounts[vaultDeployerIndex++]).deploy(
        details.name, // token name
        details.symbol, // symbol
        details.address, // underlying token
        GOV_ADDRESS, // governor
        contracts.rcaController.address, // rcaController
        details.rewardPool || "",
      );

      console.log(details.name, shield.address);

      details.shield = shield.address;
      //   initialize shield
      await contracts.rcaController.connect(signers.gov).initializeShield(shield.address);
      if (canImpersonate) {
        await fundMeToken({ details, me, ethWhaleSigner });
      }
    }
  }

  await initializeYearnVaults();
  await initializeCompoundVaults();
  await initializeAaveVaults();
  await initializeOnsenVaults();
  await initializeConvexVaults();

  console.log(rcaTokens);
}

main();
