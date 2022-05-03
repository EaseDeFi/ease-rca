import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import hre, { ethers } from "hardhat";
import { BigNumber } from "ethers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { parseUnits } from "ethers/lib/utils";

import BalanceTree from "../balance-tree";
import {
  ether,
  getExpectedCTokens,
  getExpectedRcaValue,
  getExpectUTokenForCTokens,
  getSignatureDetailsFromCapOracle,
  getTimestamp,
  increase,
  resetBlockchain,
} from "../utils";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "../constants";
import type { Contracts, MerkleProofs, MerkleTrees, Routers, Signers } from "../types";

import type { RcaShieldCompound } from "../../src/types/RcaShieldCompound";
import type { MockERC20 } from "../../src/types/MockERC20";
import type { RcaController } from "../../src/types/RcaController";
import type { RcaTreasury } from "../../src/types/RcaTreasury";
import type { CompoundRouter } from "../../src/types/CompoundRouter";
import type { ICToken } from "../../src/types/ICToken";

// Factories
import type { RcaShieldCompound__factory } from "../../src/types/factories/RcaShieldCompound__factory";
import type { RcaController__factory } from "../../src/types/factories/RcaController__factory";
import type { RcaTreasury__factory } from "../../src/types/factories/RcaTreasury__factory";
import type { CompoundRouter__factory } from "../../src/types/factories/CompoundRouter__factory";
import { IWETH } from "../../src/types/IWETH";
import { IUniswapV2Router02 } from "../../src/types/IUniswapV2Router02";

// SHIELD UNDERLYING CONSTANTS
let uTokenAddress: string;
let uTokenWhaleAddress: string;
let baseTokenAddress: string;
let uTokenDecimals: number;
const ADDRESS_ZERO = ethers.constants.AddressZero;

