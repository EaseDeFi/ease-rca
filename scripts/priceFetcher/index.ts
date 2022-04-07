import { CoinGeckoClient } from "coingecko-api-v3";
import { ethers } from "ethers";
import { rcaTokens } from "../vaultDetails";
import { config } from "dotenv";

config();

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
  const provider = new ethers.providers.JsonRpcProvider(process.env.MAINNET_URL_ALCHEMY);
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
      console.log(`Couldn't fetch price of ${token.coingeckoId} from coingecko. Fetching from contract.`);
      const cToken = new ethers.Contract(
        token.address,
        ["function exchangeRateStored() external view returns (uint256)"],
        provider,
      );
      const exchangeRateStored = await cToken.exchangeRateStored();
      console.log(exchangeRateStored);
      // TODO: now calculate price using the exchangeRate
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
