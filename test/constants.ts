import { EaseAddresses, MainnetAddresses, TimeInSecs } from "./types";
export const EASE_ADDRESSES: EaseAddresses = {
  rcas: {
    controller: "0xEA5edEF1A7106D9e2024240299DF3D00C7D94767",
    shields: [],
  },
  tokenSwap: "0xEA5edef17986EAbb7333bacdC9E2F574C7Fe6935",
  token: "0xEa5eDef1287AfDF9Eb8A46f9773AbFc10820c61c",
  bribePot: "0xEA5EdeF17C9be57228389962ba50b98397f1E28C",
  gvToken: "0xEa5edeF1eDB2f47B9637c029A6aC3b80a7ae1550",
  timelock: "0xEA5edEf1401e8C312c797c27a9842e03Eb0e557a",
  governance: "0xEA5eDeF17c4FCE9C120790F3c54D6E04823dE587",
};

export const MAINNET_ADDRESSES: MainnetAddresses = {
  contracts: {
    aave: {
      incentivesController: "0xd784927Ff2f95ba542BfC824c8a8a98F3495f6b5",
      aAAVEToken: "0xFFC97d72E13E01096502Cb8Eb52dEe56f74DAD7B",
      aWeth: "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e",
      aWbtc: "0x9ff58f4fFB29fA2266Ab25e75e2A8b3503311656",
      token: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
      stkAAVEToken: "0x4da27a545c0c5B758a6BA100e3a049001de870f5",
    },
    compound: {
      token: "0xc00e94cb662c3520282e6f5717214004a7f26888",
      cCompToken: "0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4",
      comptroller: "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b",
      cAAVEToken: "0xe65cdB6479BaC1e22340E4E755fAE7E509EcD06c",
      cEthToken: "0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5",
    },
    convex: {
      token: "0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b",
      rewardFactory: "0xEdCCB35798fae4925718A43cc608aE136208aa8D",
      cvxCrvToken: "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7",
      cvxRewardPool: "0xCF50b810E57Ac33B91dCF525C6ddd9881B139332",
      cvxCRVRewardPool: "0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e",
      crvToken: "0xD533a949740bb3306d119CC777fa900bA034cd52",
      threeCRV: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
    },
    onsen: {
      masterChef: "0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd",
      masterChefV2: "0xEF0881eC094552b2e128Cf945EF17a6752B4Ec5d",
      sushiToken: "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2",
      bitWethPid: 17,
      bitWethPair: "0xE12af1218b4e9272e9628D7c7Dc6354D137D024e",
      lidoWethPair: "0xC558F600B34A5f69dD2f0D06Cb8A88d829B7420a",
      lidoWethPid: 100,
    },
    ribbon: {
      rstEthCCVault: "0x53773E034d9784153471813dacAFF53dBBB78E8c",
      rstEthGauge: "0x4e079dCA26A4fE2586928c1319b20b1bf9f9be72",
      stEth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      minter: "0x5B0655F938A72052c46d2e94D206ccB6FF625A3A",
      rbn: "0x6123B0049F904d730dB3C36a31167D9d4121fA6B",
    },
    badger: {
      tree: "0x660802Fc641b154aBA66a62137e71f331B6d787A",
      bcvxVault: "0xfd05D3C7fe2924020620A8bE4961bBaA747e6305", //vested cvx
      graviAuraVault: "0xBA485b556399123261a5F9c95d413B4f93107407", //vested aura
    },
    ease: {
      timelock: "0xEA5edEf1401e8C312c797c27a9842e03Eb0e557a",
    },
    ribbon: {
      rstEthCCVault: "0x53773E034d9784153471813dacAFF53dBBB78E8c",
      rstEthGauge: "0x4e079dCA26A4fE2586928c1319b20b1bf9f9be72",
      stEth: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      minter: "0x5B0655F938A72052c46d2e94D206ccB6FF625A3A",
      rbn: "0x6123B0049F904d730dB3C36a31167D9d4121fA6B",
    },
    badger: {
      tree: "0x660802Fc641b154aBA66a62137e71f331B6d787A",
      bcvxVault: "0xfd05D3C7fe2924020620A8bE4961bBaA747e6305", //vested cvx
      graviAuraVault: "0xBA485b556399123261a5F9c95d413B4f93107407", //vested aura
    },
    ease: {
      timelock: "0xEA5edEf1401e8C312c797c27a9842e03Eb0e557a",
    },
  },
  accounts: {
    aAAVEWhale: "0x9080bdc6377e4ef9d51eddae526fb713c535041f",
    aaveWhale: "0x26a78D5b6d7a7acEEDD1e6eE3229b372A624d8b7",
    aWethWhale: "0x8aceab8167c80cb8b3de7fa6228b889bb1130ee8",
    aWbtcWhale: "0x602d9abd5671d24026e2ca473903ff2a9a957407",
    cvxWhale: "0x0aCA67Fa70B142A3b9bF2eD89A81B40ff85dACdC",
    cvxCRVWhale: "0xE4360E6e45F5b122586BCA3b9d7b222EA69C5568",
    cCompWhale: "0xa23CB68780be74b254a5f7210Ec6cF1c76289953",
    cEthWhale: "0xde55095aAC488dE3926463aeDf6A9B117F180260",
    compWhale: "0x0f50d31b3eaefd65236dd3736b863cffa4c63c4e",
    bitWethWhale: "0x54b55662901aF57B31fb6B52AF8175b652A5816e",
    lidoWethWhale: "0x0de288743f9759148a3e18220ef49815e889aad0",
    sushiWhale: "0xabea1a9b8b4a4534ae6b71041aa48067d84a3df3",
    stkAAVEWhale: "0xafdabfb6227507ff6522b8a242168f6b5f353a6e",
    rstEthWhale: "0xa452CAD482995d65Ee6e7149c2bb707C4A6087D7",
    stEthWhale: "0x2FAF487A4414Fe77e2327F0bf4AE2a264a776AD2",
    ethWhale: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    rstEthVaultKeeper: "0x55e4b3e3226444cd4de09778844453ba9fe9cd7c",
    bcvxWhale: "0x48d93dabf29aa5d86424a90ee60f419f1837649f",
    graviAuraWhale: "0xd14f076044414c255d2e82cceb1cb00fb1bba64c",
  },
};

export const TIME_IN_SECS: TimeInSecs = {
  year: 60 * 60 * 24 * 365,
  halfYear: 60 * 60 * 24 * 182.5,
  month: 60 * 60 * 24 * 30,
  week: 60 * 60 * 24 * 7,
  day: 60 * 60 * 24,
};
