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

const balances: Balance[] = [];

async function fetchPrices() {
  /*//////////////////////////////////////////////////////////////
                            aTOKEN PRICE
  //////////////////////////////////////////////////////////////*/
  for (const token of rcaTokens.aave) {
    // get price of aToken in usd
    const uTokenPriceInUSD = await getATokenPriceInUSD(token);
    // calculate price of rcaToken in usd
    console.log(token.name);
    console.log(uTokenPriceInUSD);
    const rcaTokenPriceInUSD = await getRcaPriceInUSD({
      uTokenAddress: token.address,
      shieldAddress: token.shield,
      uTokenPriceInUSD,
    });
    // do something with this data
    const rcaTokenPriceInETH = await getPriceInEth({ priceInUSD: rcaTokenPriceInUSD });
    console.log("Price in eth", rcaTokenPriceInETH);
  }
  /*//////////////////////////////////////////////////////////////
                        cTOKEN PRICE
  //////////////////////////////////////////////////////////////*/
  for (const token of rcaTokens.compound) {
    // TODO: get price of cToken in usd
    const uTokenPriceInUSD = await getCTokenPriceInUSD(token);
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
    const uTokenPriceInUSD = await getOnsenLpTokenPriceInUSD(token);
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
    const uTokenPriceInUSD = await getyvTokenPriceInUSD(token);
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
    const uTokenPriceInUSD = await getcvxPoolTokenPriceinUSD(token);
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
