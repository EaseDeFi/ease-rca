import "@nomiclabs/hardhat-ethers";
import hre from "hardhat";
import "hardhat-deploy";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { rcaTokens } from "../scripts/vaultDetails";
import { EASE_ADDRESSES, MAINNET_ADDRESSES } from "../test/constants";

const deployBadgerShield: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    getNamedAccounts,
    deployments: { deploy },
  } = hre;
  const { deployer0, deployer1, deployer2 } = await getNamedAccounts();
  const deployers = [deployer0, deployer1, deployer2];

  const badgerVaultDetails = rcaTokens.badger;
  for (let i = 0; i < badgerVaultDetails.length; i++) {
    console.log("Deploying Badger Shield....");
    const details = badgerVaultDetails[i];
    const deployer = deployers[i];

    const badgerShield = await deploy("RcaShieldBadger", {
      args: [
        details.name,
        details.symbol,
        details.address,
        details.decimals,
        MAINNET_ADDRESSES.contracts.ease.timelock,
        EASE_ADDRESSES.rcas.controller,
        details.balanceTree,
      ],
      from: deployer,
      log: true,
    });

    console.log(`${details.name} Shield Deployed at ${badgerShield.address}`);

    if (["mainnet", "goerli"].includes(hre.network.name)) {
      // verify etherscan
      console.log(`Verifying ${details.symbol} shield....`);
      try {
        await hre.run("verify:verify", {
          address: details.shield,
          constructorArguments: [
            details.name,
            details.symbol,
            details.address,
            details.decimals,
            MAINNET_ADDRESSES.contracts.ease.timelock,
            EASE_ADDRESSES.rcas.controller,
            details.balanceTree,
          ],
        });
        console.log(`${details.symbol} shield verified!`);
      } catch {
        console.log("Couldn't verify the contract!");
      }
    }
  }
};

export default deployBadgerShield;

if (typeof require !== "undefined" && require.main === module) {
  deployBadgerShield(hre);
}
