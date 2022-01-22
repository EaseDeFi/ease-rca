import { ethers } from "hardhat";
import { providers, Contract, Signer, BigNumber } from "ethers";
import { increase, getTimestamp, mine, ether } from "./utils";
import { expect } from "chai";
import { keccak256 } from "hardhat/node_modules/ethereumjs-util";

// Testing base RCA functionalities
describe('RCAs baby', function(){
  let accounts: Signer[];
  let uToken: Contract;
  let shield: Contract;
  let controller: Contract;
  let owner: Signer;
  let user: Signer;
  let priceOracle: Signer;
  let capOracle: Signer;

  beforeEach(async function(){
    accounts    = await ethers.getSigners();
    owner       = accounts[0];
    user        = accounts[1];
    priceOracle = accounts[2];
    capOracle   = accounts[3];

    const TOKEN = await ethers.getContractFactory("MockERC20");
    uToken      = await TOKEN.deploy("Test Token", "TEST");

    const CONTROLLER = await ethers.getContractFactory("RcaController");
    //                                         governor, guardian, price oracle, capacity oracle
    controller       = await CONTROLLER.deploy(owner.getAddress(), user.getAddress(), priceOracle.getAddress(), capOracle.getAddress(),
    //                                         apr, discount (2%), 1 day withdrawal delay, treasury address.
                                               0, 200, 86400, owner.getAddress());

    const SHIELD = await ethers.getContractFactory("RcaShield");
    //                                  token name, symbol, underlying token, governor, controller
    shield       = await SHIELD.deploy("Test Token RCA", "TEST-RCA", uToken.address, owner.getAddress(), controller.address);

    //                                               shield, protocol Id, %
    await controller.connect(owner).initializeShield(shield.address, [1], [10000]);
  });

  describe('Mint', function(){

    beforeEach(async function(){
      // Set capacity proof. Sorta faking, it's a 1 leaf proof. Won't provide super accurate gas pricing but shouldn't cost too much more.
      let capacities = await controller.createLeaf(shield.address, ether("1000000"));
      await controller.connect(capOracle).setCapacities(capacities);
      await uToken.mint(user.getAddress(), ether("1000000"));
    });

    // Approve shield to take 1,000 underlying tokens, mint, should receive back 1,000 RCA tokens.
    it("should be able to mint an RCA token", async function(){
      await uToken.connect(user).approve(shield.address, ether("1000"));
      //                  to address, uAmount, capacity, cap proof, for sale, old cumulative, for sale proof
      await shield.connect(user).mintTo(user.getAddress(), ether("100"), ether("1000000"), [], 0, 0, [])

      await shield.connect(user).mintTo(user.getAddress(), ether("100"), ether("1000000"), [], 0, 0, [])

      let rcaBal = await shield.balanceOf(user.getAddress());
      expect(rcaBal).to.be.equal(ether("200"));
    });
  });

  describe('Purchase', function(){

    beforeEach(async function(){
      // Set capacity proof. Sorta faking, it's a 1 leaf proof. Won't provide super accurate gas pricing but shouldn't cost too much more.
      let capacities = await controller.createLeaf(shield.address, ether("1000000"));
      await controller.connect(capOracle).setCapacities(capacities);
      await uToken.mint(user.getAddress(), ether("1000000"));

      await uToken.connect(user).approve(shield.address, ether("1000"));
      //                  to address, uAmount, capacity, cap proof, for sale, old cumulative, for sale proof
      await shield.connect(user).mintTo(user.getAddress(), ether("1000"), ether("1000000"), [], 0, 0, [])

      let forSale = await controller.createForSale(shield.address, ether("1000"), 0);
      await controller.connect(owner).setForSale(forSale);

      // Create the prices, can re-use other leaf
      let priceRoot = await controller.createLeaf(shield.address, 1);
      await controller.connect(priceOracle).setPrices(priceRoot);
    });

    // Attempt to purchase 100 RCA tokens twice.
    it("should be able to purchase an RCA token from liquidation", async function(){
      await shield.purchaseRca(user.getAddress(), ether("100"), 1, [], ether("1000"), 0, [], {value: 100});
      await shield.purchaseRca(user.getAddress(), ether("100"), 1, [], ether("1000"), 0, [], {value: 100});
      await shield.purchaseRca(user.getAddress(), ether("100"), 1, [], ether("1000"), 0, [], {value: 100});
    });
  });

});
