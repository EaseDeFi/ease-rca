export type SymbolToId = {
  [key: string]: string;
};
export type TokenToUnderlyingSymbol = {
  [key: string]: string;
};

export type TokenPrice = {
  name: string;
  symbol: string;
  inETH: number;
  inUSD: number;
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

export type CTokenApiDetails = {
  symbol: string;
  token_address: string;
  exchange_rate: {
    value: number;
  };
  underlying_address: string;
  underlying_price: {
    value: number;
  };
};
