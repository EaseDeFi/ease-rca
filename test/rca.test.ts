import { expect } from "chai";
import { ethers } from "hardhat";
import { keccak256, bufferToHex } from "ethereumjs-util";
import { increase, getTimestamp, mine, ether } from "./utils";
import { providers, Contract, Signer, BigNumber } from "ethers";
import BalanceTree from './balance-tree'
import { userInfo } from "os";

// Testing base RCA functionalities
describe('RCAs and Controller', function(){
  let accounts: Signer[];
  let uToken: Contract;
  let shield: Contract;
  let controller: Contract;
  let owner: Signer;
  let user: Signer;
  let priceOracle: Signer;
  let capOracle: Signer;
  let capTree: BalanceTree;
  let liqTree: BalanceTree;
  let priceTree: BalanceTree;
  let capProof: String[];
  let priceProof: String[];
  let liqProof: String[];
  let liqTree2: BalanceTree;
  let liqProof2: String[];

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
    await controller.connect(owner).initializeShield(shield.address, [1, 2], [10000, 10000]);

    await uToken.mint(user.getAddress(), ether("1000000"));
    await uToken.mint(owner.getAddress(), ether("1000000"));  

    // Set capacity tree.
    capTree = new BalanceTree([
      { account: shield.address, amount: ether("1000000") },
      { account: controller.address, amount: ether("1000000") }
    ]);

    await controller.connect(capOracle).setCapacities(capTree.getHexRoot());

    // Set liquidation tree.
    liqTree = new BalanceTree([
      { account: shield.address, amount: ether("100") },
      { account: controller.address, amount: ether("100") }
    ]);

    // Set liquidation tree.
    liqTree2 = new BalanceTree([
      { account: shield.address, amount: ether("0") },
      { account: controller.address, amount: ether("0") }
    ]);

    // Set price tree.
    priceTree = new BalanceTree([
      { account: shield.address, amount: ether("0.001") },
      { account: controller.address, amount: ether("0.001") }
    ]);

    await controller.connect(priceOracle).setPrices(priceTree.getHexRoot());

    capProof   = capTree.getProof(shield.address, ether("1000000"));
    priceProof = priceTree.getProof(shield.address, ether("0.001"));
    liqProof   = liqTree.getProof(shield.address, ether("100"));
    liqProof2  = liqTree2.getProof(shield.address, ether("0"));
  });

  describe('Initialize', function(){

    // Approve shield to take 1,000 underlying tokens, mint, should receive back 1,000 RCA tokens.
    it("should initialize controller correctly", async function(){
      expect(await controller.apr()).to.be.equal(0);
      expect(await controller.discount()).to.be.equal(200);
      expect(await controller.withdrawalDelay()).to.be.equal(86400);
      expect(await controller.treasury()).to.be.equal(await owner.getAddress());
      expect(await controller.percentPaused()).to.be.equal(0);
      expect(await controller.priceOracle()).to.be.equal(await priceOracle.getAddress());
      expect(await controller.capOracle()).to.be.equal(await capOracle.getAddress());
      expect(await controller.governor()).to.be.equal(await owner.getAddress());
      expect(await controller.guardian()).to.be.equal(await user.getAddress());

      expect(await controller.shieldMapping(shield.address)).to.be.equal(true);
      let protocolPercents0 = await controller.shieldProtocolPercents(shield.address, 0);
      let protocolPercents1 = await controller.shieldProtocolPercents(shield.address, 1);
      expect(protocolPercents0.protocolId).to.be.equal(1);
      expect(protocolPercents1.protocolId).to.be.equal(2);
      expect(protocolPercents0.percent).to.be.equal(10000);
      expect(protocolPercents1.percent).to.be.equal(10000);
    });

    // Approve shield to take 1,000 underlying tokens, mint, should receive back 1,000 RCA tokens.
    it("should initialize shield correctly", async function(){
      expect(await shield.apr()).to.be.equal(0);
      expect(await shield.discount()).to.be.equal(200);
      expect(await shield.withdrawalDelay()).to.be.equal(86400);
      expect(await shield.treasury()).to.be.equal(await owner.getAddress());
      expect(await shield.percentPaused()).to.be.equal(0);
      expect(await shield.name()).to.be.equal("Test Token RCA");
      expect(await shield.symbol()).to.be.equal("TEST-RCA");
      expect(await shield.uToken()).to.be.equal(uToken.address);
    });

  });

  describe('Mint', function(){

    beforeEach(async function(){
      await uToken.connect(user).approve(shield.address, ether("10000000"));
      await uToken.connect(owner).approve(shield.address, ether("10000000"));

      var capProof = capTree.getProof(shield.address, ether("1000000"));
    });

    // Approve shield to take 1,000 underlying tokens, mint, should receive back 1,000 RCA tokens.
    it("should be able to mint an RCA token", async function(){
      await shield.connect(user).mintTo(user.getAddress(), ether("100"), ether("1000000"), capProof, 0, liqProof);

      let rcaBal = await shield.balanceOf(user.getAddress());
      expect(rcaBal).to.be.equal(ether("100"));

      // Testing minting to a different address here as well
      await shield.connect(user).mintTo(owner.getAddress(), ether("50"), ether("1000000"), capProof, 0, liqProof);

      let ownerBal = await shield.balanceOf(owner.getAddress());
      expect(ownerBal).to.be.equal(ether("50"));
    });

    it("should block mints over capacity", async function(){
      await uToken.mint(user.getAddress(), ether("1000000"));
      await expect(shield.connect(user).mintTo(user.getAddress(), ether("1500000"), ether("1000000"), capProof, 0, liqProof)).to.be.revertedWith("Not enough capacity available.");
    });

    // test weird updates
  });

  describe('Redeem', function(){

    beforeEach(async function(){
      await uToken.connect(user).approve(shield.address, ether("1000"));
      await shield.connect(user).mintTo(user.getAddress(), ether("100"), ether("1000000"), capProof, 0, liqProof)
    });

    it("should be able to initiate and finalize redeem of RCA token", async function(){
      await shield.connect(user).redeemRequest(ether("100"), 0, [])

      // Check request data
      let timestamp = await getTimestamp();
      let requests = await shield.withdrawRequests(user.getAddress())
      expect(requests[0]).to.be.equal(ether("100"));
      expect(requests[0]).to.be.equal(ether("100"));
      let endTime = timestamp.add("86400");
      expect(requests[2]).to.be.equal(endTime);

      // A bit more than 1 day withdrawal
      increase(86500);

      await shield.connect(user).redeemTo(user.getAddress(), false, 0, []);
      let rcaBal = await shield.balanceOf(user.getAddress());
      let uBal   = await uToken.balanceOf(user.getAddress());
      expect(rcaBal).to.be.equal(0);
      expect(uBal).to.be.equal(ether("1000000"));
    });

    // If one request is made after another, the amounts should add to last amounts and the endTime should restart.
    it("should be able to stack redeem requests and reset time", async function(){
      await shield.connect(user).redeemRequest(ether("50"), 0, [])
      // By increasing half a day we can check timestamp changing
      let startTime = await getTimestamp();
      let requests = await shield.withdrawRequests(user.getAddress())
      expect(requests[0]).to.be.equal(ether("50"));
      expect(requests[1]).to.be.equal(ether("50"));
      expect(requests[2]).to.be.equal(startTime.add("86400"));

      // Wait half a day to make sure request time resets (don't want both requests starting at the same time or we can't check).
      increase(43200);

      await shield.connect(user).redeemRequest(ether("50"), 0, [])
      let secondTime = await getTimestamp();
      requests = await shield.withdrawRequests(user.getAddress());
      expect(requests[0]).to.be.equal(ether("100"));
      expect(requests[1]).to.be.equal(ether("100"));
      expect(requests[2]).to.be.equal(secondTime.add("86400"));

      requests = await shield.withdrawRequests(user.getAddress())
    });

    // check with zapper
    
  });

  describe('Purchase', function(){

    beforeEach(async function(){
      // Set capacity proof. Sorta faking, it's a 1 leaf proof. Won't provide super accurate gas pricing but shouldn't cost too much more.
      await uToken.connect(user).approve(shield.address, ether("1000"));
      //                  to address, uAmount, capacity, cap proof, for sale, old cumulative, for sale proof
      await shield.connect(user).mintTo(user.getAddress(), ether("1000"), ether("1000000"), capProof, 0, [])
      await controller.connect(owner).setLiqTotal(liqTree.getHexRoot());
    });

    // Attempt to purchase 100 RCA tokens twice.
    it("should purchase an RCA token from liquidation", async function(){
      await shield.purchaseRca(user.getAddress(), ether("50"), ether("0.001"), priceProof, ether("100"), liqProof, {value: ether("0.049")});
      expect(await shield.balanceOf(user.getAddress())).to.be.equal("1055555555555555555555");

      await shield.purchaseRca(user.getAddress(), ether("50"), ether("0.001"), priceProof, ether("100"), liqProof, {value: ether("0.049")});
      expect(await shield.balanceOf(user.getAddress())).to.be.equal("1111111111111111111110");
    });

    it("should purchase underlying tokens from liquidation", async function(){
      await shield.purchaseU(user.getAddress(), ether("50"), ether("0.001"), priceProof, ether("100"), liqProof, {value: ether("0.049")});
      expect(await uToken.balanceOf(user.getAddress())).to.be.equal(ether("999050"));

      await shield.purchaseU(user.getAddress(), ether("50"), ether("0.001"), priceProof, ether("100"), liqProof, {value: ether("0.049")});
      expect(await uToken.balanceOf(user.getAddress())).to.be.equal(ether("999100"));
    });

  });

  describe('Controller Updates', function(){

    beforeEach(async function(){
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
      await shield.connect(user).mintTo(user.getAddress(), ether("1000"), ether("1000000"), capProof, ether("100"), liqProof)

      expect(await shield.apr()).to.be.equal(1000);
      expect(await shield.discount()).to.be.equal(1000);
      expect(await shield.withdrawalDelay()).to.be.equal(100000);
      expect(await shield.treasury()).to.be.equal(await user.getAddress());
      expect(await shield.percentPaused()).to.be.equal(1000);

      it("should update for sale", async function(){
        await uToken.connect(user).approve(shield.address, ether("1000"));
        await shield.connect(user).mintTo(user.getAddress(), ether("1000"), ether("1000000"), capProof, ether("100"), liqProof);

        expect(await shield.amtForSale()).to.be.equal(ether("100"));
        expect(await shield.cumLiq()).to.be.equal(ether("100"));
        expect(await shield.percentPaused()).to.be.equal(0);
        expect(await controller.percentPaused()).to.be.equal(0);
      })
    });
  });

  describe('Views', function(){

    beforeEach(async function(){
      await controller.connect(owner).setApr(1000);
      await uToken.connect(user).approve(shield.address, ether("1000"));
      await controller.connect(owner).setLiqTotal(liqTree2.getHexRoot());
    });

    it("should update APR when needed", async function(){
      await shield.connect(user).mintTo(user.getAddress(), ether("1000"), ether("1000000"), capProof, 0, liqProof2);

      // Wait about half a year, so about 5% should be taken.
      increase(31536000 / 2);
      mine();

      let uValue = await shield.uValue(ether("1"), 0, liqProof2);
      let rcaValue = await shield.rcaValue(ether("0.95"), 0, liqProof2);
      // Sometimes test speed discrepancies make this fail (off by a few seconds so slightly under 95%).
      expect(uValue).to.be.equal(ether("0.95"));
      expect(rcaValue).to.be.equal(ether("1"));
    });

    it("should update correctly with tokens for sale", async function(){
      await controller.connect(owner).setLiqTotal(liqTree.getHexRoot());
      await shield.connect(user).mintTo(user.getAddress(), ether("1000"), ether("1000000"), capProof, ether("100"), liqProof);

      // Wait about half a year, so about 5% should be taken.
      increase(31536000 / 2);
      mine();
      
      let uValue = await shield.uValue(ether("1"), ether("100"), liqProof);
      let rcaValue = await shield.rcaValue(ether("0.855"), ether("100"), liqProof);
      // 0.855 == 90% (because 10% is being liquidated) - (10% / 2 for APR)
      // hardcoded cause time was being annoying
      expect(uValue).to.be.equal("854999997146118721");
      expect(rcaValue).to.be.equal("1000000003337872851");
    });

    // with percent paused

  });

  describe('Privileged', function(){

    it("should block from privileged functions", async function(){
      await expect(controller.connect(user).setWithdrawalDelay(100000)).to.be.revertedWith("msg.sender is not owner");
      await expect(controller.connect(user).setDiscount(1000)).to.be.revertedWith("msg.sender is not owner");
      await expect(controller.connect(user).setApr(1000)).to.be.revertedWith("msg.sender is not owner");
      await expect(controller.connect(user).setTreasury(user.getAddress())).to.be.revertedWith("msg.sender is not owner");
      await expect(controller.connect(owner).setPercentPaused(1000)).to.be.revertedWith("msg.sender is not Guardian");

      await expect(shield.connect(user).setWithdrawalDelay(100000)).to.be.revertedWith("Function must only be called by controller.");
      await expect(shield.connect(user).setDiscount(1000)).to.be.revertedWith("Function must only be called by controller.");
      await expect(shield.connect(user).setApr(1000, 1)).to.be.revertedWith("Function must only be called by controller.");
      await expect(shield.connect(user).setTreasury(user.getAddress())).to.be.revertedWith("Function must only be called by controller.");
      await expect(shield.connect(owner).setPercentPaused(1000, 1)).to.be.revertedWith("Function must only be called by controller.");

      await expect(controller.connect(owner).setPrices(priceTree.getHexRoot())).to.be.revertedWith("msg.sender is not price oracle");
      await expect(controller.connect(owner).setCapacities(capTree.getHexRoot())).to.be.revertedWith("msg.sender is not capacity oracle");

      await expect(shield.connect(user).setController(owner.getAddress())).to.be.revertedWith("msg.sender is not owner");
      await expect(shield.connect(user).proofOfLoss(owner.getAddress())).to.be.revertedWith("msg.sender is not owner");
    });
  });

});
