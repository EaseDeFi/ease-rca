import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockERC20 } from "../src/types/MockERC20";
import { MockRouter } from "../src/types/MockRouter";
import { RcaController } from "../src/types/RcaController";
import { RcaShield } from "../src/types/RcaShield";
import { RcaShieldNormalized } from "../src/types/RcaShieldNormalized";
import { RcaShieldAave } from "../src/types/RcaShieldAave";
import { RcaShieldOnsen } from "../src/types/RcaShieldOnsen";
import { RcaShieldCompound } from "../src/types/RcaShieldCompound";
import { RcaShieldConvex } from "../src/types/RcaShieldConvex";
import { RcaShieldRibbon } from "../src/types/RcaShieldRibbon";
import { RcaTreasury } from "../src/types/RcaTreasury";
import BalanceTree from "./balance-tree";
import ClaimTree from "./claim-tree";
import { IConvexRewardPool } from "../src/types/IConvexRewardPool";
import { IComptroller } from "../src/types/IComptroller";
import { RcaShieldBadger } from "../src/types";
import { BigNumber } from "ethers/lib/ethers";

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
  rcaShieldRibbon: RcaShieldRibbon;
  rcaShieldBadger: RcaShieldBadger;
  compoundComptroller: IComptroller;
  rcaShieldConvex: RcaShieldConvex;
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
  masterChef: string;
  bitWethPid: number;
  bitWethPair: string;
  lidoWethPair: string;
  lidoWethPid: number;
};

export type RibbonContracts = {
  rstEthCCVault: string;
  rstEthGauge: string;
  stEth: string;
  minter: string;
  rbn: string;
};
export type BadgerContracts = {
  tree: string;
  bcvxVault: string;
  graviAuraVault: string;
};
export type EaseContracts = {
  timelock: string;
};

export type RibbonContracts = {
  rstEthCCVault: string;
  rstEthGauge: string;
  stEth: string;
  minter: string;
  rbn: string;
};
export type BadgerContracts = {
  tree: string;
  bcvxVault: string;
  graviAuraVault: string;
};
export type EaseContracts = {
  timelock: string;
};

export type MainnetContracts = {
  aave: AaveContracts;
  convex: ConvexContracts;
  onsen: OnsenContracts;
  compound: CompoundContracts;
  ribbon: RibbonContracts;
  badger: BadgerContracts;
  ease: EaseContracts;
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
  lidoWethWhale: string;
  stkAAVEWhale: string;
  rstEthWhale: string;
  stEthWhale: string;
  ethWhale: string;
  rstEthVaultKeeper: string;
  bcvxWhale: string;
  graviAuraWhale: string;
};

export type MainnetAddresses = {
  contracts: MainnetContracts;
  accounts: MainnetAccounts;
};
export type EaseAddresses = {
  rcas: {
    controller: string;
    shields: RcaShieldDetail[];
  };
  governance: string;
  timelock: string;
  token: string;
  bribePot: string;
  gvToken: string;
  tokenSwap: string;
};

export type RcaShieldDetail = {
  name: string;
  symbol: string;
  address: string;
  underlyingToken: string;
};

export type TimeInSecs = {
  year: number;
  halfYear: number;
  month: number;
  week: number;
  day: number;
};

export type RewardNode = {
  index: BigNumber;
  user: string;
  cycle: BigNumber;
  tokens: string[];
  cumulativeAmounts: BigNumber[];
};
