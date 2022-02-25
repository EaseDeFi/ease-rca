/* eslint-disable prefer-const */
import { expect } from "chai";
import { ethers } from "hardhat";
import { keccak256, bufferToHex } from "ethereumjs-util";
import { increase, getTimestamp, mine, ether } from "../test/utils";
import { providers, Contract, Signer, BigNumber } from "ethers";
import BalanceTree from '../test/balance-tree'
import { userInfo } from "os";

// Testing base RCA functionalities
async function main() {
  let accounts: Signer[];
  let uToken: Contract;
  let shield: Contract;
  let controller: Contract;
  let owner: Signer;
  let user: Signer;
  let priceOracle: Signer;
  let capOracle: Signer;
  let capTree: BalanceTree;
  let liqTree: BalanceTree;
  let priceTree: BalanceTree;
  let capProof: string[];
  let priceProof: string[];
  let liqProof: string[];
  let liqTree2: BalanceTree;
  let liqProof2: string[];

  accounts    = await ethers.getSigners();
  owner       = accounts[0];
  user        = accounts[1];
  priceOracle = accounts[2];
  capOracle   = accounts[3];

  const TOKEN = await ethers.getContractFactory("MockERC20");
  uToken      = await TOKEN.deploy("Test Token", "TEST");

  console.log("Underlying token:", uToken.address);

  const CONTROLLER = await ethers.getContractFactory("RcaController");
  //                                         governor, guardian, price oracle, capacity oracle
  controller       = await CONTROLLER.deploy(owner.getAddress(), user.getAddress(), priceOracle.getAddress(), capOracle.getAddress(),
  //                                         apr, discount (2%), 1 day withdrawal delay, treasury address.
                                              0, 200, 86400, owner.getAddress());

  console.log("Controller:", controller.address);

  const SHIELD = await ethers.getContractFactory("RcaShield");
  //                                  token name, symbol, underlying token, governor, controller
  shield       = await SHIELD.deploy("Test Token RCA", "TEST-RCA", uToken.address, owner.getAddress(), controller.address);

  console.log("Shield:", shield.address);

  //                                               shield, protocol Id, %
  await controller.connect(owner).initializeShield(shield.address, [1, 2], [10000, 10000]);

  await uToken.mint(user.getAddress(), ether("1000000"));
    
  console.log("1 million tokens minted to user/guardian.");

  // Set capacity tree.
  capTree = new BalanceTree([
    { account: shield.address, amount: ether("1000000") },
    { account: controller.address, amount: ether("1000000") }
  ]);

  await controller.connect(capOracle).setCapacities(capTree.getHexRoot());

  // Set liquidation tree.
  liqTree = new BalanceTree([
    { account: shield.address, amount: ether("100") },
    { account: controller.address, amount: ether("100") }
  ]);

  // Set liquidation tree.
  liqTree2 = new BalanceTree([
    { account: shield.address, amount: ether("0") },
    { account: controller.address, amount: ether("0") }
  ]);

  // Set price tree.
  priceTree = new BalanceTree([
    { account: shield.address, amount: ether("0.001") },
    { account: controller.address, amount: ether("0.001") }
  ]);

  await controller.connect(priceOracle).setPrices(priceTree.getHexRoot());

  capProof   = capTree.getProof(shield.address, ether("1000000"));
  priceProof = priceTree.getProof(shield.address, ether("0.001"));
  liqProof   = liqTree.getProof(shield.address, ether("100"));
  liqProof2  = liqTree2.getProof(shield.address, ether("0"));

  console.log("Governance:", await owner.getAddress());
  console.log("User/guardian:", await user.getAddress());
  console.log("Price oracle:", await priceOracle.getAddress());
  console.log("Capacity oracle:", await capOracle.getAddress());

  console.log("Liquidation root (not set yet):", liqTree.getHexRoot());
  console.log("Liquidation amount: 100 18 decimal tokens");
  console.log("Liquidation proof:", liqProof);
  console.log("Capacity amount: 1,000,000 tokens");
  console.log("Capacity proof:", capProof);
  console.log("Price: 0.001 Ether");
  console.log("Price proof:", priceProof);
}

main();