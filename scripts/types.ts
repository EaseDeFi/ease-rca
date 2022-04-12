import { Signer } from "ethers";

export type RcaTokens = {
  yearn: RcaToken[];
  compound: RcaToken[];
  aave: RcaToken[];
  onsen: RcaToken[];
  convex: RcaToken[];
};
export type RcaToken = {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  whale: string;
  shield: string;
  pid?: number;
  rewardPool: string;
  coingeckoId: string;
};
export type FundMeTokenArgs = {
  details: RcaToken;
  ethWhaleSigner: Signer;
  me: string;
  sendAllWhaleBalance?: boolean;
};

export type CrvPoolUnderlyingDetails = {
  symbol: string;
  uTokensCrv?: string[];
  rewardPoolCrv?: string;
};
