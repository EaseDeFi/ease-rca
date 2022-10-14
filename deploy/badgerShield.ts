import hre, { ethers } from "hardhat";
import "hardhat-deploy";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { MAINNET_ADDRESSES } from "../test/constants";
import { sleep } from "../test/utils";

const deployBadgerShield: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    getNamedAccounts,
    deployments: { deploy },
  } = hre;
  const { deployer0 } = await getNamedAccounts();

  const rcaControllerAddress = ethers.constants.AddressZero;

  const details = {
    name: "graviAura Ease Vault",
    symbol: "ez-graviAura",
    address: MAINNET_ADDRESSES.contracts.badger.graviAuraVault,
    decimals: 18,
  };
  console.log("Deploying Badger Shield....");

  const badgerShield = await deploy("RcaShieldBadger", {
    args: [
      details.name,
      details.symbol,
      details.address,
      details.decimals,
      MAINNET_ADDRESSES.contracts.ease.timelock,
      rcaControllerAddress,
      MAINNET_ADDRESSES.contracts.badger.tree,
    ],
    from: deployer0,
    log: true,
  });

  console.log(`Badger Shield Deployed to ${badgerShield.address}`);

  if (["mainnet", "goerli"].includes(hre.network.name)) {
    // wait for few seconds for etherscan
    await sleep(10000);
    // verify etherscan
    console.log("Verifying contract....");
    await hre.run("verify:verify", {
      address: badgerShield.address,
      constructorArguments: [
        details.name,
        details.symbol,
        details.address,
        details.decimals,
        MAINNET_ADDRESSES.contracts.ease.timelock,
        rcaControllerAddress,
        MAINNET_ADDRESSES.contracts.badger.tree,
      ],
    });
    console.log("Contract Verified!");
  }
};

export default deployBadgerShield;

if (typeof require !== "undefined" && require.main === module) {
  deployBadgerShield(hre);
}
