import { ethers } from "hardhat";
import { expect } from "chai";
import { Contracts, Signers } from "./types";
import { IBancorNetwork } from "../src/types/IBancorNetwork";
import { IStandardRewards } from "../src/types/IStandardRewards";
import { MAINNET_ADDRESSES, TIME_IN_SECS } from "./constants";
import { RcaShieldBancor } from "../src/types/RcaShieldBancor";
import { RcaShieldBancor__factory } from '../src/types/factories/RcaShieldBancor__factory'
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockERC20 } from "../src/types/MockERC20";
import { RcaController } from "../src/types/RcaController";
import { RcaController__factory } from "../src/types/factories/RcaController__factory";
import { RcaTreasury } from "../src/types/RcaTreasury";
import { RcaTreasury__factory } from "../src/types/factories/RcaTreasury__factory";

describe.only("RcaShieldBancor", function () {
  const idETH = BigNumber.from(MAINNET_ADDRESSES.contracts.bancor.idETH);
  const contracts = {} as Contracts
  let bancorNetwork: IBancorNetwork;
  let standardRewards: IStandardRewards;
  const signers = {} as Signers;

  beforeEach(async function () {
    //
    const _signers: SignerWithAddress[] = await ethers.getSigners();
    signers.user = _signers[0];
    signers.gov = _signers[1];
    signers.notGov = _signers[2];
    signers.guardian = _signers[3];
    signers.priceOracle = _signers[4];
    signers.capOracle = _signers[5];
    signers.referrer = _signers[6];
    signers.otherAccounts = _signers.slice(7);

    // btc weth pair
    contracts.uToken = <MockERC20>(
      await ethers.getContractAt("MockERC20", MAINNET_ADDRESSES.contracts.bancor.bnETH)
    );

    // bancorNetwork
    bancorNetwork = <IBancorNetwork>(
      await ethers.getContractAt("IBancorNetwork", MAINNET_ADDRESSES.contracts.bancor.bancorNetwork)
    );

    standardRewards = <IStandardRewards>(
      await ethers.getContractAt("IStandardRewards", MAINNET_ADDRESSES.contracts.bancor.standardRewards)
    );

    // rca contract factories
    const rcaShieldBancorFactory = <RcaShieldBancor__factory>await ethers.getContractFactory("RcaShieldBancor");
    const rcaControllerFactory = <RcaController__factory>await ethers.getContractFactory("RcaController");
    const rcaTreasuryFactory = <RcaTreasury__factory>await ethers.getContractFactory("RcaTreasury");

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
    
    contracts.rcaShieldBancor = <RcaShieldBancor>(
      await rcaShieldBancorFactory.deploy(
        "RcaShield Bancor",
        "RcaBancor",
        contracts.uToken.address,
        BigNumber.from(18),
        signers.gov.address,
        contracts.rcaController.address,
        bancorNetwork.address,
        standardRewards.address,
        idETH
      )
    );
  });

  describe("Initialize", function () {
    it("Should initialize the shield with valid state", async function () {
      expect(await contracts.rcaShieldBancor.bancorNetwork()).to.be.equal(bancorNetwork.address);
      expect(await contracts.rcaShieldBancor.standardRewards()).to.be.equal(standardRewards.address);
      expect(await contracts.rcaShieldBancor.id()).to.be.equal(idETH);
    });
  });
});