describe("CompoundRouter:cUSDC", function () {
  const signers = {} as Signers;
  const contracts = {} as Contracts;
  const merkleTrees = {} as MerkleTrees;
  const merkleProofs = {} as MerkleProofs;
  // make routers empty objects so that they won't be undefined
  contracts.routers = {} as Routers;
  //  local tokens
  //  local tokens
  let baseToken: MockERC20;
  let weth: IWETH;
  let cToken: ICToken;
  let uniswapRouterV2: IUniswapV2Router02;
  before(async function () {
    await resetBlockchain();
    // UPDATE SHIELD UNDERLYING CONSTANTS
    uTokenAddress = MAINNET_ADDRESSES.contracts.compound.cUSDCToken;
    uTokenWhaleAddress = MAINNET_ADDRESSES.accounts.cUSDCWhale;
    baseTokenAddress = MAINNET_ADDRESSES.tokens.usdc;
  });
  before(async function () {
    await resetBlockchain();
  });

  beforeEach(async function () {
    const _signers: SignerWithAddress[] = await ethers.getSigners();
    signers.user = _signers[0];
    signers.gov = _signers[1];
    signers.notGov = _signers[2];
    signers.guardian = _signers[3];
    signers.priceOracle = _signers[4];
    signers.capOracle = _signers[5];
    signers.referrer = _signers[6];
    signers.otherAccounts = _signers.slice(7);
    await hre.network.provider.send("hardhat_impersonateAccount", [uTokenWhaleAddress]);
    signers.user = await ethers.getSigner(uTokenWhaleAddress);

    // transfer eth to impersonated accounts for enough eth to cover gas
    await signers.otherAccounts[0].sendTransaction({ to: signers.user.address, value: ether("1000") });

    // load mainnet contracts
    contracts.uToken = <MockERC20>await ethers.getContractAt("MockERC20", uTokenAddress);
    cToken = <ICToken>await ethers.getContractAt("ICToken", uTokenAddress);
    // initialize uToken decimals
    uTokenDecimals = await contracts.uToken.decimals();

    baseToken = <MockERC20>await ethers.getContractAt("MockERC20", baseTokenAddress);
    weth = <IWETH>await ethers.getContractAt("IWETH", MAINNET_ADDRESSES.tokens.weth);
    uniswapRouterV2 = <IUniswapV2Router02>(
      await ethers.getContractAt("IUniswapV2Router02", MAINNET_ADDRESSES.contracts.uniswap.routerV2)
    );

    const rcaShieldCompoundFactory = <RcaShieldCompound__factory>await ethers.getContractFactory("RcaShieldCompound");
    const rcaControllerFactory = <RcaController__factory>await ethers.getContractFactory("RcaController");
    const rcaTreasuryFactory = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");
    const compoundRouterFactory = <CompoundRouter__factory>await ethers.getContractFactory("CompoundRouter");

    contracts.rcaTreasury = <RcaTreasury>await rcaTreasuryFactory.deploy(signers.gov.address);
    // Wait for contract to get deployed
    await contracts.rcaTreasury.deployed();

    contracts.rcaController = <RcaController>(
      await rcaControllerFactory.deploy(
        signers.gov.address,
        signers.guardian.address,
        signers.priceOracle.address,
        signers.capOracle.address,
        0,
        0,
        TIME_IN_SECS.day,
        contracts.rcaTreasury.address,
      )
    );
    // Wait for contract to get deployed
    await contracts.rcaController.deployed();

    contracts.rcaShieldCompound = <RcaShieldCompound>(
      await rcaShieldCompoundFactory.deploy(
        "rcaComp Shield",
        "rcaComp",
        contracts.uToken.address,
        await contracts.uToken.decimals(),
        signers.gov.address,
        contracts.rcaController.address,
        MAINNET_ADDRESSES.contracts.compound.comptroller,
      )
    );
    // Wait for contract to get deployed
    await contracts.rcaShieldCompound.deployed();

    // initialize compound shield
    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldCompound.address);

    // deploy compound router
    uTokenDecimals = await contracts.uToken.decimals();
    contracts.routers.compoundRouter = <CompoundRouter>(
      await compoundRouterFactory.deploy(MAINNET_ADDRESSES.contracts.uniswap.routerV2)
    );
    await contracts.routers.compoundRouter.deployed();
    // TODO: whitelist router
    const routerAddress = contracts.routers.compoundRouter.address;

    await contracts.rcaController.connect(signers.guardian).setRouterVerified(routerAddress, true);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldCompound.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);

    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShieldCompound.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
    ]);
    // merkleProofs
    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldCompound.address, ether("100"));
    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());

    // allowance
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldCompound.address, ether("10000000"));
  });

  describe("zapIn()", function () {
    it("should allow the user to zap in with eth", async function () {
      //   mint RCA and check for shields uToken balance
      const userAddress = signers.user.address;
      const baseTokenDecimals = await baseToken.decimals();
      // base token(i.e usdc) amount that is expected in uniswap token swap
      const baseTokenAmountOut = parseUnits("1000", baseTokenDecimals);

      const expectedCTokens = await getExpectedCTokens(cToken, baseTokenAmountOut, baseTokenDecimals);
      const uTokenDecimals = await contracts.uToken.decimals();
      const uAmountForShield = expectedCTokens
        .mul(BigNumber.from(10).pow(18))
        .div(BigNumber.from(10).pow(uTokenDecimals));
      // returns: expiry, vInt, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmountForShield,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldCompound.address,
      });
      const expectedRcaValue = await getExpectedRcaValue({
        rcaShield: contracts.rcaShieldCompound,
        uToken: contracts.uToken,
        uAmountForRcaValue: uAmountForShield,
        newCumLiqForClaims: BigNumber.from(0),
      });
      // Shield args
      const shieldAddress = contracts.rcaShieldCompound.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];
      // SwapIn args
      const shouldSwap = true;
      const tokenOut = baseToken.address;
      const swapInArgs = [shouldSwap, tokenOut, baseTokenAmountOut, sigValues.expiry];
      const mintToArgs = [
        userAddress,
        signers.referrer.address,
        expectedRcaValue,
        sigValues.expiry,
        sigValues.vInt,
        sigValues.r,
        sigValues.s,
        0,
        merkleProofs.liqProof1,
      ];

      const userRcaBalBefore = await contracts.rcaShieldCompound.balanceOf(userAddress);
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        [
          "tuple(address, address, address)", // shieldArgs(shieldAddress, uToken, baseToken)
          "tuple(bool, address, uint256, uint256)", // swapArgs(shouldSwap, amountOut)
          "tuple(address, address, uint256, uint256, uint8, bytes32, bytes32, uint256, bytes32[])", // mintToArgs
        ],
        [shieldArgs, swapInArgs, mintToArgs],
      );
      // amount of ethers required to buy base token
      const amtEthToZap = (await uniswapRouterV2.getAmountsIn(baseTokenAmountOut, [weth.address, baseTokenAddress]))[0];

      await contracts.routers.compoundRouter.connect(signers.user).zapIn(zapArgs, { value: amtEthToZap });

      const userRcaBalAfter = await contracts.rcaShieldCompound.balanceOf(userAddress);

      expect(userRcaBalAfter.sub(userRcaBalBefore)).to.be.equal(expectedRcaValue);
    });

    it("should allow the user to zap in with baseToken", async function () {
      //   mint RCA and check for shields uToken balance
      const userAddress = signers.user.address;
      const baseTokenDecimals = await baseToken.decimals();
      // base token(i.e usdc) amount that is expected in uniswap token swap
      const baseTokenAmountOut = parseUnits("1000", baseTokenDecimals);
      // approve usdc to router
      await baseToken.connect(signers.user).approve(contracts.routers.compoundRouter.address, baseTokenAmountOut);
      const expectedCTokens = await getExpectedCTokens(cToken, baseTokenAmountOut, baseTokenDecimals);
      const uTokenDecimals = await contracts.uToken.decimals();
      const uAmountForShield = expectedCTokens
        .mul(BigNumber.from(10).pow(18))
        .div(BigNumber.from(10).pow(uTokenDecimals));
      // returns: expiry, vInt, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmountForShield,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldCompound.address,
      });
      const expectedRcaValue = await getExpectedRcaValue({
        rcaShield: contracts.rcaShieldCompound,
        uToken: contracts.uToken,
        uAmountForRcaValue: uAmountForShield,
        newCumLiqForClaims: BigNumber.from(0),
      });
      // Shield args
      const shieldAddress = contracts.rcaShieldCompound.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];
      // SwapIn args
      const shouldSwap = false;
      const tokenOut = baseToken.address;
      const swapInArgs = [shouldSwap, tokenOut, baseTokenAmountOut, sigValues.expiry];
      const mintToArgs = [
        userAddress,
        signers.referrer.address,
        expectedRcaValue,
        sigValues.expiry,
        sigValues.vInt,
        sigValues.r,
        sigValues.s,
        0,
        merkleProofs.liqProof1,
      ];

      const userRcaBalBefore = await contracts.rcaShieldCompound.balanceOf(userAddress);
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        [
          "tuple(address, address, address)", // shieldArgs(shieldAddress, uToken, baseToken)
          "tuple(bool, address, uint256, uint256)", // swapArgs(shouldSwap, amountOut)
          "tuple(address, address, uint256, uint256, uint8, bytes32, bytes32, uint256, bytes32[])", // mintToArgs
        ],
        [shieldArgs, swapInArgs, mintToArgs],
      );

      await contracts.routers.compoundRouter.connect(signers.user).zapIn(zapArgs);

      const userRcaBalAfter = await contracts.rcaShieldCompound.balanceOf(userAddress);

      expect(userRcaBalAfter.sub(userRcaBalBefore)).to.be.equal(expectedRcaValue);
    });
  });
  describe("routeTo()", function () {
    it("should allow user to route and recieve exact baseToken", async function () {
      const baseTokenDecimals = await baseToken.decimals();
      const expectedCTokens = await getExpectedCTokens(
        cToken,
        parseUnits("1000", baseTokenDecimals),
        baseTokenDecimals,
      );

      const uAmount = expectedCTokens.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(uTokenDecimals));
      const routerAddress = contracts.routers.compoundRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, expectedCTokens);

      const userBaseTokenBalBefore = await baseToken.balanceOf(userAddress);
      const deadline = (await getTimestamp()).add(100);
      // Shield args
      const shieldAddress = contracts.rcaShieldCompound.address;
      const uTokenAddress = contracts.uToken.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];

      // Swap Args
      const amountOutMin = uAmount;
      const tokenOut = baseToken.address;
      const inEth = false;
      const swapArgs = [inEth, tokenOut, amountOutMin, deadline];
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["tuple(address, address, address)", "tuple(bool, address, uint256, uint256)"],
        [shieldArgs, swapArgs],
      );
      await contracts.routers.compoundRouter.routeTo(userAddress, expectedCTokens, zapArgs);
      //check comp balances
      const userBaseTokenBalAfter = await baseToken.balanceOf(userAddress);
      const underlyingAmountExpected = await getExpectUTokenForCTokens(cToken, expectedCTokens, 6, 8);
      expect(userBaseTokenBalAfter.sub(userBaseTokenBalBefore)).to.be.gte(underlyingAmountExpected);
    });
    it("should allow user to route and recieve wrapped eth", async function () {
      const baseTokenDecimals = await baseToken.decimals();
      const uAmount = parseUnits("1000", baseTokenDecimals);
      const expectedCTokens = await getExpectedCTokens(cToken, uAmount, baseTokenDecimals);

      const routerAddress = contracts.routers.compoundRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, expectedCTokens);

      const userWethBalBefore = await weth.balanceOf(userAddress);
      const deadline = (await getTimestamp()).add(100);
      // Shield args
      const shieldAddress = contracts.rcaShieldCompound.address;
      const uTokenAddress = contracts.uToken.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];

      // Swap Args
      const amountsOut = await uniswapRouterV2.getAmountsOut(uAmount, [baseToken.address, weth.address]);
      // desired minimum ETH in return
      let amountOutMin = amountsOut[1];
      // upto 0.00005 % diff in expectedAmountOutMin and actual amount out
      amountOutMin = amountOutMin.sub(amountOutMin.div(BigNumber.from(2000000)));
      const tokenOut = weth.address;
      const inEth = false;
      const swapArgs = [inEth, tokenOut, amountOutMin, deadline];
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["tuple(address, address, address)", "tuple(bool, address, uint256, uint256)"],
        [shieldArgs, swapArgs],
      );

      await contracts.routers.compoundRouter.routeTo(userAddress, expectedCTokens, zapArgs);
      //check weth balances
      const userWethBalAfter = await weth.balanceOf(userAddress);
      expect(userWethBalAfter.sub(userWethBalBefore)).to.be.gte(amountOutMin);
    });
    it("should allow user to route and recieve eth", async function () {
      const baseTokenDecimals = await baseToken.decimals();
      const uAmount = parseUnits("1000", baseTokenDecimals);
      const expectedCTokens = await getExpectedCTokens(cToken, uAmount, baseTokenDecimals);

      const routerAddress = contracts.routers.compoundRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, expectedCTokens);

      const userEthBalBefore = await ethers.provider.getBalance(userAddress);
      const deadline = (await getTimestamp()).add(100);
      // Shield args
      const shieldAddress = contracts.rcaShieldCompound.address;
      const uTokenAddress = contracts.uToken.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];

      // Swap Args
      const amountsOut = await uniswapRouterV2.getAmountsOut(uAmount, [baseToken.address, weth.address]);
      // desired minimum ETH in return
      let amountOutMin = amountsOut[1];
      // upto 0.00005 % diff in expectedAmountOutMin and actual amount out
      amountOutMin = amountOutMin.sub(amountOutMin.div(BigNumber.from(2000000)));
      const tokenOut = weth.address;
      const inEth = true;
      const swapArgs = [inEth, tokenOut, amountOutMin, deadline];
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["tuple(address, address, address)", "tuple(bool, address, uint256, uint256)"],
        [shieldArgs, swapArgs],
      );

      await contracts.routers.compoundRouter.routeTo(userAddress, expectedCTokens, zapArgs);
      //check weth balances
      const userEthBalAfter = await ethers.provider.getBalance(userAddress);
      expect(userEthBalAfter.sub(userEthBalBefore)).to.be.gte(amountOutMin);
    });
    it("should allow user to recieve desired token while redeeming rca's", async function () {
      const shieldAddress = contracts.rcaShieldCompound.address;
      const baseTokenDecimals = await baseToken.decimals();
      const uAmount = parseUnits("1000", baseTokenDecimals);
      const expectedCTokens = await getExpectedCTokens(cToken, uAmount, baseTokenDecimals);

      const uAmountForRca = expectedCTokens.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(uTokenDecimals));
      const userAddress = signers.user.address;
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmountForRca,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: shieldAddress,
      });
      await contracts.rcaShieldCompound
        .connect(signers.user)
        .mintTo(
          signers.user.address,
          signers.referrer.address,
          uAmountForRca,
          sigValues.expiry,
          sigValues.vInt,
          sigValues.r,
          sigValues.s,
          0,
          [],
        );
      await contracts.rcaShieldCompound.connect(signers.user).redeemRequest(uAmountForRca, 0, [], 0, []);

      // A bit more than 1 day withdrawal
      await increase(86500);

      const routerAddress = contracts.routers.compoundRouter.address;
      const deadline = (await getTimestamp()).add(TIME_IN_SECS.halfYear);

      // Shield args
      const uTokenAddress = contracts.uToken.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];

      // Swap Args
      const amountsOut = await uniswapRouterV2.getAmountsOut(uAmount, [baseToken.address, weth.address]);
      // desired minimum ETH in return
      let amountOutMin = amountsOut[1];
      // upto 0.00005 % diff in expectedAmountOutMin and actual amount out
      amountOutMin = amountOutMin.sub(amountOutMin.div(BigNumber.from(2000000)));
      const tokenOut = weth.address;
      const inEth = false;
      const swapArgs = [inEth, tokenOut, amountOutMin, deadline];
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["tuple(address, address, address)", "tuple(bool, address, uint256, uint256)"],
        [shieldArgs, swapArgs],
      );
      const userWethBalBefore = await weth.balanceOf(userAddress);
      await contracts.rcaShieldCompound.connect(signers.user).redeemFinalize(routerAddress, zapArgs, 0, [], 0, []);
      const userWethBalAfter = await weth.balanceOf(userAddress);

      expect(userWethBalAfter.sub(userWethBalBefore)).to.be.gte(amountOutMin);
    });
  });
});

