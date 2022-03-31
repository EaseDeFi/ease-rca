type RcaTokens = {
  yearn: RcaToken[];
  compound: RcaToken[];
  aave: RcaToken[];
  onsen: RcaToken[];
  convex: RcaToken[];
};
type RcaToken = {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  whale: string;
  shield: string;
  pid?: number;
};

export const rcaTokens: RcaTokens = {} as RcaTokens;
rcaTokens.yearn = [
  {
    name: "yvCurve-stETH Ease Vault",
    symbol: "ez-yvCurve-stETH",
    address: "0xdCD90C7f6324cfa40d7169ef80b12031770B4325",
    decimals: 18,
    whale: "0x577ebc5de943e35cdf9ecb5bbe1f7d7cb6c7c647",
    shield: "",
  },
  {
    name: "yvWETH Ease Vault",
    symbol: "ez-yvWETH",
    address: "0xa258C4606Ca8206D8aA700cE2143D7db854D168c",
    decimals: 18,
    whale: "0x53a393fbc352fad69baedefa46c4c1085bb6d707",
    shield: "",
  },
  {
    name: "yvUSDC Ease Vault",
    symbol: "ez-yvUSDC",
    address: "0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE",
    decimals: 6,
    whale: "0xdb91f52eefe537e5256b8043e5f7c7f44d81f5aa",
    shield: "",
  },
  {
    name: "yvDAI Ease Vault",
    symbol: "ez-yvDAI",
    address: "0xdA816459F1AB5631232FE5e97a05BBBb94970c95",
    decimals: 18,
    whale: "0x98aa6b78ed23f4ce2650da85604ced5653129a21",
    shield: "",
  },
  {
    name: "yvCurve-IronBank Ease Vault",
    symbol: "ez-yvCurve-IronBank",
    address: "0x27b7b1ad7288079A66d12350c828D3C00A6F07d7",
    decimals: 18,
    whale: "0xd6d16b110ea9173d7ceb6cfe8ca4060749a75f5c",
    shield: "",
  },
];
rcaTokens.compound = [
  {
    name: "cETH Ease Vault",
    symbol: "ez-cETH",
    address: "0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5",
    decimals: 8,
    whale: "0x716034c25d9fb4b38c837afe417b7f2b9af3e9ae",
    shield: "",
  },
  {
    name: "cDAI Ease Vault",
    symbol: "ez-cDAI",
    address: "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643",
    decimals: 8,
    whale: "0x30030383d959675ec884e7ec88f05ee0f186cc06",
    shield: "",
  },
  {
    name: "cUSDC Ease Vault",
    symbol: "ez-cUSDC",
    address: "0x39AA39c021dfbaE8faC545936693aC917d5E7563",
    decimals: 8,
    whale: "0x3ddfa8ec3052539b6c9549f12cea2c295cff5296",
    shield: "",
  },
  {
    name: "cWBTC Ease Vault",
    symbol: "ez-cWBTC",
    address: "0xC11b1268C1A384e55C48c2391d8d480264A3A7F4",
    decimals: 8,
    whale: "0x2c21fa2903d4f8839e8fd6b041c2adf19dbf6540",
    shield: "",
  },
  {
    name: "cUSDT Ease Vault",
    symbol: "ez-cUSDT",
    address: "0xf650C3d88D12dB855b8bf7D11Be6C55A4e07dCC9",
    decimals: 8,
    whale: "0x3ddfa8ec3052539b6c9549f12cea2c295cff5296",
    shield: "",
  },
];
rcaTokens.aave = [
  {
    name: "aWETH Ease Vault",
    symbol: "ez-aWETH",
    address: "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e",
    decimals: 18,
    whale: "0x3ddfa8ec3052539b6c9549f12cea2c295cff5296",
    shield: "",
  },
  {
    name: "aUSDC Ease Vault",
    symbol: "ez-aUSDC",
    address: "0xBcca60bB61934080951369a648Fb03DF4F96263C",
    decimals: 6,
    whale: "0x3ddfa8ec3052539b6c9549f12cea2c295cff5296",
    shield: "",
  },
  {
    name: "aDAI Ease Vault",
    symbol: "ez-aDAI",
    address: "0x028171bCA77440897B824Ca71D1c56caC55b68A3",
    decimals: 18,
    whale: "0x2e0929bd71c21cfc66dce799b132f979ff8db7a0",
    shield: "",
  },
  {
    name: "aWBTC Ease Vault",
    symbol: "ez-aWBTC",
    address: "0x9ff58f4fFB29fA2266Ab25e75e2A8b3503311656",
    decimals: 8,
    whale: "0x602d9abd5671d24026e2ca473903ff2a9a957407",
    shield: "",
  },
  {
    name: "aUSDT Ease Vault",
    symbol: "ez-aUSDT",
    address: "0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811",
    decimals: 6,
    whale: "0x3ddfa8ec3052539b6c9549f12cea2c295cff5296",
    shield: "",
  },
];
rcaTokens.onsen = [
  {
    name: "USDC-WETH SLP Ease Vault",
    symbol: "ez-SLP-USDC-WETH",
    address: "0x397FF1542f962076d0BFE58eA045FfA2d347ACa0",
    decimals: 18,
    whale: "0x5c00977a2002a3C9925dFDfb6815765F578a804f",
    shield: "",
    pid: 1,
  }, // Cannot send more than 1 of this one
  {
    name: "TOKE-WETH SLP Ease Vault",
    symbol: "ez-SLP-TOKE-WETH",
    address: "0xd4e7a6e2D03e4e48DfC27dd3f46DF1c176647E38",
    decimals: 18,
    whale: "0xbd445883d29a1631c8a69d1f26537f4f551d7763",
    shield: "",
  },
  {
    name: "WBTC-WETH SLP Ease Vault",
    symbol: "ez-SLP-WBTC-WETH",
    address: "0xCEfF51756c56CeFFCA006cD410B03FFC46dd3a58",
    decimals: 18,
    whale: "0x0489076A0D17394835aF93cd62ACFf703B6814a9",
    shield: "",
    pid: 21,
  }, // Can't send more than 0.001
  {
    name: "BIT-WETH SLP Ease Vault",
    symbol: "ez-SLP-BIT-WETH",
    address: "0xE12af1218b4e9272e9628D7c7Dc6354D137D024e",
    decimals: 18,
    whale: "0x54b55662901aF57B31fb6B52AF8175b652A5816e",
    shield: "",
    pid: 17,
  },
  {
    name: "DAI-WETH SLP Ease Vault",
    symbol: "ez-SLP-DAI-WETH",
    address: "0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f",
    decimals: 18,
    whale: "0x647481c033a4a2e816175ce115a0804adf793891",
    shield: "",
    pid: 2,
  },
];

