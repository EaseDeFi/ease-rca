export type SymbolToId = {
  [key: string]: string;
};
export type TokenToUnderlyingSymbol = {
  [key: string]: string;
};

export type Balance = {
  name: string;
  symbol: string;
  priceInETH: number;
  priceInUSD: number;
  uTokenAddress?: string;
  shieldAddress?: string;
};
export type YearnVaultDetails = {
  symbol: string;
  address: string;
  tvl: {
    total_assets: number;
    price: number;
    tvl: number;
  };
};
