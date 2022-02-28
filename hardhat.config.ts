import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "solidity-coverage";
import "@nomiclabs/hardhat-ethers";
import "hardhat-abi-exporter";

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
const RINKEBY_ACCOUNT_ONE = "765c64d0a64adc0eaa761d2839e5fc747cab445ebe3ff84594ad6f1c4ba36f4e";
const RINKEBY_ACCOUNT_TWO = "4fa830745751c589f293ff64667ab6c6887cfde9e4291c659d01844be7db80f8";
const RINKEBY_ACCOUNT_THREE = "582962dfd214d9b405f46b956d3b468d7691ac4675b0887a54330aa209763aab";
const RINKEBY_ACCOUNT_FOUR = "8b21d3fa24e560354e88e60125b7fe0c2cfb156ed70a092357e361300fc02a56";
// not real dun even think about it
const MAINNET_PRIVATE_KEY = "8b21d3fa24e560354e88e60125b7fe0c2cfb156ed70a092357e361300fc02a56";

let hardhatSettings: any = {
  gas: 10000000,
  accounts: {
    accountsBalance: "1000000000000000000000000",
  },
  allowUnlimitedContractSize: true,
  timeout: 1000000,
};

if (process.env.MAINNET_FORK) {
  hardhatSettings = {
    gas: 10000000,
    chainId: 1,
    accounts: {
      accountsBalance: "1000000000000000000000000",
    },
    forking: { url: "https://eth-mainnet.alchemyapi.io/v2/90dtUWHmLmwbYpvIeC53UpAICALKyoIu", blockNumber: 14186060 },
    allowUnlimitedContractSize: true,
    timeout: 6000000,
  };
}
export default {
  gasReporter: {
    enabled: true,
    currency: "USD",
    gasPrice: 100,
  },
  abiExporter: {
    path: "./abi",
    runOnCompile: true,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/2b73630f6f6f4eacbba6c76cdd511c23`,
      accounts: [
        `0x${RINKEBY_ACCOUNT_ONE}`,
        `0x${RINKEBY_ACCOUNT_TWO}`,
        `0x${RINKEBY_ACCOUNT_THREE}`,
        `0x${RINKEBY_ACCOUNT_FOUR}`,
      ],
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/2b73630f6f6f4eacbba6c76cdd511c23`,
      accounts: [`0x${MAINNET_PRIVATE_KEY}`],
      gasPrice: 100000000000,
    },
  },
  typechain: {
    outDir: "src/types",
    target: "ethers-v5",
  },
};