rcaTokens.convex = [
  {
    name: "cvxFXS Ease Vault",
    symbol: "ez-cvxFXS",
    address: "0xFEEf77d3f69374f66429C91d732A244f074bdf74",
    decimals: 18,
    whale: "0x5028D77B91a3754fb38B2FBB726AF02d1FE44Db6",
    shield: "",
  },
  {
    name: "cvxsteCRV Ease Vault",
    symbol: "ez-cvxsteCRV",
    address: "0x9518c9063eB0262D791f38d8d6Eb0aca33c63ed0",
    decimals: 18,
    whale: "0x0a760466e1b4621579a82a39cb56dda2f4e70f03",
    shield: "",
  },
  {
    name: "cvxUST_whv23CRV-f Ease Vault",
    symbol: "ez-cvxUST_whv23CRV-f",
    address: "0x2d2006135e682984a8a2eB74F5C87c2251cC71E9",
    decimals: 18,
    whale: "0x7e2b9b5244bcfa5108a76d5e7b507cfd5581ad4a",
    shield: "",
  },
  {
    name: "cvxMIM-3LP3CRV-f Ease Vault",
    symbol: "ez-cvxMIM-3LP3CRV-f",
    address: "0xabB54222c2b77158CC975a2b715a3d703c256F05",
    decimals: 18,
    whale: "0xfd5abf66b003881b88567eb9ed9c651f14dc4771",
    shield: "",
  },
  {
    name: "cvxcrv3crypto Ease Vault",
    symbol: "ez-cvxcrv3crypto",
    address: "0x903C9974aAA431A765e60bC07aF45f0A1B3b61fb",
    decimals: 18,
    whale: "0x9d5c5e364d81dab193b72db9e9be9d8ee669b652",
    shield: "",
  },
];
