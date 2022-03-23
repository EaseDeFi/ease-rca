import { MainnetAddresses, TimeInSecs } from "./types";

export const MAINNET_ADDRESSES: MainnetAddresses = {
  contracts: {
    aave: {
      incentivesController: "0xd784927Ff2f95ba542BfC824c8a8a98F3495f6b5",
      aAAVEToken: "0xFFC97d72E13E01096502Cb8Eb52dEe56f74DAD7B",
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
      masterChefV2: "0xEF0881eC094552b2e128Cf945EF17a6752B4Ec5d",
      sushiToken: "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2",
      bitWethPid: 17,
      bitWethPair: "0xE12af1218b4e9272e9628D7c7Dc6354D137D024e",
    },
  },
  accounts: {
    aAAVEWhale: "0x9080bdc6377e4ef9d51eddae526fb713c535041f",
    aaveWhale: "0x26a78D5b6d7a7acEEDD1e6eE3229b372A624d8b7",
    cvxWhale: "0x0aCA67Fa70B142A3b9bF2eD89A81B40ff85dACdC",
    cvxCRVWhale: "0xE4360E6e45F5b122586BCA3b9d7b222EA69C5568",
    cCompWhale: "0xa23CB68780be74b254a5f7210Ec6cF1c76289953",
    cEthWhale: "0xde55095aAC488dE3926463aeDf6A9B117F180260",
    compWhale: "0x0f50d31b3eaefd65236dd3736b863cffa4c63c4e",
    bitWethWhale: "0x54b55662901aF57B31fb6B52AF8175b652A5816e",
    sushiWhale: "0xabea1a9b8b4a4534ae6b71041aa48067d84a3df3",

  },
};

export const TIME_IN_SECS: TimeInSecs = {
  year: 60 * 60 * 24 * 365,
  halfYear: 60 * 60 * 24 * 182.5,
  month: 60 * 60 * 24 * 30,
  day: 60 * 60 * 24,
};
