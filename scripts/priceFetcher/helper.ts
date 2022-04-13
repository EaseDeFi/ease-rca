import axios from "axios";
import { config } from "dotenv";
import { CoinGeckoClient } from "coingecko-api-v3";
import { ethers } from "ethers";
import { formatEther, formatUnits } from "ethers/lib/utils";

import type { CTokenApiDetails, SymbolToId, YearnVaultDetails } from "./types";

// ABI's
import erc20Abi from "./abis/ERC20.json";
import uniswapV2PairAbi from "./abis/UniswapV2Pair.json";
import rcaShieldAbi from "./abis/RcaShield.json";

// TYPES
import { IUniswapV2Pair } from "../../src/types/IUniswapV2Pair";
import { MockERC20 } from "../../src/types/MockERC20";
import { RcaShield } from "../../src/types/RcaShield";
import { Price, RcaToken } from "../types";
import { JsonRpcProvider } from "@ethersproject/providers";

config();

export const USD_BUFFER_DECIMALS = 6;
export const ROUNDING_DECIMALS = 18;
export const USD_BUFFER = 10 ** USD_BUFFER_DECIMALS;

// TODO: change this to MAINNET_URL_ALCHEMY for mainnet price calculations
const RPC = process.env.TENDERLY_FORK;
export function getProvider(): JsonRpcProvider {
  return new ethers.providers.JsonRpcProvider(RPC);
}
export const tokenSymbolToCoingeckoId: SymbolToId = {
  weth: "weth",
  steth: "staked-ether",
  bit: "bitdao",
  dai: "dai",
  usdc: "usd-coin",
  usdt: "tether",
  frax: "frax",
  mim: "magic-internet-money",
  "3crv": "lp-3pool-curve",
  wbtc: "wrapped-bitcoin",
  renbtc: "renbtc",
  crvrenwbtc: "lp-renbtc-curve",
};

export async function getCoingeckoPrice(id: string): Promise<Price> {
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
  if (ethPriceData && ethPriceData.inUSD !== 0) {
    ethPriceInUSD = ethPriceData.inUSD;
  } else {
    //   TODO: check for eth balance on other sources and set ethPrice in usd
  }

  if (ethPriceInUSD === 0) {
    // TODO: fetch price from chainlink
  }
  return priceInUSD / ethPriceInUSD;
}

/*//////////////////////////////////////////////////////////////
                    rcaToken Price Helpers
  //////////////////////////////////////////////////////////////*/

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
  let rcaPriceInUSD = 0;
  try {
    const provider = getProvider();
    const uToken = <MockERC20>new ethers.Contract(uTokenAddress, erc20Abi, provider);
    const uTokenBalOfRcaVault = await uToken.balanceOf(shieldAddress);
    const uTokenDecimals = await uToken.decimals();

    const totalUTokenBalInUSD = uTokenPriceInUSD * +formatUnits(uTokenBalOfRcaVault, uTokenDecimals);
    const shield = <RcaShield>new ethers.Contract(shieldAddress, rcaShieldAbi, provider);
    const shieldTotalSupply = await shield.totalSupply();
    const shieldDecimals = await shield.decimals();
    const shieldTotalSupplyInNumber = +formatUnits(shieldTotalSupply, shieldDecimals);
    if (shieldTotalSupply.isZero()) {
      rcaPriceInUSD = uTokenPriceInUSD;
    } else {
      rcaPriceInUSD = totalUTokenBalInUSD / shieldTotalSupplyInNumber;
    }
  } catch {
    // Just a check that this doesn't error out if ez-contracts are not deployed on rpc
    console.log(`ez contract not found... Are you sure your provider is connected to right chain?`);
    rcaPriceInUSD = uTokenPriceInUSD;
  }
  return rcaPriceInUSD;
}

/*//////////////////////////////////////////////////////////////
                    CToken Price Helpers
  //////////////////////////////////////////////////////////////*/

export async function getCTokenPriceInUSD({ coingeckoId, address }: RcaToken): Promise<number> {
  const price = await getCoingeckoPrice(coingeckoId);
  // this conditional works for now
  if (price.inUSD !== 0) {
    return price.inUSD;
  } else {
    // TODO: complete this later
    const compoundApi = "https://api.compound.finance/api/v2/ctoken";
    const res = await axios.get(compoundApi);
    const cTokenDetails = res.data as CTokenApiDetails[];
    for (const cTokenDetail of cTokenDetails) {
      if (cTokenDetail.token_address === address) {
        // TODO: use the underlying price and exchange rate to calculate cToken Price in eth
      }
    }
  }
  // TODO: if not returned yet complete following later
  // console.log("Fetching details from contracts");
  // const provider = getProvider();
  // const cToken = <CToken>new ethers.Contract(address, cTokenAbi, provider);
  // const exchangeRate = await cToken.exchangeRateStored();
  return 0;
}

