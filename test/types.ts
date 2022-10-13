import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  MockERC20,
  MockRouter,
  RcaController,
  RcaShield,
  RcaShieldNormalized,
  RcaShieldAave,
  RcaShieldOnsen,
  RcaShieldCompound,
  RcaShieldConvex,
  RcaShieldRocketPool,
  RcaTreasury,
} from "../src/types";
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
};
export type Contracts = {
  uToken: MockERC20;
  cvxCRVToken: MockERC20;
  rcaController: RcaController;
  rcaTreasury: RcaTreasury;
  rcaShield: RcaShield | RcaShieldNormalized;
  rcaShieldAave: RcaShieldAave;
  rcaShieldOnsen: RcaShieldOnsen;
  rcaShieldCompound: RcaShieldCompound;
  compoundComptroller: IComptroller;
  rcaShieldConvex: RcaShieldConvex;
  rcaShieldRocketPool: RcaShieldRocketPool;
  cvxCRVPool: IConvexRewardPool;
  router: MockRouter;
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
  aWeth: string;
  aWbtc: string;
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

export type RocketPoolContracts = {
  rEthToken: string;
  rocketStorage: string;
};

export type MainnetContracts = {
  aave: AaveContracts;
  convex: ConvexContracts;
  onsen: OnsenContracts;
  compound: CompoundContracts;
  rocketPool: RocketPoolContracts;
};

export type MainnetAccounts = {
  aAAVEWhale: string;
  aaveWhale: string;
  aWethWhale: string;
  aWbtcWhale: string;
  cvxWhale: string;
  cvxCRVWhale: string;
  cCompWhale: string;
  cEthWhale: string;
  compWhale: string;
  sushiWhale: string;
  bitWethWhale: string;
  stkAAVEWhale: string;
  rEthWhale: string;
  rEthWhale2: string;
  // stEthWhale: string;
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
