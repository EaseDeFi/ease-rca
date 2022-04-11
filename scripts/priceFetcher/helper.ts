import axios from "axios";
import { CoinGeckoClient } from "coingecko-api-v3";
import { BigNumber, ethers } from "ethers";
import { formatUnits } from "ethers/lib/utils";

import type { SymbolToId, YearnVaultDetails } from "./types";

// ABI's
import erc20Abi from "./abis/ERC20.json";
import cTokenAbi from "./abis/CToken.json";
import uniswapV2PairAbi from "./abis/UniswapV2Pair.json";
import rcaShieldAbi from "./abis/RcaShield.json";

// TYPES
import { IUniswapV2Pair } from "../../src/types/IUniswapV2Pair";
import { MockERC20 } from "../../src/types/MockERC20";
import { CToken } from "../../src/types/CToken";
import { RcaShield } from "../../src/types/RcaShield";

export const USD_BUFFER_DECIMALS = 6;
export const USD_BUFFER = 10 ** USD_BUFFER_DECIMALS;

export const coingeckoSymbolToId: SymbolToId = {
  weth: "weth",
  bit: "bitdao",
  dai: "dai",
  usdc: "usd-coin",
  wbtc: "wrapped-bitcoin",
  usdt: "tether",
};

export async function getCoingeckoPrice(id: string): Promise<{ inETH: number; inUSD: number }> {
  const client = new CoinGeckoClient({
    timeout: 10000,
    autoRetry: true,
  });
  const res = await client.simplePrice({ vs_currencies: "eth,usd", ids: id });
  if (res[`${id}`] !== undefined) {
    return {
      inETH: res[`${id}`].eth,
      inUSD: res[`${id}`].usd,
    };
  }
  // this means we didn't get any data
  return { inETH: 0, inUSD: 0 };
}

export async function getPriceInEth({ priceInUSD }: { priceInUSD: number }): Promise<number> {
  const ethPriceData = await getCoingeckoPrice("ethereum");
  let ethPriceInUSD = 0;
  if (ethPriceData.inUSD !== 0) {
    ethPriceInUSD = ethPriceData.inUSD;
  } else {
    //   TODO: check for eth balance on other sources and set ethPrice in usd
  }

  if (ethPriceInUSD === 0) {
    // TODO: fetch price from chainlink
  }
  return priceInUSD / ethPriceInUSD;
}

// helper to calculate price of rca given price of uToken
export async function getRcaPriceInUSD({
  uTokenAddress,
  uTokenPriceInUSD,
  shieldAddress,
}: {
  uTokenPriceInUSD: number;
  shieldAddress: string;
  uTokenAddress: string;
}): Promise<number> {
  const provider = new ethers.providers.JsonRpcProvider(process.env.MAINNET_URL_ALCHEMY);
  const uToken = <MockERC20>new ethers.Contract(uTokenAddress, erc20Abi, provider);
  const uTokenBalOfRcaVault = await uToken.balanceOf(shieldAddress);
  const amountUTokenLockedInUSD = BigNumber.from(uTokenPriceInUSD * USD_BUFFER).mul(uTokenBalOfRcaVault);
  // double the value
  const totalVaultValueInUSD = amountUTokenLockedInUSD.mul(2);
  const shield = <RcaShield>new ethers.Contract(shieldAddress, rcaShieldAbi, provider);
  const shieldTotalSupply = await shield.totalSupply();
  let rcaPriceInUSD: number;
  if (shieldTotalSupply.gt(0)) {
    const rcaPrice = totalVaultValueInUSD.div(shieldTotalSupply);
    rcaPriceInUSD = +formatUnits(rcaPrice, USD_BUFFER_DECIMALS);
  }
  return rcaPriceInUSD;
}

export async function getCTokenPriceInUSD({
  coingeckoId,
  tokenAddress,
}: {
  coingeckoId: string;
  tokenAddress: string;
}): Promise<number> {
  const price = await getCoingeckoPrice(coingeckoId);
  if (price.inUSD !== 0) {
    return price.inUSD;
  } else {
    //   TODO: fetch details from different source
    const provider = new ethers.providers.JsonRpcProvider(process.env.MAINNET_URL_ALCHEMY);
    const cToken = <CToken>new ethers.Contract(tokenAddress, cTokenAbi, provider);
    const exchangeRate = await cToken.exchangeRateStored();

    // TODO: get price of underlying token that represents cToken
  }
  // TODO: find another way to calculate price
  return 0;
}

export async function getATokenPriceInUSD({ coingeckoId }: { coingeckoId: string }): Promise<number> {
  try {
    const price = await getCoingeckoPrice(coingeckoId);
    return price.inETH;
  } catch {
    // TODO: try another method to get price of token
    console.log(`Couldn't fetch price of ${coingeckoId}`);
  }
  return 0;
}

export async function getyvTokenPriceInUSD({ tokenAddress }: { tokenAddress: string }): Promise<number> {
  const api = "https://api.yearn.finance/v1/chains/1/vaults/all";
  const res = await axios.get(api);
  const vaultsData = res.data as YearnVaultDetails[];
  for (const vaultData of vaultsData) {
    if (tokenAddress === vaultData.address) {
      // handle decimals being long?
      return vaultData.tvl.price;
    }
  }
  // this represents no price was found
  return 0;
}

export async function getOnsenLpTokenPriceInUSD({
  coingeckoId,
  tokenAddress,
}: {
  coingeckoId: string;
  tokenAddress: string;
}): Promise<number> {
  if (coingeckoId.length > 0) {
    const priceData = await getCoingeckoPrice(coingeckoId);
    if (priceData.inETH > 0) {
      return priceData.inETH;
    }
  }
  const provider = new ethers.providers.JsonRpcProvider(process.env.MAINNET_URL_ALCHEMY);
  const wethPriceData = await getCoingeckoPrice("weth");
  const pairContract = <IUniswapV2Pair>new ethers.Contract(tokenAddress, uniswapV2PairAbi, provider);
  const totalPairTokenSupply = await pairContract.totalSupply();
  const reserves = await pairContract.getReserves();
  const token0Address = await pairContract.token0();
  const token0Contract = <MockERC20>new ethers.Contract(token0Address, erc20Abi, provider);
  const token0Symbol = await token0Contract.symbol();
  const token1Address = await pairContract.token1();
  const token1Contract = <MockERC20>new ethers.Contract(token1Address, erc20Abi, provider);
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
    const tokenPriceNormalizedInUSD = totalPoolValue
      .mul(BigNumber.from(10 ** 10))
      .div(totalPairTokenSupply)
      .div(USD_BUFFER);

    return parseFloat(formatUnits(tokenPriceNormalizedInUSD, 10));
  } else {
    console.log(`Couldn't find price for ${tokenAddress}`);
    // TODO: find prices for token symbol. Not needed for current supported pools as they are pair of weth
  }
  // this represents no price was found
  return 0;
}

export async function getcvxPoolTokenPriceinUSD({ coingeckoId }: { coingeckoId: string }): Promise<number> {
  if (coingeckoId.length > 0) {
    const priceData = await getCoingeckoPrice(coingeckoId);
    if (priceData.inETH > 0) {
      return priceData.inETH;
    }
  }
  console.log(`Couldn't find pricedata for ${coingeckoId}`);
  // TODO: find alternate source for data
  return 0;
}
