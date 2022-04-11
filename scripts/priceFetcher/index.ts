import { config } from "dotenv";
// local imports
import { rcaTokens } from "../vaultDetails";
import {
  getATokenPriceInUSD,
  getCTokenPriceInUSD,
  getcvxPoolTokenPriceinUSD,
  getOnsenLpTokenPriceInUSD,
  getPriceInEth,
  getRcaPriceInUSD,
  getyvTokenPriceInUSD,
} from "./helper";
// TYPES
import { Balance } from "./types";

config();

// 1. get eth vs usd = eth to usd =
// 2. get usd price of uTokens = uTokenPriceUSD = x
// 3. check uToken balance of rca vault = y
// 4. multiply the price to token balance = y * x = calc
// 5. total valut value will be twice uToken balance (calc = 2 * calc)
// 6. divide calc by total supply of rca's (calc = calc/totalSupplyRcaVault())

const balances: Balance[] = [];

async function fetchPrices() {
  /*//////////////////////////////////////////////////////////////
                            aTOKEN PRICE
  //////////////////////////////////////////////////////////////*/
  for (const token of rcaTokens.aave) {
    // TODO: get price of aToken in usd
    const uTokenPriceInUSD = await getATokenPriceInUSD({ coingeckoId: token.coingeckoId });
    // calculate price of rcaToken in usd
    const rcaTokenPriceInUSD = await getRcaPriceInUSD({
      uTokenAddress: token.address,
      shieldAddress: token.shield,
      uTokenPriceInUSD,
    });
    // do something with this data
    const rcaTokenPriceInETH = getPriceInEth({ priceInUSD: rcaTokenPriceInUSD });
  }
  /*//////////////////////////////////////////////////////////////
                        cTOKEN PRICE
  //////////////////////////////////////////////////////////////*/
  for (const token of rcaTokens.compound) {
    // TODO: get price of cToken in usd
    const uTokenPriceInUSD = await getCTokenPriceInUSD({ coingeckoId: token.coingeckoId, tokenAddress: token.address });
    // calculate price of rcaToken in usd
    const rcaTokenPriceInUSD = await getRcaPriceInUSD({
      uTokenAddress: token.address,
      shieldAddress: token.shield,
      uTokenPriceInUSD,
    });
    // do something with this data
    const rcaTokenPriceInETH = getPriceInEth({ priceInUSD: rcaTokenPriceInUSD });
  }

  /*//////////////////////////////////////////////////////////////
                      onsen Liq Tokens PRICE
  //////////////////////////////////////////////////////////////*/
  // ONE SIDED CALCULATION
  for (const token of rcaTokens.onsen) {
    // TODO: get price of lpToken in usd
    const uTokenPriceInUSD = await getOnsenLpTokenPriceInUSD({
      coingeckoId: token.coingeckoId,
      tokenAddress: token.address,
    });
    // calculate price of rcaToken in usd
    const rcaTokenPriceInUSD = await getRcaPriceInUSD({
      uTokenAddress: token.address,
      shieldAddress: token.shield,
      uTokenPriceInUSD,
    });
    // do something with this data
    const rcaTokenPriceInETH = getPriceInEth({ priceInUSD: rcaTokenPriceInUSD });
  }
  /*//////////////////////////////////////////////////////////////
                    yearn vault Tokens PRICE
  //////////////////////////////////////////////////////////////*/
  for (const token of rcaTokens.yearn) {
    // TODO: get price of yvToken in usd
    const uTokenPriceInUSD = await getyvTokenPriceInUSD({ tokenAddress: token.address });
    // calculate price of rcaToken in usd
    const rcaTokenPriceInUSD = await getRcaPriceInUSD({
      uTokenAddress: token.address,
      shieldAddress: token.shield,
      uTokenPriceInUSD,
    });
    // do something with this data
    const rcaTokenPriceInETH = getPriceInEth({ priceInUSD: rcaTokenPriceInUSD });
  }
  /*//////////////////////////////////////////////////////////////
                    Convex vault Tokens PRICE
  //////////////////////////////////////////////////////////////*/
  for (const token of rcaTokens.convex) {
    // TODO: get cvxToken prices
    const uTokenPriceInUSD = await getcvxPoolTokenPriceinUSD({ coingeckoId: token.coingeckoId });
    // calculate price of rcaToken in usd
    const rcaTokenPriceInUSD = await getRcaPriceInUSD({
      uTokenAddress: token.address,
      shieldAddress: token.shield,
      uTokenPriceInUSD,
    });
    // do something with this data
    const rcaTokenPriceInETH = getPriceInEth({ priceInUSD: rcaTokenPriceInUSD });
  }

  console.log(balances);
}

fetchPrices();
