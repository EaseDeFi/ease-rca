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
import { TokenPrice } from "./types";

async function fetchPrices(): Promise<TokenPrice[]> {
  const tokenPrices: TokenPrice[] = [];
  /*//////////////////////////////////////////////////////////////
                            aTOKEN PRICE
  //////////////////////////////////////////////////////////////*/
  console.log("Fetching prices for ez-aTokens....");
  for (const token of rcaTokens.aave) {
    // get price of aToken in usd
    const uTokenPriceInUSD = await getATokenPriceInUSD(token);
    // calculate price of rcaToken in usd
    const rcaTokenPriceInUSD = await getRcaPriceInUSD({
      uTokenAddress: token.address,
      shieldAddress: token.shield,
      uTokenPriceInUSD,
    });
    // do something with this data
    const rcaTokenPriceInETH = await getPriceInEth({ priceInUSD: rcaTokenPriceInUSD });
    tokenPrices.push({
      name: token.name,
      symbol: token.symbol,
      shieldAddress: token.shield,
      uTokenAddress: token.address,
      inETH: rcaTokenPriceInETH,
      inUSD: rcaTokenPriceInUSD,
    });
  }
  /*//////////////////////////////////////////////////////////////
                        cTOKEN PRICE
  //////////////////////////////////////////////////////////////*/
  console.log("Fetching prices for ez-cTokens....");
  for (const token of rcaTokens.compound) {
    // get price of cToken in usd
    const uTokenPriceInUSD = await getCTokenPriceInUSD(token);
    // calculate price of rcaToken in usd
    const rcaTokenPriceInUSD = await getRcaPriceInUSD({
      uTokenAddress: token.address,
      shieldAddress: token.shield,
      uTokenPriceInUSD,
    });
    // do something with this data
    const rcaTokenPriceInETH = await getPriceInEth({ priceInUSD: rcaTokenPriceInUSD });
    tokenPrices.push({
      name: token.name,
      symbol: token.symbol,
      shieldAddress: token.shield,
      uTokenAddress: token.address,
      inETH: rcaTokenPriceInETH,
      inUSD: rcaTokenPriceInUSD,
    });
  }

  /*//////////////////////////////////////////////////////////////
                      onsen Liq Tokens PRICE
  //////////////////////////////////////////////////////////////*/
  console.log("Fetching prices for ez-SushiPools....");
  // ONE SIDED CALCULATION
  for (const token of rcaTokens.onsen) {
    // get price of lpToken in usd
    const uTokenPriceInUSD = await getOnsenLpTokenPriceInUSD(token);
    // calculate price of rcaToken in usd
    const rcaTokenPriceInUSD = await getRcaPriceInUSD({
      uTokenAddress: token.address,
      shieldAddress: token.shield,
      uTokenPriceInUSD,
    });
    // do something with this data
    const rcaTokenPriceInETH = await getPriceInEth({ priceInUSD: rcaTokenPriceInUSD });
    tokenPrices.push({
      name: token.name,
      symbol: token.symbol,
      shieldAddress: token.shield,
      uTokenAddress: token.address,
      inETH: rcaTokenPriceInETH,
      inUSD: rcaTokenPriceInUSD,
    });
  }
  /*//////////////////////////////////////////////////////////////
                    yearn vault Tokens PRICE
  //////////////////////////////////////////////////////////////*/
  console.log("Fetching prices for ez-yearnPools....");
  for (const token of rcaTokens.yearn) {
    // get price of yvToken in usd
    const uTokenPriceInUSD = await getyvTokenPriceInUSD(token);
    // calculate price of rcaToken in usd
    const rcaTokenPriceInUSD = await getRcaPriceInUSD({
      uTokenAddress: token.address,
      shieldAddress: token.shield,
      uTokenPriceInUSD,
    });
    // do something with this data
    const rcaTokenPriceInETH = await getPriceInEth({ priceInUSD: rcaTokenPriceInUSD });
    tokenPrices.push({
      name: token.name,
      symbol: token.symbol,
      shieldAddress: token.shield,
      uTokenAddress: token.address,
      inETH: rcaTokenPriceInETH,
      inUSD: rcaTokenPriceInUSD,
    });
  }
  /*//////////////////////////////////////////////////////////////
                    Convex vault Tokens PRICE
  //////////////////////////////////////////////////////////////*/
  console.log("Fetching prices for ez-cvxPools....");
  for (const token of rcaTokens.convex) {
    // get cvxToken prices
    const uTokenPriceInUSD = await getcvxPoolTokenPriceinUSD(token);
    // calculate price of rcaToken in usd
    const rcaTokenPriceInUSD = await getRcaPriceInUSD({
      uTokenAddress: token.address,
      shieldAddress: token.shield,
      uTokenPriceInUSD,
    });
    // do something with this data
    const rcaTokenPriceInETH = await getPriceInEth({ priceInUSD: rcaTokenPriceInUSD });
    tokenPrices.push({
      name: token.name,
      symbol: token.symbol,
      shieldAddress: token.shield,
      uTokenAddress: token.address,
      inETH: rcaTokenPriceInETH,
      inUSD: rcaTokenPriceInUSD,
    });
  }
  return tokenPrices;
}

async function main() {
  console.log("Fetching prices.... This may take a while....");
  const tokenPrices = await fetchPrices();
  console.log("Token price fetched... Verifying now....");
  // TODO: this is framework for verifying and updating prices
  for (const tokenPrice of tokenPrices) {
    if (tokenPrice.inETH === 0 && tokenPrice.inUSD === 0) {
      console.log(`Couldn't get price for ${tokenPrice.name}`);
      // TODO: tell bot to inform ease-devs
    } else if (tokenPrice.inETH === 0) {
      // TODO: calculate token price in eth using tokenprice in usd and update tokenPrice object
    } else if (tokenPrice.inUSD === 0) {
      // TODO: calculate token price in eth and update tokenPrice object
    }

    // TODO: call api/lastPrice/`${tokenPrice.shield}`
    // check for % difference
    // if there's high difference alert ease-devs
  }
  console.log(tokenPrices);
}

main();
