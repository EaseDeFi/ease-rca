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

export interface BorrowCap {
  value: string;
}

export interface BorrowRate {
  value: string;
}

export interface Cash {
  value: string;
}

export interface CollateralFactor {
  value: string;
}

export interface CompBorrowApy {
  value: string;
}

export interface CompSupplyApy {
  value: string;
}

export interface ExchangeRate {
  value: string;
}

export interface ReserveFactor {
  value: string;
}

export interface Reserves {
  value: string;
}

export interface SupplyRate {
  value: string;
}

export interface TotalBorrows {
  value: string;
}

export interface TotalSupply {
  value: string;
}

export interface UnderlyingPrice {
  value: string;
}

export interface CToken {
  borrow_cap: BorrowCap;
  borrow_rate: BorrowRate;
  cash: Cash;
  collateral_factor: CollateralFactor;
  comp_borrow_apy: CompBorrowApy;
  comp_supply_apy: CompSupplyApy;
  exchange_rate: ExchangeRate;
  interest_rate_model_address: string;
  name: string;
  number_of_borrowers: number;
  number_of_suppliers: number;
  reserve_factor: ReserveFactor;
  reserves: Reserves;
  supply_rate: SupplyRate;
  symbol: string;
  token_address: string;
  total_borrows: TotalBorrows;
  total_supply: TotalSupply;
  underlying_address: string;
  underlying_name: string;
  underlying_price: UnderlyingPrice;
  underlying_symbol: string;
}

export interface Meta {
  unique_borrowers: number;
  unique_suppliers: number;
}

export interface Request {
  addresses: any[];
  block_number: number;
  block_timestamp: number;
  meta: string;
  network: string;
}

export interface CompoundApiDetails {
  cToken: CToken[];
  error?: any;
  meta: Meta;
  request: Request;
}