/*//////////////////////////////////////////////////////////////
                    AToken Price Helpers
  //////////////////////////////////////////////////////////////*/

export async function getATokenPriceInUSD({ coingeckoId }: RcaToken): Promise<number> {
  const price = await getCoingeckoPrice(coingeckoId);
  if (price.inUSD !== 0) {
    return price.inUSD;
  } else {
    // TODO: try another method to get price of token later
  }
  return 0;
}

export async function getyvTokenPriceInUSD({ address }: RcaToken): Promise<number> {
  const api = "https://api.yearn.finance/v1/chains/1/vaults/all";
  const res = await axios.get(api);
  const vaultsData = res.data as YearnVaultDetails[];
  for (const vaultData of vaultsData) {
    if (address === vaultData.address) {
      return vaultData.tvl.price;
    }
  }
  // TODO: find another way to calculate price

  // this represents no price was found
  return 0;
}

/*//////////////////////////////////////////////////////////////
                    ONSEN Price Helpers
  //////////////////////////////////////////////////////////////*/

export async function getOnsenLpTokenPriceInUSD({ coingeckoId, address }: RcaToken): Promise<number> {
  if (coingeckoId.length > 0) {
    const priceData = await getCoingeckoPrice(coingeckoId);
    if (priceData.inUSD > 0) {
      return priceData.inUSD;
    }
  }
  const provider = getProvider();
  const wethPriceData = await getCoingeckoPrice("weth");
  const pairContract = <IUniswapV2Pair>new ethers.Contract(address, uniswapV2PairAbi, provider);
  const totalPairTokenSupply = await pairContract.totalSupply();
  const pairDecimals = await pairContract.decimals();
  const reserves = await pairContract.getReserves();
  const token0Address = await pairContract.token0();
  const token0Contract = <MockERC20>new ethers.Contract(token0Address, erc20Abi, provider);
  const token0Symbol = await token0Contract.symbol();
  const token0Decimals = await token0Contract.decimals();
  const token1Address = await pairContract.token1();
  const token1Contract = <MockERC20>new ethers.Contract(token1Address, erc20Abi, provider);
  const token1Symbol = await token1Contract.symbol();
  const token1Decimals = await token1Contract.decimals();
  let tokenBalance = 0;

  if (token0Symbol === "WETH") {
    tokenBalance = +formatUnits(reserves[0], token0Decimals);
  } else if (token1Symbol === "WETH") {
    tokenBalance = +formatUnits(reserves[1], token1Decimals);
  }

  if (tokenBalance !== 0) {
    // means we have WETH in our pair

    // multiplying by 2 for two side of liquidity
    const totalPoolValue = wethPriceData.inUSD * tokenBalance * 2;
    const totalPairTokenSupplyInNumber = +formatUnits(totalPairTokenSupply, pairDecimals);
    const poolTokenPriceInUSD = totalPoolValue / totalPairTokenSupplyInNumber;
    return poolTokenPriceInUSD;
  } else {
    // TODO: find prices for token symbol. Not needed for current supported pools as they are pair of weth
  }
  // this represents no price was found
  return 0;
}

/*//////////////////////////////////////////////////////////////
                    cvx Price Helpers
  //////////////////////////////////////////////////////////////*/

export async function getcvxPoolTokenPriceinUSD({ coingeckoId, symbol }: RcaToken): Promise<number> {
  if (coingeckoId.length > 0) {
    const priceData = await getCoingeckoPrice(coingeckoId);
    if (priceData.inUSD > 0) {
      return priceData.inUSD;
    }
  } else {
    if (symbol === "ez-cvxFRAX3CRV-f") {
      return await getFrax3CrvPriceInUSD();
    } else if (symbol === "ez-cvxsteCRV") {
      return await getSteCrvPriceInUSD();
    } else if (symbol === "ez-cvxcrvRenWBTC") {
      return await getCrvRenWbtcPriceInUSD();
    } else if (symbol === "ez-cvxMIM-3LP3CRV-f") {
      return getMim3CrvPriceInUSD();
    } else if (symbol === "ez-cvxcrv3crypto") {
      return getCrv3cryptoPriceInUSD();
    }
  }
  return 0;
}

