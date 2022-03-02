import MerkleTree from "./merkle-tree";
import { BigNumber, utils } from "ethers";

export default class ClaimTree {
  private readonly tree: MerkleTree;
  constructor(claims: { user: string; hackId: BigNumber; claimAmount: BigNumber }[]) {
    this.tree = new MerkleTree(
      claims.map(({ user, hackId, claimAmount }) => {
        return ClaimTree.toNode(user, hackId, claimAmount);
      }),
    );
  }

  public static verifyProof(
    user: string,
    hackId: BigNumber,
    claimAmount: BigNumber,
    proof: Buffer[],
    root: Buffer,
  ): boolean {
    let pair = ClaimTree.toNode(user, hackId, claimAmount);
    for (const item of proof) {
      pair = MerkleTree.combinedHash(pair, item);
    }

    return pair.equals(root);
  }

  // keccak256(abi.encode(account, amount))
  public static toNode(user: string, hackId: BigNumber, claimAmount: BigNumber): Buffer {
    return Buffer.from(
      utils.solidityKeccak256(["address", "uint256", "uint256"], [user, hackId, claimAmount]).substr(2),
      "hex",
    );
  }

  public getHexRoot(): string {
    return this.tree.getHexRoot();
  }

  // returns the hex bytes32 values of the proof
  public getProof(user: string, hackId: BigNumber, claimAmount: BigNumber): string[] {
    return this.tree.getHexProof(ClaimTree.toNode(user, hackId, claimAmount));
  }
}
