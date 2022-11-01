import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-abi-exporter";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@tenderly/hardhat-tenderly";
import "hardhat-deploy";
import "hardhat-tracer";

import { resolve } from "path";

import { config as dotenvConfig } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import { NetworkUserConfig } from "hardhat/types";
import { getForkingBlockNumber } from "./env_helpers";

dotenvConfig({ path: resolve(__dirname, "./.env") });

// Ensure that we have all the environment variables we need.
const mnemonic: string | undefined = process.env.MNEMONIC;
if (!mnemonic) {
  throw new Error("Please set your MNEMONIC in a .env file");
}

const infuraApiKey: string | undefined = process.env.INFURA_API_KEY;
if (!infuraApiKey) {
  throw new Error("Please set your INFURA_API_KEY in a .env file");
}

// TODO: Replace below accounts with pnemonic
const accounts: string[] = [];
function populateAccounts() {
  let i = 1;
  while (process.env[`PRIVATE_KEY${i}`] !== undefined) {
    accounts.push(`0x${process.env[`PRIVATE_KEY${i}`] as string}`);
    i++;
  }
}

// fill accounts array
populateAccounts();

const chainIds = {
  arbitrumOne: 42161,
  avalanche: 43114,
  bsc: 56,
  goerli: 5,
  hardhat: 31337,
  kovan: 42,
  mainnet: 1,
  optimism: 10,
  polygon: 137,
  rinkeby: 4,
  ropsten: 3,
};

function getChainConfig(network: keyof typeof chainIds): NetworkUserConfig {
  const url: string = "https://" + network + ".infura.io/v3/" + infuraApiKey;
  return {
    accounts, // TODO: Change this to pnemonic
    chainId: chainIds[network],
    url,
  };
}

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  etherscan: {
    apiKey: {
      arbitrumOne: process.env.ARBSCAN_API_KEY as string,
      goerli: process.env.ETHERSCAN_API_KEY as string,
      kovan: process.env.ETHERSCAN_API_KEY as string,
      mainnet: process.env.ETHERSCAN_API_KEY as string,
      optimisticEthereum: process.env.OPTIMISM_API_KEY as string,
      polygon: process.env.POLYGONSCAN_API_KEY as string,
      rinkeby: process.env.ETHERSCAN_API_KEY as string,
      ropsten: process.env.ETHERSCAN_API_KEY as string,
    },
  },
  namedAccounts: {
    deployer0: 0,
    deployer1: 1,
    deployer2: 2,
    deployer3: 3,
    deployer4: 4,
    deployer5: 5,
    deployer6: 6,
    deployer7: 7,
    deployer8: 8,
    deployer9: 9,
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    gasPrice: 100,
    excludeContracts: [],
    src: "./contracts",
  },
  abiExporter: {
    path: "./data/abi",
    runOnCompile: true,
    clear: true,
    flat: true,
    spacing: 2,
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.MAINNET_URL_ALCHEMY as string,
        blockNumber: getForkingBlockNumber(),
        enabled: !!process.env.FORKING,
      },
      accounts: {
        mnemonic,
      },
      chainId: process.env.FORKING ? 1 : chainIds.hardhat,
    },
    arbitrumOne: getChainConfig("arbitrumOne"),
    mainnet: getChainConfig("mainnet"),
    optimism: getChainConfig("optimism"),
    rinkeby: getChainConfig("rinkeby"),
    goerli: getChainConfig("goerli"),
    tenderly: {
      url: process.env.TENDERLY_FORK || "",
      accounts: process.env.PRIVATE_KEY1
        ? [`0x${process.env.PRIVATE_KEY1}`, `0x${process.env.PRIVATE_KEY2}`, `0x${process.env.PRIVATE_KEY3}`]
        : [],
      chainId: 1,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.11",
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/solidity-template/issues/31
        bytecodeHash: "none",
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  typechain: {
    outDir: "src/types",
    target: "ethers-v5",
  },
};

export default config;
