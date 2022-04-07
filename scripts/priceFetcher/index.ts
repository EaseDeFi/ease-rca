import { CoinGeckoClient } from "coingecko-api-v3";
import { rcaTokens } from "../vaultDetails";

type Balance = {
  name: string;
  symbol: string;
  priceInETH: number;
  priceInUSD: number;
};
const balances: Balance[] = [];

export async function getCoingeckoPrice(id: string): Promise<{ inETH: number; inUSD: number }> {
  const client = new CoinGeckoClient({
    timeout: 10000,
    autoRetry: true,
  });
  const res = await client.simplePrice({ vs_currencies: "eth,usd", ids: id });
  return {
    inETH: res[`${id}`].eth,
    inUSD: res[`${id}`].usd,
  };
}

async function fetchPrices() {
  /*//////////////////////////////////////////////////////////////
                            aTOKEN PRICE
  //////////////////////////////////////////////////////////////*/
  for (const token of rcaTokens.aave) {
    try {
      const price = await getCoingeckoPrice(token.coingeckoId);
      // TODO: check if price is in proof
      balances.push({
        priceInETH: price.inETH,
        priceInUSD: price.inUSD,
        symbol: token.symbol,
        name: token.name,
      });
    } catch {
      // TODO: try another method to get price of token
      console.log(`Couldn't fetch price of ${token.name}`);
    }
  }
  /*//////////////////////////////////////////////////////////////
                        cTOKEN PRICE
  //////////////////////////////////////////////////////////////*/
  for (const token of rcaTokens.compound) {
    try {
      const price = await getCoingeckoPrice(token.coingeckoId);
      balances.push({
        priceInETH: price.inETH,
        priceInUSD: price.inUSD,
        symbol: token.symbol,
        name: token.name,
      });
    } catch (err) {
      console.log(err);
      console.log(`Couldn't fetch price of ${token.name}`);
    }
  }

  /*//////////////////////////////////////////////////////////////
                      onsen Liq Tokens PRICE
  //////////////////////////////////////////////////////////////*/
  for (const token of rcaTokens.onsen) {
    // TODO: get sushi prices
  }
  /*//////////////////////////////////////////////////////////////
                    yearn vault Tokens PRICE
  //////////////////////////////////////////////////////////////*/
  for (const token of rcaTokens.yearn) {
    // TODO: get sushi prices
  }
  /*//////////////////////////////////////////////////////////////
                    convex vault Tokens PRICE
  //////////////////////////////////////////////////////////////*/
  for (const token of rcaTokens.convex) {
    // TODO: get sushi prices
  }

  console.log(balances);
}

fetchPrices();