describe("CompoundRouter:cETH", function () {
  const signers = {} as Signers;
  const contracts = {} as Contracts;
  const merkleTrees = {} as MerkleTrees;
  const merkleProofs = {} as MerkleProofs;
  // make routers empty objects so that they won't be undefined
  contracts.routers = {} as Routers;
  //  local tokens
  //  local tokens
  let baseToken: MockERC20;
  let weth: IWETH;
  let cToken: ICToken;
  let uniswapRouterV2: IUniswapV2Router02;
  before(async function () {
    await resetBlockchain();
    // UPDATE SHIELD UNDERLYING CONSTANTS
    uTokenAddress = MAINNET_ADDRESSES.contracts.compound.cEthToken;
    uTokenWhaleAddress = MAINNET_ADDRESSES.accounts.cEthWhale;
    // ETHEREUM
    baseTokenAddress = MAINNET_ADDRESSES.tokens.weth;
  });
  before(async function () {
    await resetBlockchain();
  });

  beforeEach(async function () {
    const _signers: SignerWithAddress[] = await ethers.getSigners();
    signers.user = _signers[0];
    signers.gov = _signers[1];
    signers.notGov = _signers[2];
    signers.guardian = _signers[3];
    signers.priceOracle = _signers[4];
    signers.capOracle = _signers[5];
    signers.referrer = _signers[6];
    signers.otherAccounts = _signers.slice(7);
    await hre.network.provider.send("hardhat_impersonateAccount", [uTokenWhaleAddress]);
    signers.user = await ethers.getSigner(uTokenWhaleAddress);

    // transfer eth to impersonated accounts for enough eth to cover gas
    await signers.otherAccounts[0].sendTransaction({ to: signers.user.address, value: ether("1000") });

    // load mainnet contracts
    contracts.uToken = <MockERC20>await ethers.getContractAt("MockERC20", uTokenAddress);
    cToken = <ICToken>await ethers.getContractAt("ICToken", uTokenAddress);
    // initialize uToken decimals
    uTokenDecimals = await contracts.uToken.decimals();

    baseToken = <MockERC20>await ethers.getContractAt("MockERC20", baseTokenAddress);
    weth = <IWETH>await ethers.getContractAt("IWETH", MAINNET_ADDRESSES.tokens.weth);
    uniswapRouterV2 = <IUniswapV2Router02>(
      await ethers.getContractAt("IUniswapV2Router02", MAINNET_ADDRESSES.contracts.uniswap.routerV2)
    );

    const rcaShieldCompoundFactory = <RcaShieldCompound__factory>await ethers.getContractFactory("RcaShieldCompound");
    const rcaControllerFactory = <RcaController__factory>await ethers.getContractFactory("RcaController");
    const rcaTreasuryFactory = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");
    const compoundRouterFactory = <CompoundRouter__factory>await ethers.getContractFactory("CompoundRouter");

    contracts.rcaTreasury = <RcaTreasury>await rcaTreasuryFactory.deploy(signers.gov.address);
    // Wait for contract to get deployed
    await contracts.rcaTreasury.deployed();

    contracts.rcaController = <RcaController>(
      await rcaControllerFactory.deploy(
        signers.gov.address,
        signers.guardian.address,
        signers.priceOracle.address,
        signers.capOracle.address,
        0,
        0,
        TIME_IN_SECS.day,
        contracts.rcaTreasury.address,
      )
    );
    // Wait for contract to get deployed
    await contracts.rcaController.deployed();

    contracts.rcaShieldCompound = <RcaShieldCompound>(
      await rcaShieldCompoundFactory.deploy(
        "rcaComp Shield",
        "rcaComp",
        contracts.uToken.address,
        await contracts.uToken.decimals(),
        signers.gov.address,
        contracts.rcaController.address,
        MAINNET_ADDRESSES.contracts.compound.comptroller,
      )
    );
    // Wait for contract to get deployed
    await contracts.rcaShieldCompound.deployed();

    // initialize compound shield
    await contracts.rcaController.connect(signers.gov).initializeShield(contracts.rcaShieldCompound.address);

    // deploy compound router
    uTokenDecimals = await contracts.uToken.decimals();
    contracts.routers.compoundRouter = <CompoundRouter>(
      await compoundRouterFactory.deploy(MAINNET_ADDRESSES.contracts.uniswap.routerV2)
    );
    await contracts.routers.compoundRouter.deployed();
    // TODO: whitelist router
    const routerAddress = contracts.routers.compoundRouter.address;

    await contracts.rcaController.connect(signers.guardian).setRouterVerified(routerAddress, true);

    // Set liquidation tree.
    merkleTrees.liqTree1 = new BalanceTree([
      { account: contracts.rcaShieldCompound.address, amount: ether("100") },
      { account: contracts.rcaController.address, amount: ether("100") },
    ]);

    // Set price tree.
    merkleTrees.priceTree1 = new BalanceTree([
      { account: contracts.rcaShieldCompound.address, amount: ether("0.001") },
      { account: contracts.rcaController.address, amount: ether("0.001") },
      { account: contracts.uToken.address, amount: ether("0.001") },
    ]);
    // merkleProofs
    merkleProofs.liqProof1 = merkleTrees.liqTree1.getProof(contracts.rcaShieldCompound.address, ether("100"));
    await contracts.rcaController.connect(signers.priceOracle).setPrices(merkleTrees.priceTree1.getHexRoot());

    // allowance
    await contracts.uToken.connect(signers.user).approve(contracts.rcaShieldCompound.address, ether("10000000"));
  });

  describe("zapIn()", function () {
    it("should allow the user to zap in with eth aka baseToken", async function () {
      //   mint RCA and check for shields uToken balance
      const userAddress = signers.user.address;
      const baseTokenDecimals = await baseToken.decimals();
      // base token(i.e eth) amount that is expected in uniswap token swap
      const baseTokenAmountOut = parseUnits("10", baseTokenDecimals);

      const expectedCTokens = await getExpectedCTokens(cToken, baseTokenAmountOut, baseTokenDecimals);
      const uTokenDecimals = await contracts.uToken.decimals();
      const uAmountForShield = expectedCTokens
        .mul(BigNumber.from(10).pow(18))
        .div(BigNumber.from(10).pow(uTokenDecimals));
      // returns: expiry, vInt, r, s
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmountForShield,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: contracts.rcaShieldCompound.address,
      });
      const expectedRcaValue = await getExpectedRcaValue({
        rcaShield: contracts.rcaShieldCompound,
        uToken: contracts.uToken,
        uAmountForRcaValue: uAmountForShield,
        newCumLiqForClaims: BigNumber.from(0),
      });
      // Shield args
      const shieldAddress = contracts.rcaShieldCompound.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];
      // SwapIn args
      const shouldSwap = false;
      const tokenOut = ADDRESS_ZERO;
      const deadline = sigValues.expiry;
      const swapInArgs = [shouldSwap, tokenOut, baseTokenAmountOut, deadline];
      const mintToArgs = [
        userAddress,
        signers.referrer.address,
        expectedRcaValue,
        sigValues.expiry,
        sigValues.vInt,
        sigValues.r,
        sigValues.s,
        0,
        merkleProofs.liqProof1,
      ];

      const userRcaBalBefore = await contracts.rcaShieldCompound.balanceOf(userAddress);
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        [
          "tuple(address, address, address)", // shieldArgs(shieldAddress, uToken, baseToken)
          "tuple(bool, address, uint256, uint256)", // swapArgs(shouldSwap, amountOut)
          "tuple(address, address, uint256, uint256, uint8, bytes32, bytes32, uint256, bytes32[])", // mintToArgs
        ],
        [shieldArgs, swapInArgs, mintToArgs],
      );
      // amount of ethers for cETH
      const amtEthToZap = baseTokenAmountOut;

      await contracts.routers.compoundRouter.connect(signers.user).zapIn(zapArgs, { value: amtEthToZap });

      const userRcaBalAfter = await contracts.rcaShieldCompound.balanceOf(userAddress);

      expect(userRcaBalAfter.sub(userRcaBalBefore)).to.be.equal(expectedRcaValue);
    });
  });
  describe("routeTo()", function () {
    it("should allow user to route and recieve exact baseToken", async function () {
      const baseTokenDecimals = await baseToken.decimals();
      const expectedCTokens = await getExpectedCTokens(cToken, parseUnits("10", baseTokenDecimals), baseTokenDecimals);

      const uAmount = expectedCTokens.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(uTokenDecimals));
      const routerAddress = contracts.routers.compoundRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, expectedCTokens);

      const userBaseTokenBalBefore = await ethers.provider.getBalance(userAddress);
      const deadline = (await getTimestamp()).add(100);
      // Shield args
      const shieldAddress = contracts.rcaShieldCompound.address;
      const uTokenAddress = contracts.uToken.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];

      // Swap Args
      const amountOutMin = uAmount;
      const tokenOut = baseToken.address;
      const inEth = true;
      const swapArgs = [inEth, tokenOut, amountOutMin, deadline];
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["tuple(address, address, address)", "tuple(bool, address, uint256, uint256)"],
        [shieldArgs, swapArgs],
      );
      await contracts.routers.compoundRouter.routeTo(userAddress, expectedCTokens, zapArgs);
      //check comp balances
      const userBaseTokenBalAfter = await ethers.provider.getBalance(userAddress);
      let underlyingAmountExpected = await getExpectUTokenForCTokens(cToken, expectedCTokens, 6, 8);
      // handling some discrepencies
      underlyingAmountExpected = underlyingAmountExpected.sub(underlyingAmountExpected.div(5000000));

      expect(userBaseTokenBalAfter.sub(userBaseTokenBalBefore)).to.be.gte(underlyingAmountExpected);
    });
    it("should allow user to route and recieve aave", async function () {
      const tokenOut = MAINNET_ADDRESSES.contracts.aave.token;
      const aaveToken = <MockERC20>await ethers.getContractAt("MockERC20", tokenOut);

      const baseTokenDecimals = await baseToken.decimals();
      const uAmount = parseUnits("10", baseTokenDecimals);
      const expectedCTokens = await getExpectedCTokens(cToken, uAmount, baseTokenDecimals);

      const routerAddress = contracts.routers.compoundRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, expectedCTokens);

      const userAAVEBalBefore = await aaveToken.balanceOf(userAddress);
      const deadline = (await getTimestamp()).add(100);
      // Shield args
      const shieldAddress = contracts.rcaShieldCompound.address;
      const uTokenAddress = contracts.uToken.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];

      // Swap Args
      const amountsOut = await uniswapRouterV2.getAmountsOut(uAmount, [baseToken.address, tokenOut]);
      // desired minimum AAVE in return
      let amountOutMin = amountsOut[1];
      // upto 0.00005 % diff in expectedAmountOutMin and actual amount out
      amountOutMin = amountOutMin.sub(amountOutMin.div(BigNumber.from(2000000)));
      const inEth = false;
      const swapArgs = [inEth, tokenOut, amountOutMin, deadline];
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["tuple(address, address, address)", "tuple(bool, address, uint256, uint256)"],
        [shieldArgs, swapArgs],
      );

      await contracts.routers.compoundRouter.routeTo(userAddress, expectedCTokens, zapArgs);
      //check aave balances
      const userAAVEBalAfter = await aaveToken.balanceOf(userAddress);
      expect(userAAVEBalAfter.sub(userAAVEBalBefore)).to.be.gte(amountOutMin);
    });
    it("should allow user to route and recieve wrapped eth", async function () {
      const baseTokenDecimals = await baseToken.decimals();
      const uAmount = parseUnits("10", baseTokenDecimals);
      const expectedCTokens = await getExpectedCTokens(cToken, uAmount, baseTokenDecimals);

      const routerAddress = contracts.routers.compoundRouter.address;
      const userAddress = signers.user.address;
      // transfer token to the zapper
      await contracts.uToken.connect(signers.user).transfer(routerAddress, expectedCTokens);

      const userWethBalBefore = await weth.balanceOf(userAddress);
      const deadline = (await getTimestamp()).add(100);
      // Shield args
      const shieldAddress = contracts.rcaShieldCompound.address;
      const uTokenAddress = contracts.uToken.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];

      // Swap Args
      // desired minimum wETH in return
      let amountOutMin = uAmount;
      // upto 0.00005 % diff
      amountOutMin = amountOutMin.sub(amountOutMin.div(BigNumber.from(2000000)));
      const tokenOut = weth.address;
      const inEth = false;
      const swapArgs = [inEth, tokenOut, amountOutMin, deadline];
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["tuple(address, address, address)", "tuple(bool, address, uint256, uint256)"],
        [shieldArgs, swapArgs],
      );

      await contracts.routers.compoundRouter.routeTo(userAddress, expectedCTokens, zapArgs);
      //check weth balances
      const userWethBalAfter = await weth.balanceOf(userAddress);
      expect(userWethBalAfter.sub(userWethBalBefore)).to.be.gte(amountOutMin);
    });
    it("should allow user to recieve desired token while redeeming rca's", async function () {
      const shieldAddress = contracts.rcaShieldCompound.address;
      const baseTokenDecimals = await baseToken.decimals();
      const uAmount = parseUnits("10", baseTokenDecimals);
      const expectedCTokens = await getExpectedCTokens(cToken, uAmount, baseTokenDecimals);

      const uAmountForRca = expectedCTokens.mul(BigNumber.from(10).pow(18)).div(BigNumber.from(10).pow(uTokenDecimals));
      const userAddress = signers.user.address;
      const sigValues = await getSignatureDetailsFromCapOracle({
        amount: uAmountForRca,
        capOracle: signers.capOracle,
        controller: contracts.rcaController,
        userAddress,
        shieldAddress: shieldAddress,
      });
      await contracts.rcaShieldCompound
        .connect(signers.user)
        .mintTo(
          signers.user.address,
          signers.referrer.address,
          uAmountForRca,
          sigValues.expiry,
          sigValues.vInt,
          sigValues.r,
          sigValues.s,
          0,
          [],
        );
      await contracts.rcaShieldCompound.connect(signers.user).redeemRequest(uAmountForRca, 0, [], 0, []);

      // A bit more than 1 day withdrawal
      await increase(86500);

      const routerAddress = contracts.routers.compoundRouter.address;
      const deadline = (await getTimestamp()).add(TIME_IN_SECS.halfYear);

      // Shield args
      const uTokenAddress = contracts.uToken.address;
      const shieldArgs = [shieldAddress, uTokenAddress, baseTokenAddress];

      // Swap Args
      // desired minimum ETH in return
      let amountOutMin = uAmount;
      // upto 0.00005 % diff
      amountOutMin = amountOutMin.sub(amountOutMin.div(BigNumber.from(2000000)));
      const tokenOut = weth.address;
      const inEth = false;
      const swapArgs = [inEth, tokenOut, amountOutMin, deadline];
      const zapArgs = ethers.utils.AbiCoder.prototype.encode(
        ["tuple(address, address, address)", "tuple(bool, address, uint256, uint256)"],
        [shieldArgs, swapArgs],
      );
      const userWethBalBefore = await weth.balanceOf(userAddress);
      await contracts.rcaShieldCompound.connect(signers.user).redeemFinalize(routerAddress, zapArgs, 0, [], 0, []);
      const userWethBalAfter = await weth.balanceOf(userAddress);

      expect(userWethBalAfter.sub(userWethBalBefore)).to.be.gte(amountOutMin);
    });
  });
});
