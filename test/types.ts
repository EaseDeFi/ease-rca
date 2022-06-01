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
import { RcaShieldBancor } from "../src/types/RcaShieldBancor";
import { RcaTreasury } from "../src/types/RcaTreasury";
import BalanceTree from "./balance-tree";
import ClaimTree from "./claim-tree";
import { IConvexRewardPool } from "../src/types/IConvexRewardPool";
import { IComptroller } from "../src/types/IComptroller";
import { AaveRouter } from "../src/types/AaveRouter";
import { CompoundRouter } from "../src/types/CompoundRouter";

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
  rcaShieldBancor: RcaShieldBancor;
  cvxCRVPool: IConvexRewardPool;
  router: MockRouter;
  routers: Routers;
};
export type Routers = {
  aaveRouter: AaveRouter;
  compoundRouter: CompoundRouter;
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
  cUSDCToken: string;
};
export type AaveContracts = {
  incentivesController: string;
  lendingPool: string;
  aAAVEToken: string;
  aUSDC: string;
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
export type UniswapContracts = {
  routerV2: string;
};

export type BancorContracts = {
  bancorNetwork: string;
  standardRewards: string;
  bnETHPool: string;
  bnDAIPool: string;
  bnETH: string;
  bnDAI: string;
  bntToken: string;
  idETH: number;
};

export type MainnetContracts = {
  aave: AaveContracts;
  convex: ConvexContracts;
  onsen: OnsenContracts;
  compound: CompoundContracts;
  uniswap: UniswapContracts;
  bancor: BancorContracts;
};

export type MainnetAccounts = {
  aAAVEWhale: string;
  aaveWhale: string;
  aWethWhale: string;
  aWbtcWhale: string;
  aUSDCWhale: string;
  cvxWhale: string;
  cvxCRVWhale: string;
  cCompWhale: string;
  cEthWhale: string;
  cUSDCWhale: string;
  compWhale: string;
  sushiWhale: string;
  bitWethWhale: string;
  stkAAVEWhale: string;
  bnEthWhale: string;
};

export type MainnetAddresses = {
  contracts: MainnetContracts;
  accounts: MainnetAccounts;
  tokens: Tokens;
};
export type Tokens = {
  weth: string;
  usdc: string;
  stEth: string;
};
export type TimeInSecs = {
  year: number;
  halfYear: number;
  month: number;
  week: number;
  day: number;
};
