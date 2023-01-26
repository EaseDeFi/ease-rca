import "@nomiclabs/hardhat-ethers";
import hre, { ethers } from "hardhat";
import axios from "axios";
import { IERC20, RcaController, RcaShieldBadger } from "../src/types";
import { EASE_ADDRESSES } from "../test/constants";
type PermitData = {
  chainId: string;
  user: string;
  vault: string;
  amount: string;
  nonce: string;
  expiry: number;
  signature: string;
  r: string;
  s: string;
  vInt: number;
};

type VaultData = {
  symbol: string;
  name: string;
  address: string;
  display_name: string;
  icon: string;
  info: string;
  info_link: string;
  decimals: number;
  token: {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
    apy: number;
    priceUSD: number;
    priceETH: string;
    priceETHonchain: string;
    assets: string;
  };
  reward_tokens: [];
  protocols: {
    yearn: string;
    compound: string;
    curve: string;
    balancer: string;
    notional: string;
    aave: string;
    kashi: string;
  };
  top_protocol: string;
  liquidation_amount: number;
  percent_reserved: number;
  protocol_type: string;
  type_link: string;
  remaining_capacity: number;
  remaining_capacity_usd: number;
  liquidation_proof: string[];
  liquidation_root: string;
  reserved_proof: string[];
  reserved_root: string;
  maxFee: number;
};

async function main() {
  const badgerShields = [
    {
      name: "Gravitationally Bound AURA Ease Vault",
      symbol: "ez-graviAURA",
      utoken: "0xBA485b556399123261a5F9c95d413B4f93107407",
      decimals: 18,
      shield: "0xea5edef169c8834ea5fa77a5323ac5eae1347bc8",
    },
    {
      name: "Badger Sett Aura BAL Ease Vault",
      symbol: "ez-bauraBAL",
      utoken: "0x37d9D2C6035b744849C15F1BFEE8F268a20fCBd8",
      decimals: 18,
      shield: "0xea5edef1169713c425ce57cf5c154d732b1b7af6",
    },
    {
      name: "Badger Sett 20WBTC-80BADGER Ease Vault",
      symbol: "ez-b20WBTC-80BADGER",
      utoken: "0x63ad745506BD6a3E57F764409A47ed004BEc40b1",
      decimals: 18,
      shield: "0xea5edef1eca9626f60af75efe70f6b1b0145218c",
    },
  ];

  const controller = <RcaController>await ethers.getContractAt("RcaController", EASE_ADDRESSES.rcas.controller);
  const signer = (await ethers.getSigners())[0];
  console.log(signer.address);
  const vaultsRes = await axios.get("https://api.ease.org/api/v1/vaults");
  const vaultsData = <VaultData[]>vaultsRes.data;
  for (let i = 0; i < badgerShields.length; i++) {
    const userAddress = signer.address;
    const shieldDetails = badgerShields[i];
    const badgerShield = <RcaShieldBadger>await ethers.getContractAt("RcaShieldBadger", shieldDetails.shield, signer);
    const uToken = <IERC20>await ethers.getContractAt("IERC20", shieldDetails.utoken);
    const amount = await uToken.balanceOf(userAddress);
    const chainId = await hre.network.config.chainId;
    const vault = shieldDetails.shield;
    const nonce = await controller.nonces(userAddress);
    const res = await axios.post("https://api.ease.org/api/v1/permits", {
      chainId: "31337",
      user: userAddress,
      vault: "0xea5eDEF15Ed93529BF513F5b0d9DfAB44495781a",
      amount: amount.toString(),
      nonce: nonce.toString(),
    });
    const permitData = <PermitData>res.data;
    const vaultData = vaultsData.find(v => v.address.toLowerCase() === shieldDetails.shield.toLowerCase());
    if (vaultData) {
      // Do something anon
      await badgerShield.mintTo(
        userAddress,
        badgerShield.address,
        amount,
        permitData.expiry,
        permitData.vInt,
        permitData.r,
        permitData.s,
        vaultData.liquidation_amount,
        vaultData.liquidation_proof,
      );
    } else {
      console.log(`vaults length: ${vaultsData.length}`);
      console.log(`Vault ${shieldDetails.name} with index ${i} not found`);
    }
  }
}
main().catch(err => {
  console.log(err);
  process.exit(1);
});
