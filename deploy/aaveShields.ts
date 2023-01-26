import "@nomiclabs/hardhat-ethers";
import hre, { ethers } from "hardhat";
import "hardhat-deploy";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { rcaTokens } from "../scripts/vaultDetails";
import { EASE_ADDRESSES, MAINNET_ADDRESSES } from "../test/constants";
import { BigNumber } from "ethers";

const INCENTIVES_CONTROLLER = "0xd784927Ff2f95ba542BfC824c8a8a98F3495f6b5";

const deployAaveShield: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    getNamedAccounts,
    deployments: { deploy },
  } = hre;
  const { deployer1, deployer2 } = await getNamedAccounts();
  const deployers = [deployer1, deployer2];
  console.log(deployers);

  console.log(`Balance of deployer1 : ${await ethers.provider.getBalance(deployer1)} ${deployer1}`);
  console.log(`Balance of deployer2 : ${await ethers.provider.getBalance(deployer2)} ${deployer2}`);

  //   aUSDC & aUSDT
  const aaveVaultDetails = [rcaTokens.aave[1], rcaTokens.aave[4]];
  console.log("Deploying aave Shield....");
  for (let i = 0; i < aaveVaultDetails.length; i++) {
    const gasPrice = (await ethers.provider.getFeeData()).gasPrice?.mul(11).div(10);
    console.log(gasPrice);
    const details = aaveVaultDetails[i];
    const deployer = deployers[i];

    console.log(details);

    const aaveShield = await deploy("RcaShieldAave", {
      args: [
        details.name,
        details.symbol,
        details.address,
        details.decimals,
        MAINNET_ADDRESSES.contracts.ease.timelock,
        EASE_ADDRESSES.rcas.controller,
        INCENTIVES_CONTROLLER,
      ],
      from: deployer,
      log: true,
      gasPrice: gasPrice || BigNumber.from(18062463401),
    });

    console.log(`${details.name} Shield Deployed at ${aaveShield.address}`);

    if (["mainnet", "goerli"].includes(hre.network.name)) {
      // verify etherscan
      console.log(`Verifying ${details.symbol} shield....`);
      try {
        await hre.run("verify:verify", {
          address: aaveShield.address,
          constructorArguments: [
            details.name,
            details.symbol,
            details.address,
            details.decimals,
            MAINNET_ADDRESSES.contracts.ease.timelock,
            EASE_ADDRESSES.rcas.controller,
            INCENTIVES_CONTROLLER,
          ],
        });
        console.log(`${details.symbol} shield verified!`);
      } catch {
        console.log("Couldn't verify the contract!");
      }
    }
  }
};

export default deployAaveShield;

if (typeof require !== "undefined" && require.main === module) {
  deployAaveShield(hre);
}
