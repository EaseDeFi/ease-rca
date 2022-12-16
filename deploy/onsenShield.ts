import "@nomiclabs/hardhat-ethers";
import hre, { ethers } from "hardhat";
import "hardhat-deploy";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { rcaTokens } from "../scripts/vaultDetails";
import { EASE_ADDRESSES, MAINNET_ADDRESSES } from "../test/constants";

const deployOnsenShield: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    getNamedAccounts,
    deployments: { deploy },
  } = hre;
  const { deployer0, deployer1, deployer2 } = await getNamedAccounts();
  const deployers = [deployer1, deployer2];

  console.log(`Balance of deployer1 : ${await ethers.provider.getBalance(deployer1)} ${deployer1}`);
  console.log(`Balance of deployer2 : ${await ethers.provider.getBalance(deployer2)} ${deployer2}`);
  console.log(`Balance of deployer0 : ${await ethers.provider.getBalance(deployer0)} ${deployer0}`);

  const onsenVaultDetails = rcaTokens.onsen.slice(0, 2);
  console.log("Deploying Onsen Shield....");
  for (let i = 0; i < onsenVaultDetails.length; i++) {
    const details = onsenVaultDetails[i];
    const deployer = deployers[i];

    console.log(details);

    const onsenShield = await deploy("RcaShieldOnsen", {
      args: [
        details.name,
        details.symbol,
        details.address,
        details.decimals,
        MAINNET_ADDRESSES.contracts.ease.timelock,
        EASE_ADDRESSES.rcas.controller,
        details.rewardPool || "",
        details.pid || 0,
      ],
      from: deployer,
      log: true,
    });

    console.log(`${details.name} Shield Deployed at ${onsenShield.address}`);

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
            details.rewardPool || "",
            details.pid || 0,
          ],
        });
        console.log(`${details.symbol} shield verified!`);
      } catch {
        console.log("Couldn't verify the contract!");
      }
    }
  }
};

export default deployOnsenShield;

if (typeof require !== "undefined" && require.main === module) {
  deployOnsenShield(hre);
}
