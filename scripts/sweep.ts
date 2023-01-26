import "@nomiclabs/hardhat-ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

async function main() {
  const funder = "0x0204909194588909ea98244b9d5a2d074a3abdf2";
  const signers = await ethers.getSigners();
  for (let i = 1; i < 3; i++) {
    // Get the current balance
    const signer = signers[i];
    console.log(`Sweeping balance form ${signer.address}`);

    const balance = await signer.getBalance();

    // Normally we would let the Wallet populate this for us, but we
    // need to compute EXACTLY how much value to send
    const gasPrice = (await ethers.provider.getGasPrice()).add(parseUnits("1", 9));

    // The exact cost (in gas) to send to an Externally Owned Account (EOA)
    const gasLimit = 21000;

    // The balance less exactly the txfee in wei
    const value = balance.sub(gasPrice.mul(gasLimit));

    const tx = await signer.sendTransaction({ to: funder, value });

    await tx.wait();
    console.log(`Balance of ${signer.address} sweeped successfully!`);
  }
}

main();
