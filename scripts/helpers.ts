import { ethers } from "hardhat";
import { IMasterChef } from "../src/types";
import { MAINNET_ADDRESSES } from "../test/constants";

type PidAndVersion = {
  version: string;
  pid: number;
};

export async function getSushiPoolId(address: string): Promise<PidAndVersion> {
  const poolDetails: {
    version: string;
    pid: number;
  } = {
    version: "",
    pid: 100000, // Not possible to have PID this high
  };
  const masterChef = <IMasterChef>(
    await ethers.getContractAt("IMasterChef", MAINNET_ADDRESSES.contracts.onsen.masterChef)
  );
  const masterChefV2 = <IMasterChef>(
    await ethers.getContractAt("IMasterChef", MAINNET_ADDRESSES.contracts.onsen.masterChefV2)
  );

  const v1Length = (await masterChef.poolLength()).toNumber();
  const v2Length = (await masterChefV2.poolLength()).toNumber();
  console.log("Checking MasterChef V1 for pool");
  for (let i = 0; i < v1Length; i++) {
    const poolInfo = await masterChef.poolInfo(i);
    if (poolInfo.lpToken.toLowerCase() === address.toLowerCase()) {
      poolDetails.pid = i;
      poolDetails.version = "V1";
      break;
    }
  }
  if (poolDetails.version === "") {
    console.log("Checking MasterChef V2 for pool");
    for (let i = 0; i < v2Length; i++) {
      const poolAddress = await masterChefV2.lpToken(i);
      if (poolAddress.toLowerCase() === address.toLowerCase()) {
        poolDetails.pid = i;
        poolDetails.version = "V2";
        break;
      }
    }
  }
  return poolDetails;
}
