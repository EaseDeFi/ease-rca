import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockERC20 } from "../src/types/MockERC20";
import { RcaController } from "../src/types/RcaController";
import { RcaShield } from "../src/types/RcaShield";
import { RcaShieldAave } from "../src/types/RcaShieldAave";
import { RcaTreasury } from "../src/types/RcaTreasury";
import BalanceTree from "./balance-tree";
import ClaimTree from "./claim-tree";

export type Signers = {
  user: SignerWithAddress;
  gov: SignerWithAddress;
  notGov: SignerWithAddress;
  guardian: SignerWithAddress;
  pendingGov: SignerWithAddress;
  claimer: SignerWithAddress;
  claimer1: SignerWithAddress;
  aAAVEWhale: SignerWithAddress;
  priceOracle: SignerWithAddress;
  capOracle: SignerWithAddress;
  otherAccounts: SignerWithAddress[];
};

export type Contracts = {
  rcaShieldAave: RcaShieldAave;
  uToken: MockERC20;
  aAAVEToken: MockERC20;
  rcaController: RcaController;
  rcaTreasury: RcaTreasury;
  rcaShield: RcaShield;
};
export type MerkleTrees = {
  capTree1: BalanceTree;
  liqTree1: BalanceTree;
  priceTree1: BalanceTree;
  liqTree2: BalanceTree;
  resTree1: BalanceTree;
  resTree2: BalanceTree;
  claimTree1: ClaimTree;
  claimTree2: ClaimTree;
};

export type MerkleProofs = {
  capProof1: string[];
  priceProof1: string[];
  liqProof1: string[];
  liqProof2: string[];
  resProof1: string[];
  resProof2: string[];
};
