import { CoinGeckoClient } from "coingecko-api-v3";
import { BigNumber, ethers } from "ethers";
import { rcaTokens } from "../vaultDetails";
import { config } from "dotenv";
// TYPES
import { IUniswapV2Pair } from "../../src/types/IUniswapV2Pair";
import { MockERC20 } from "../../src/types/MockERC20";
// ABI's
import erc20ABI from "./abis/ERC20.json";
import uniswapV2PairAbi from "./abis/UniswapV2Pair.json";
import { formatUnits } from "ethers/lib/utils";

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
  // this will help us avoiding multiple api calls
  const wethPriceData = await getCoingeckoPrice("weth");
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
      // TODO: find another way to calculate price
      // const cToken = new ethers.Contract(
      //   token.address,
      //   ["function exchangeRateStored() external view returns (uint256)"],
      //   provider,
      // );
      // const exchangeRateStored = await cToken.exchangeRateStored();
      // console.log(exchangeRateStored);
      // TODO: now calculate price using the exchangeRate
    }
  }

  /*//////////////////////////////////////////////////////////////
                      onsen Liq Tokens PRICE
  //////////////////////////////////////////////////////////////*/
  for (const token of rcaTokens.onsen) {
    // TODO: get sushi prices
    const pairContract = <IUniswapV2Pair>new ethers.Contract(token.address, uniswapV2PairAbi, provider);
    const totalPairTokenSupply = await pairContract.totalSupply();
    const reserves = await pairContract.getReserves();
    const token0Address = await pairContract.token0();
    const token0Contract = <MockERC20>new ethers.Contract(token0Address, erc20ABI, provider);
    const token0Symbol = await token0Contract.symbol();
    const token1Address = await pairContract.token1();
    const token1Contract = <MockERC20>new ethers.Contract(token1Address, erc20ABI, provider);
    const token1Symbol = await token1Contract.symbol();
    let tokenBalance: BigNumber = BigNumber.from(0);
    if (token0Symbol === "WETH") {
      tokenBalance = reserves[0];
    } else if (token1Symbol === "WETH") {
      tokenBalance = reserves[1];
    }
    if (!tokenBalance.isZero()) {
      // means we have WETH in our pair
      const USD_BUFFER = 10 ** 6;
      // ROUNDING
      const scaledWethPriceInUSD = wethPriceData.inUSD * USD_BUFFER;
      const wethPriceinUSD = BigNumber.from(scaledWethPriceInUSD);

      const totalPoolValue = tokenBalance.mul(wethPriceinUSD).mul(BigNumber.from(2));
      const totalPoolValueNormalizedInUSD = totalPoolValue
        .mul(BigNumber.from(10 ** 10))
        .div(totalPairTokenSupply)
        .div(USD_BUFFER);
      console.log(`Price of ${token.symbol} in usd: `, formatUnits(totalPoolValueNormalizedInUSD, 10));
    } else {
      console.log(`Couldn't find price for ${token.symbol}`);
      // TODO: find prices for token symbol. Not needed for current supported pools as they are pair of weth
    }
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
