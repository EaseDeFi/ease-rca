import { ethers } from "hardhat";
async function main() {
  const WALLETS = ["0x5DCe61564b7bbe8942C5B42bd4E2CDDb1E6BA6f1", "0x8aAFD344A7F3257C492e124579F729634c8ed1c2"];
  const amount = ethers.utils.parseEther("10");
  console.log("Setting balance");
  await ethers.provider.send("tenderly_setBalance", [
    WALLETS,
    //amount in wei will be set for all wallets
    ethers.utils.hexValue(amount.toHexString()),
  ]);
  console.log("Balance set successfully!");
}

main().catch(err => {
  console.log(err);
  process.exit(1);
});
