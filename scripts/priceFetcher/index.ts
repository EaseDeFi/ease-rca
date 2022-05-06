// AWS imports
import { DynamoDB } from "aws-sdk";
// local imports
import { rcaTokens, rewardTokens } from "../vaultDetails";
import assert from "assert";
import {
  getATokenPriceInUSD,
  getCoingeckoPrice,
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
  /*//////////////////////////////////////////////////////////////
                    Reward Token Prices
  //////////////////////////////////////////////////////////////*/
  console.log("Fetching prices for reward tokens....");
  for (const token of rewardTokens) {
    const getTokenPrice = await getCoingeckoPrice(token.coingeckoId);
    tokenPrices.push({
      name: token.name,
      symbol: token.symbol,
      uTokenAddress: token.address,
      inETH: getTokenPrice.inETH,
      inUSD: getTokenPrice.inUSD,
    });
  }

  return tokenPrices;
}

async function savePrices(tokenPrices: TokenPrice[]): Promise<string> {
  const docClient = new DynamoDB.DocumentClient({
    accessKeyId: process.env.DB_ACCESS_KEY,
    secretAccessKey: process.env.DB_SECRET_KEY,
    region: process.env.DB_REGION,
  });
  for (const tokenPrice of tokenPrices) {
    assert(tokenPrice.uTokenAddress, "uToken must have a value");
    console.log(
      `Save token ${tokenPrice.uTokenAddress} with priceETH: ${tokenPrice.inETH} and priceUSD: ${tokenPrice.inUSD}`,
    );
    const params = {
      TableName: "org.ease.tokens",
      Key: {
        address: tokenPrice.uTokenAddress.toLowerCase(),
      },
      UpdateExpression: "set priceUSD = :priceUSD, priceETH = :priceETH",
      ExpressionAttributeValues: {
        ":priceUSD": tokenPrice.inUSD,
        ":priceETH": tokenPrice.inETH,
      },
    };

    await docClient.update(params, function (err, data) {
      if (err) console.log(err);
    });
  }

  return Promise.resolve("done");
}

async function main() {
  console.log("Fetching prices.... This may take a while....");
  const tokenPrices = await fetchPrices();

  console.log("Token price fetched... Saving now....");
  const warnings = await savePrices(tokenPrices);

  console.log("Done: " + warnings);
}

main();
