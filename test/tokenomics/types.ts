import type { TokenSwap } from "../../src/types/TokenSwap";
import type { IERC20 } from "../../src/types/IERC20";
import { EaseToken } from "../../src/types/EaseToken";

export type Contracts = {
  easeToken: EaseToken;
  armorToken: IERC20;
  tokenSwap: TokenSwap;
};
