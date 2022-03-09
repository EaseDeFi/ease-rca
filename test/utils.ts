import { ethers } from "hardhat";
import { providers, Contract, Signer, BigNumber } from "ethers";
import { RcaController } from "../src/types/RcaController";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

export function hexSized(str: string, length: number): string {
  const raw = Buffer.from(str).toString("hex");
  const pad = "0".repeat(length * 2 - raw.length);
  return "0x" + raw + pad;
}

export function hex(str: string): string {
  return "0x" + Buffer.from(str).toString("hex");
}

export function sleep(ms: number) {
  new Promise(resolve => setTimeout(resolve, ms));
}

export async function increase(seconds: number) {
  const signers = await ethers.getSigners();
  const signer = signers[0];
  await (signer.provider as providers.JsonRpcProvider).send("evm_increaseTime", [seconds]);
}

export async function getTimestamp(): Promise<BigNumber> {
  const signers = await ethers.getSigners();
  const signer = signers[0];
  const res = await (signer.provider as providers.JsonRpcProvider).send("eth_getBlockByNumber", ["latest", false]);
  return BigNumber.from(res.timestamp);
}

export function ether(amount: string): BigNumber {
  return ethers.utils.parseEther(amount);
}

export async function mine() {
  const signers = await ethers.getSigners();
  const signer = signers[0];
  await (signer.provider as providers.JsonRpcProvider).send("evm_mine", []);
}
export function formatEther(amount: BigNumber): string {
  return ethers.utils.formatEther(amount);
}

type SignatureArgs = {
  controller: RcaController;
  capOracle: SignerWithAddress;
  userAddress: string;
  amount: BigNumber;
  shieldAddress: string;
};
type SignedDetails = {
  expiry: BigNumber;
  vInt: BigNumber;
  r: string;
  s: string;
};

export async function getSignatureDetailsFromCapOracle({
  amount,
  capOracle,
  controller,
  userAddress,
  shieldAddress,
}: SignatureArgs): Promise<SignedDetails> {
  const nonce = await controller.nonces(userAddress);
  const timestamp = await getTimestamp();
  const expiry = timestamp.add(300);
  const hash = await controller.getMessageHash(userAddress, shieldAddress, amount, nonce, expiry);
  const signature = await capOracle.signMessage(ethers.utils.arrayify(hash));

  const v = signature.substring(130, signature.length);
  const r = "0x" + signature.substring(2, 66);
  const s = "0x" + signature.substring(66, 130);
  const vInt = BigNumber.from(parseInt(v, 16));

  return { vInt, r, s, expiry };
}