export async function getFrax3CrvPriceInUSD(): Promise<number> {
  const underLyingTokens = {
    frax: { address: "0x853d955aCEf822Db058eb8505911ED77F175b99e", coingeckoId: tokenSymbolToCoingeckoId["frax"] },
    "3crv": { address: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490", coingeckoId: tokenSymbolToCoingeckoId["3crv"] },
  };
  const poolAddress = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";
  const poolTokenAddress = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";
  const poolFraxBal = await getTokenBalance({
    contractAddress: underLyingTokens.frax.address,
    userAddress: poolAddress,
  });
  const fraxPrice = await getCoingeckoPrice(underLyingTokens.frax.coingeckoId);

  const pool3CrvBal = await getTokenBalance({
    contractAddress: underLyingTokens["3crv"].address,
    userAddress: poolAddress,
  });
  const _3crvPrice = await getCoingeckoPrice(underLyingTokens["3crv"].coingeckoId);
  const poolTotalSupply = await getErc20TotalSupply(poolTokenAddress);
  // if api call fails we don't calculate wrong price
  if (_3crvPrice.inUSD === 0 || fraxPrice.inUSD === 0) {
    return 0;
  }
  const poolTotalBalanceInUSD = poolFraxBal * fraxPrice.inUSD + pool3CrvBal * _3crvPrice.inUSD;

  const pricePerPoolToken = poolTotalBalanceInUSD / poolTotalSupply;
  return pricePerPoolToken;
}

export async function getSteCrvPriceInUSD(): Promise<number> {
  const underLyingTokens = {
    ethereum: { address: ethers.constants.AddressZero, coingeckoId: "ethereum" },
    stEth: { address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", coingeckoId: tokenSymbolToCoingeckoId["steth"] },
  };
  const poolAddress = "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022";
  const poolTokenAddress = "0x06325440D014e39736583c165C2963BA99fAf14E";
  const poolTotalSupply = await getErc20TotalSupply(poolTokenAddress);
  const poolEthBal = await getTokenBalance({
    contractAddress: underLyingTokens.ethereum.address,
    userAddress: poolAddress,
  });
  const ethPrice = await getCoingeckoPrice(underLyingTokens.ethereum.coingeckoId);

  const poolStEthBal = await getTokenBalance({
    contractAddress: underLyingTokens.stEth.address,
    userAddress: poolAddress,
  });
  const stEthPrice = await getCoingeckoPrice(underLyingTokens.stEth.coingeckoId);
  if (ethPrice.inUSD === 0 || stEthPrice.inUSD === 0) {
    return 0;
  }
  const poolTotalBalanceInUSD = poolEthBal * ethPrice.inUSD + poolStEthBal * stEthPrice.inUSD;
  const pricePerPoolToken = poolTotalBalanceInUSD / poolTotalSupply;
  return pricePerPoolToken;
}

// crvRENWBTC
export async function getCrvRenWbtcPriceInUSD(): Promise<number> {
  const underLyingTokens = {
    renBtc: { address: "0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D", coingeckoId: tokenSymbolToCoingeckoId["renbtc"] },
    wbtc: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", coingeckoId: tokenSymbolToCoingeckoId["wbtc"] },
  };
  const poolAddress = "0x93054188d876f558f4a66B2EF1d97d16eDf0895B";
  const poolTokenAddress = "0x49849C98ae39Fff122806C06791Fa73784FB3675";
  const poolTotalSupply = await getErc20TotalSupply(poolTokenAddress);
  // renBTC
  const poolRenBtcBal = await getTokenBalance({
    contractAddress: underLyingTokens.renBtc.address,
    userAddress: poolAddress,
  });
  const renBtcPrice = await getCoingeckoPrice(underLyingTokens.renBtc.coingeckoId);

  // WBTC
  const poolWbtcBal = await getTokenBalance({
    contractAddress: underLyingTokens.wbtc.address,
    userAddress: poolAddress,
  });
  const wbtcPrice = await getCoingeckoPrice(underLyingTokens.wbtc.coingeckoId);
  if (wbtcPrice.inUSD === 0 || renBtcPrice.inUSD === 0) {
    return 0;
  }

  const poolTotalBalanceInUSD = poolRenBtcBal * renBtcPrice.inUSD + poolWbtcBal * wbtcPrice.inUSD;
  const poolTokenPriceInUSD = poolTotalBalanceInUSD / poolTotalSupply;

  return poolTokenPriceInUSD;
}

// MIM-3CRV
export async function getMim3CrvPriceInUSD(): Promise<number> {
  const underLyingTokens = {
    mim: { address: "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3", coingeckoId: tokenSymbolToCoingeckoId["mim"] },
    "3crv": { address: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490", coingeckoId: tokenSymbolToCoingeckoId["3crv"] },
  };
  const poolAddress = "0x5a6A4D54456819380173272A5E8E9B9904BdF41B";
  const poolTokenAddress = "0x5a6A4D54456819380173272A5E8E9B9904BdF41B";
  const poolMimBal = await getTokenBalance({
    contractAddress: underLyingTokens.mim.address,
    userAddress: poolAddress,
  });
  const mimPrice = await getCoingeckoPrice(underLyingTokens.mim.coingeckoId);

  const pool3CrvBal = await getTokenBalance({
    contractAddress: underLyingTokens["3crv"].address,
    userAddress: poolAddress,
  });
  const _3crvPrice = await getCoingeckoPrice(underLyingTokens["3crv"].coingeckoId);
  const poolTotalSupply = await getErc20TotalSupply(poolTokenAddress);
  // if api call fails we don't calculate wrong price
  if (_3crvPrice.inUSD === 0 || mimPrice.inUSD === 0) {
    return 0;
  }
  const poolTotalBalanceInUSD = poolMimBal * mimPrice.inUSD + pool3CrvBal * _3crvPrice.inUSD;

  const pricePerPoolToken = poolTotalBalanceInUSD / poolTotalSupply;
  return pricePerPoolToken;
}

// TRI-CRYPTO
export async function getCrv3cryptoPriceInUSD(): Promise<number> {
  const underLyingTokens = {
    usdt: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", coingeckoId: tokenSymbolToCoingeckoId["usdt"] },
    weth: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", coingeckoId: tokenSymbolToCoingeckoId["weth"] },
    wbtc: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", coingeckoId: tokenSymbolToCoingeckoId["wbtc"] },
  };
  const poolAddress = "0xD51a44d3FaE010294C616388b506AcdA1bfAAE46";
  const poolTokenAddress = "0xc4AD29ba4B3c580e6D59105FFf484999997675Ff";
  const poolTotalSupply = await getErc20TotalSupply(poolTokenAddress);
  // USDT
  const poolUSDTBal = await getTokenBalance({
    contractAddress: underLyingTokens.usdt.address,
    userAddress: poolAddress,
  });
  const usdtPrice = await getCoingeckoPrice(tokenSymbolToCoingeckoId["usdt"]);

  // WETH
  const poolWethBal = await getTokenBalance({
    contractAddress: underLyingTokens.weth.address,
    userAddress: poolAddress,
  });
  const wethPrice = await getCoingeckoPrice(tokenSymbolToCoingeckoId["weth"]);

  // WBTC
  const poolWbtcBal = await getTokenBalance({
    contractAddress: underLyingTokens.wbtc.address,
    userAddress: poolAddress,
  });
  const wbtcPrice = await getCoingeckoPrice(tokenSymbolToCoingeckoId["wbtc"]);

  // if api call fails we don't calculate wrong price of a 3Crypto
  if (usdtPrice.inUSD === 0 || wethPrice.inUSD === 0 || wbtcPrice.inUSD === 0) {
    return 0;
  }

  const poolTotalBalanceInUSD =
    poolUSDTBal * usdtPrice.inUSD + poolWethBal * wethPrice.inUSD + poolWbtcBal * wbtcPrice.inUSD;
  const pricePerPoolToken = poolTotalBalanceInUSD / poolTotalSupply;
  return pricePerPoolToken;
}

/*//////////////////////////////////////////////////////////////
                    ERC20 helpers
  //////////////////////////////////////////////////////////////*/

export async function getErc20Symbol(contractAddress: string): Promise<string> {
  const provider = getProvider();
  const token = <MockERC20>new ethers.Contract(contractAddress, erc20Abi, provider);
  const symbol = await token.symbol();
  return symbol;
}

export async function getTokenBalance({
  contractAddress,
  userAddress,
}: {
  contractAddress: string;
  userAddress: string;
}): Promise<number> {
  const provider = getProvider();
  if (contractAddress === ethers.constants.AddressZero) {
    const balance = await provider.getBalance(userAddress);
    return +formatEther(balance);
  }
  const token = <MockERC20>new ethers.Contract(contractAddress, erc20Abi, provider);
  const tokenDecimals = await token.decimals();
  const balance = await token.balanceOf(userAddress);
  return +formatUnits(balance, tokenDecimals);
}

export async function getErc20TotalSupply(contractAddress: string): Promise<number> {
  const provider = getProvider();
  const token = <MockERC20>new ethers.Contract(contractAddress, erc20Abi, provider);
  const tokenDecimals = await token.decimals();
  const totalSupply = await token.totalSupply();
  return +formatUnits(totalSupply, tokenDecimals);
}
