import MerkleTree from "./merkle-tree";
import { BigNumber, utils } from "ethers";
import { RewardNode } from "./types";

export default class RewardTree {
  private readonly tree: MerkleTree;
  constructor(rewards: RewardNode[]) {
    this.tree = new MerkleTree(
      rewards.map(({ index, user, cycle, tokens, cumulativeAmounts }) => {
        return RewardTree.toNode(index, user, cycle, tokens, cumulativeAmounts);
      }),
    );
  }

  public static verifyProof(
    index: BigNumber,
    user: string,
    cycle: BigNumber,
    tokens: string[],
    cumulativeAmounts: BigNumber[],
    proof: Buffer[],
    root: Buffer,
  ): boolean {
    let pair = RewardTree.toNode(index, user, cycle, tokens, cumulativeAmounts);
    for (const item of proof) {
      pair = MerkleTree.combinedHash(pair, item);
    }
    return pair.equals(root);
  }

  // keccak256(abi.encode(index,msg.sender,cycle,tokens,cumulativeAmounts))
  public static toNode(
    index: BigNumber,
    user: string,
    cycle: BigNumber,
    tokens: string[],
    cumulativeAmounts: BigNumber[],
  ): Buffer {
    return Buffer.from(
      utils
        .keccak256(
          utils.defaultAbiCoder.encode(
            ["uint256", "address", "uint256", "address[]", "uint256[]"],
            [index, user, cycle, tokens, cumulativeAmounts],
          ),
        )
        .substring(2),
      "hex",
    );
  }

  public getHexRoot(): string {
    return this.tree.getHexRoot();
  }

  // returns the hex bytes32 values of the proof
  public getProof(
    index: BigNumber,
    user: string,
    cycle: BigNumber,
    tokens: string[],
    cumulativeAmounts: BigNumber[],
  ): string[] {
    return this.tree.getHexProof(RewardTree.toNode(index, user, cycle, tokens, cumulativeAmounts));
  }
}
