import dotenv from "dotenv";
import { ethers } from "hardhat";
import { providers, BigNumber } from "ethers";
import { RcaController } from "../src/types/RcaController";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { RcaShield } from "../src/types/RcaShield";
import { MockERC20 } from "../src/types/MockERC20";
import { RcaShieldAave } from "../src/types/RcaShieldAave";
import { RcaShieldOnsen } from "../src/types/RcaShieldOnsen";
import { RcaShieldConvex } from "../src/types/RcaShieldConvex";
import { RcaShieldCompound } from "../src/types/RcaShieldCompound";
import { RcaShieldRibbon } from "../src/types/RcaShieldRibbon";

import { getForkingBlockNumber, getMainnetUrl, isMainnetFork } from "../env_helpers";
import { RcaShieldNormalized } from "../src/types/RcaShieldNormalized";

dotenv.config();

export function hexSized(str: string, length: number): string {
  const raw = Buffer.from(str).toString("hex");
  const pad = "0".repeat(length * 2 - raw.length);
  return "0x" + raw + pad;
}

export function hex(str: string): string {
  return "0x" + Buffer.from(str).toString("hex");
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fastForward(seconds: number) {
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

export function parseCToken(amount: string): BigNumber {
  return ethers.utils.parseUnits(amount, 8);
}

export function formatCToken(amount: BigNumber): string {
  return ethers.utils.formatUnits(amount, 8);
}

export async function mine() {
  const signers = await ethers.getSigners();
  const signer = signers[0];
  await (signer.provider as providers.JsonRpcProvider).send("evm_mine", []);
}

export async function resetBlockchain(blockNumber = 0) {
  const signer = (await ethers.getSigners())[0];
  const provider = signer.provider as providers.JsonRpcProvider;
  if (isMainnetFork()) {
    await provider.send("hardhat_reset", [
      {
        forking: {
          blockNumber: blockNumber || getForkingBlockNumber(),
          jsonRpcUrl: getMainnetUrl(),
        },
      },
    ]);
  } else {
    await (signer.provider as providers.JsonRpcProvider).send("hardhat_reset", []);
  }
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
type Shield =
  | RcaShield
  | RcaShieldAave
  | RcaShieldOnsen
  | RcaShieldConvex
  | RcaShieldCompound
  | RcaShieldRibbon
  | RcaShieldNormalized;

type UValueArgs = {
  newCumLiqForClaims: BigNumber;
  rcaAmountForUvalue: BigNumber;
  percentReserved: BigNumber;
  rcaShield: Shield;
  uToken: MockERC20;
};

export async function getExpectedUValue({
  newCumLiqForClaims,
  rcaAmountForUvalue,
  rcaShield,
  uToken,
  percentReserved,
}: UValueArgs): Promise<BigNumber> {
  let expectedUValue: BigNumber;
  const denominator = BigNumber.from(10000);
  const extraForSale = await rcaShield.getExtraForSale(newCumLiqForClaims);
  const amtForSale = await rcaShield.amtForSale();
  const totalForSale = amtForSale.add(extraForSale);
  const shieldUTokenBalance = (await uToken.balanceOf(rcaShield.address))
    .mul(BigNumber.from(10).pow(await rcaShield.decimals()))
    .div(BigNumber.from(10).pow(await uToken.decimals()));
  const pendingWithdrawal = await rcaShield.pendingWithdrawal();
  const subtrahend = totalForSale.add(pendingWithdrawal);
  const totalRcaTokenSupply = await rcaShield.totalSupply();

  expectedUValue = shieldUTokenBalance
    .sub(subtrahend)
    .mul(rcaAmountForUvalue)
    .div(totalRcaTokenSupply.add(pendingWithdrawal));
  if (totalRcaTokenSupply.isZero()) {
    expectedUValue = rcaAmountForUvalue;
  } else if (shieldUTokenBalance.lt(subtrahend)) {
    expectedUValue = BigNumber.from(0);
  }

  if (percentReserved.gt(BigNumber.from(0))) {
    expectedUValue = expectedUValue.sub(expectedUValue.mul(percentReserved).div(denominator));
  }
  return expectedUValue;
}
type RcaValueArgs = {
  uAmountForRcaValue: BigNumber;
  newCumLiqForClaims: BigNumber;
  rcaShield: Shield;
  uToken: MockERC20;
};

export async function getExpectedRcaValue({
  rcaShield,
  uAmountForRcaValue,
  uToken,
  newCumLiqForClaims,
}: RcaValueArgs): Promise<BigNumber> {
  let expectedRcaValue: BigNumber;
  const amountForSale = await rcaShield.amtForSale();
  const extraForSale = await rcaShield.getExtraForSale(newCumLiqForClaims);
  const totalForSale = amountForSale.add(extraForSale);
  const uTokenBuffer = BigNumber.from(10).pow(await uToken.decimals());
  const rcaBuffer = BigNumber.from(10).pow(await rcaShield.decimals());
  const shieldUTokenBalance = (await uToken.balanceOf(rcaShield.address)).mul(rcaBuffer).div(uTokenBuffer);
  const pendingWithdrawal = await rcaShield.pendingWithdrawal();
  const rcaTotalSupply = await rcaShield.totalSupply();
  const subtrahend = totalForSale.add(pendingWithdrawal);
  if (shieldUTokenBalance.isZero() || shieldUTokenBalance.lt(subtrahend)) {
    expectedRcaValue = uAmountForRcaValue;
  } else {
    expectedRcaValue = rcaTotalSupply
      .add(pendingWithdrawal)
      .mul(uAmountForRcaValue)
      .div(shieldUTokenBalance.sub(subtrahend));
  }
  const normalizingBuffer = rcaBuffer.div(uTokenBuffer);
  if (!normalizingBuffer.isZero()) {
    expectedRcaValue = expectedRcaValue.div(normalizingBuffer).mul(normalizingBuffer);
  }
  return expectedRcaValue;
}
