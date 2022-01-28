import { expect } from "chai";
import { ethers } from "hardhat";
import { keccak256, bufferToHex } from "ethereumjs-util";
import { increase, getTimestamp, mine, ether } from "./utils";
import { providers, Contract, Signer, BigNumber } from "ethers";
import BalanceTree from './balance-tree'
import { userInfo } from "os";

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

    await uToken.mint(user.getAddress(), ether("1000000"));
  });

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////// Shield Functions //////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

  describe('Initialize', function(){

    beforeEach(async function(){

    });

    // Approve shield to take 1,000 underlying tokens, mint, should receive back 1,000 RCA tokens.
    it("should be able to mint an RCA token", async function(){

    });
  });

  describe('Mint', function(){

    beforeEach(async function(){

    });

    // Approve shield to take 1,000 underlying tokens, mint, should receive back 1,000 RCA tokens.
    it("should be able to mint an RCA token", async function(){
      let tree: BalanceTree;
      
      // Set capacity proof.
      tree = new BalanceTree([
        { account: shield.address, amount: ether("1000000") },
        { account: controller.address, amount: ether("1000000") }
      ])

      await controller.connect(capOracle).setCapacities(tree.getHexRoot());
      await uToken.connect(user).approve(shield.address, ether("1000"));
      //                  to address, uAmount, capacity, cap proof, for sale, old cumulative, for sale proof
      const capProof = tree.getProof(shield.address, ether("1000000"));
      await shield.connect(user).mintTo(user.getAddress(), ether("100"), ether("1000000"), capProof, 0, 0, []);

      let rcaBal = await shield.balanceOf(user.getAddress());
      expect(rcaBal).to.be.equal(ether("100"));
    });
  });

  describe('Redeem', function(){

    beforeEach(async function(){
      let capacities = await controller.createLeaf(shield.address, ether("1000000"));
      await controller.connect(capOracle).setCapacities(capacities);
      await uToken.connect(user).approve(shield.address, ether("1000"));
      await shield.connect(user).mintTo(user.getAddress(), ether("100"), ether("1000000"), [], 0, 0, [])
    });

    it("should be able to initiate and finalize redeem of RCA token", async function(){
      await shield.connect(user).redeemRequest(ether("100"), 0, 0, [])

      // Check request data
      let timestamp = await getTimestamp();
      let requests = await shield.withdrawRequests(user.getAddress())
      expect(requests[0]).to.be.equal(ether("100"));
      expect(requests[0]).to.be.equal(ether("100"));
      let endTime = timestamp.add("86400");
      expect(requests[2]).to.be.equal(endTime);

      // A bit more than 1 day withdrawal
      increase(86500);

      await shield.connect(user).redeemTo(user.getAddress(), user.getAddress(), 0, 0, []);
      let rcaBal = await shield.balanceOf(user.getAddress());
      let uBal   = await uToken.balanceOf(user.getAddress());
      expect(rcaBal).to.be.equal(0);
      expect(uBal).to.be.equal(ether("1000000"));
    });

    // If one request is made after another, the amounts should add to last amounts and the endTime should restart.
    it("should be able to stack redeem requests and reset time", async function(){
      await shield.connect(user).redeemRequest(ether("50"), 0, 0, [])
      // By increasing half a day we can check timestamp changing
      let startTime = await getTimestamp();
      let requests = await shield.withdrawRequests(user.getAddress())
      expect(requests[0]).to.be.equal(ether("50"));
      expect(requests[1]).to.be.equal(ether("50"));
      expect(requests[2]).to.be.equal(startTime.add("86400"));

      // Wait half a day to make sure request time resets (don't want both requests starting at the same time or we can't check).
      increase(43200);

      await shield.connect(user).redeemRequest(ether("50"), 0, 0, [])
      let secondTime = await getTimestamp();
      requests = await shield.withdrawRequests(user.getAddress());
      expect(requests[0]).to.be.equal(ether("100"));
      expect(requests[1]).to.be.equal(ether("100"));
      expect(requests[2]).to.be.equal(secondTime.add("86400"));

      requests = await shield.withdrawRequests(user.getAddress())
    });
  });

  describe('Purchase', function(){

    beforeEach(async function(){
      // Set capacity proof. Sorta faking, it's a 1 leaf proof. Won't provide super accurate gas pricing but shouldn't cost too much more.
      let capacities = await controller.createLeaf(shield.address, ether("1000000"));
      await controller.connect(capOracle).setCapacities(capacities);

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
    it("should purchase an RCA token from liquidation", async function(){
      await shield.purchaseRca(user.getAddress(), ether("100"), 1, [], ether("1000"), 0, [], {value: 100});
      expect(await shield.balanceOf(user.getAddress(), )).to.be.equal(ether("1100"));
    });

    it("should purchase underlying tokens from liquidation", async function(){
      await shield.purchaseU(user.getAddress(), ether("100"), 1, [], ether("1000"), 0, [], {value: 100});
    });
  });

  describe('Controller Updates', function(){

    beforeEach(async function(){
      // We're not updating for sale here because it resets percent paused.
      let capacities = await controller.createLeaf(shield.address, ether("1000000"));
      await controller.connect(capOracle).setCapacities(capacities);

      await controller.connect(owner).setWithdrawalDelay(100000);
      await controller.connect(owner).setDiscount(1000);
      await controller.connect(owner).setApr(1000);
      await controller.connect(owner).setTreasury(user.getAddress());
      await controller.connect(user).setPercentPaused(1000);
    });

    it("should update all variables", async function(){
      expect(await controller.apr()).to.be.equal(1000);
      expect(await controller.discount()).to.be.equal(1000);
      expect(await controller.withdrawalDelay()).to.be.equal(100000);
      expect(await controller.treasury()).to.be.equal(await user.getAddress());
      expect(await controller.percentPaused()).to.be.equal(1000);

      // Mint call should update all variables on shield
      await uToken.connect(user).approve(shield.address, ether("1000"));
      //                  to address, uAmount, capacity, cap proof, for sale, old cumulative, for sale proof
      await shield.connect(user).mintTo(user.getAddress(), ether("1000"), ether("1000000"), [], ether("1000"), 0, [])

      expect(await shield.apr()).to.be.equal(1000);
      expect(await shield.discount()).to.be.equal(1000);
      expect(await shield.withdrawalDelay()).to.be.equal(100000);
      expect(await shield.treasury()).to.be.equal(await user.getAddress());
      expect(await shield.percentPaused()).to.be.equal(1000);

      it("should update for sale", async function(){
        let forSale = await controller.createForSale(shield.address, ether("1000"), 0);
        await controller.connect(owner).setForSale(forSale);

        await uToken.connect(user).approve(shield.address, ether("1000"));
        await shield.connect(user).mintTo(user.getAddress(), ether("1000"), ether("1000000"), [], ether("1000"), 0, []);

        expect(await shield.amtForSale()).to.be.equal(ether("1000"));
        expect(await shield.cumForSale()).to.be.equal(ether("1000"));
        expect(await shield.percentPaused()).to.be.equal(0);
        expect(await controller.percentPaused()).to.be.equal(0);
      })
    });
  });

  describe('APR Update', function(){

    beforeEach(async function(){

    });

    it("should update APR when needed", async function(){

    });
  });

  describe.only('Privileged', function(){

    it("should block from privileged functions", async function(){
      await expect(controller.connect(user).setWithdrawalDelay(100000)).to.be.revertedWith("msg.sender is not owner");
      await expect(controller.connect(user).setDiscount(1000)).to.be.revertedWith("msg.sender is not owner");
      await expect(controller.connect(user).setApr(1000)).to.be.revertedWith("msg.sender is not owner");
      await expect(controller.connect(user).setTreasury(user.getAddress())).to.be.revertedWith("msg.sender is not owner");
      await expect(controller.connect(owner).setPercentPaused(1000)).to.be.revertedWith("msg.sender is not Guardian");

      await expect(shield.connect(user).setWithdrawalDelay(100000)).to.be.revertedWith("Function must only be called by controller.");
      await expect(shield.connect(user).setDiscount(1000)).to.be.revertedWith("Function must only be called by controller.");
      await expect(shield.connect(user).setApr(1000)).to.be.revertedWith("Function must only be called by controller.");
      await expect(shield.connect(user).setTreasury(user.getAddress())).to.be.revertedWith("Function must only be called by controller.");
      await expect(shield.connect(owner).setPercentPaused(1000)).to.be.revertedWith("Function must only be called by controller.");

      await expect(controller.connect(owner).setPrices("0x")).to.be.revertedWith("msg.sender is not price oracle");
      await expect(controller.connect(owner).setCapacities("0x")).to.be.revertedWith("msg.sender is not capacity oracle");

      await expect(shield.connect(user).setController(owner.getAddress())).to.be.revertedWith("msg.sender is not owner");
      await expect(shield.connect(user).proofOfLoss(owner.getAddress())).to.be.revertedWith("msg.sender is not owner");
    });
  });

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////// Controller Functions ////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

  describe('Shield Initialization', function(){

    beforeEach(async function(){

    });

    it("should ", async function(){

    });
  });

});
