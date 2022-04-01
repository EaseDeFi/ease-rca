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
};
export type FundMeTokenArgs = {
  details: RcaToken;
  ethWhaleSigner: Signer;
  me: string;
  sendAllWhaleBalance?: boolean;
};
