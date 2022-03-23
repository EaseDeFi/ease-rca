import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockERC20 } from "../src/types/MockERC20";
import { RcaController } from "../src/types/RcaController";
import { RcaShield } from "../src/types/RcaShield";
import { RcaShieldAave } from "../src/types/RcaShieldAave";
import { RcaShieldOnsen } from "../src/types/RcaShieldOnsen";
import { RcaShieldCompound } from "../src/types/RcaShieldCompound";
import { RcaShieldConvex } from "../src/types/RcaShieldConvex";
import { RcaTreasury } from "../src/types/RcaTreasury";
import BalanceTree from "./balance-tree";
import ClaimTree from "./claim-tree";
import { IConvexRewardPool } from "../src/types/IConvexRewardPool";
import { IComptroller } from "../src/types/IComptroller";

export type Signers = {
  user: SignerWithAddress;
  gov: SignerWithAddress;
  referrer: SignerWithAddress;
  notGov: SignerWithAddress;
  guardian: SignerWithAddress;
  pendingGov: SignerWithAddress;
  claimer: SignerWithAddress;
  claimer1: SignerWithAddress;
  priceOracle: SignerWithAddress;
  capOracle: SignerWithAddress;
  otherAccounts: SignerWithAddress[];
  aAAVEWhale: SignerWithAddress;
  aaveWhale: SignerWithAddress;
  cvxCRVWhale: SignerWithAddress;
};
export type Contracts = {
  uToken: MockERC20;
  aaveToken: MockERC20;
  stkAAVEToken: MockERC20;
  cvxCRVToken: MockERC20;
  rcaController: RcaController;
  rcaTreasury: RcaTreasury;
  rcaShield: RcaShield;
  rcaShieldAave: RcaShieldAave;
  rcaShieldOnsen: RcaShieldOnsen;
  rcaShieldCompound: RcaShieldCompound;
  compoundComptroller: IComptroller;
  rcaShieldConvex: RcaShieldConvex;
  cvxCRVPool: IConvexRewardPool;
};

export type MerkleTrees = {
  capTree1: BalanceTree;
  liqTree1: BalanceTree;
  priceTree1: BalanceTree;
  priceTree2: BalanceTree;
  liqTree2: BalanceTree;
  resTree1: BalanceTree;
  resTree2: BalanceTree;
  claimTree1: ClaimTree;
  claimTree2: ClaimTree;
};
export type MerkleProofs = {
  capProof1: string[];
  priceProof1: string[];
  priceProof2: string[];
  liqProof1: string[];
  liqProof2: string[];
  resProof1: string[];
  resProof2: string[];
};

export type CompoundContracts = {
  token: string;
  comptroller: string;
  cCompToken: string;
  cAAVEToken: string;
  cEthToken: string;
};
export type AaveContracts = {
  incentivesController: string;
  aAAVEToken: string;
  token: string;
  stkAAVEToken: string;
};

export type ConvexContracts = {
  rewardFactory: string;
  token: string;
  cvxCrvToken: string;
  cvxRewardPool: string;
  cvxCRVRewardPool: string;
  crvToken: string;
  threeCRV: string;
};

export type OnsenContracts = {
  sushiToken: string;
  masterChefV2: string;
  bitWethPid: number;
  bitWethPair: string;
};

export type MainnetContracts = {
  aave: AaveContracts;
  convex: ConvexContracts;
  onsen: OnsenContracts;
  compound: CompoundContracts;
};

export type MainnetAccounts = {
  aAAVEWhale: string;
  aaveWhale: string;
  cvxWhale: string;
  cvxCRVWhale: string;
  cCompWhale: string;
  cEthWhale: string;
  compWhale: string;
  sushiWhale: string;
  bitWethWhale: string;
};

export type MainnetAddresses = {
  contracts: MainnetContracts;
  accounts: MainnetAccounts;
};
export type TimeInSecs = {
  year: number;
  halfYear: number;
  month: number;
  day: number;
};
