const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PGL2ControllerOPStack", function () {
  let controller;
  let mockMessenger;
  let mockSplitWallet;
  let owner;
  let l1Module;
  let user;

  beforeEach(async function () {
    [owner, l1Module, user] = await ethers.getSigners();

    // Deploy Mock L2 Cross Domain Messenger
    const MockL2CrossDomainMessenger = await ethers.getContractFactory("MockL2CrossDomainMessenger");
    mockMessenger = await MockL2CrossDomainMessenger.deploy();
    await mockMessenger.waitForDeployment();

    // Deploy Mock Split Wallet
    const MockSplitWallet = await ethers.getContractFactory("MockSplitWalletV2");
    mockSplitWallet = await MockSplitWallet.deploy();
    await mockSplitWallet.waitForDeployment();

    // Deploy PGL2ControllerOPStack
    const PGL2ControllerOPStack = await ethers.getContractFactory("PGL2ControllerOPStack");
    controller = await PGL2ControllerOPStack.deploy(
      await mockMessenger.getAddress(),
      l1Module.address,
      await mockSplitWallet.getAddress()
    );
    await controller.waitForDeployment();

    // Transfer ownership of split wallet to controller
    await mockSplitWallet.transferOwnership(await controller.getAddress());
  });

  describe("Deployment", function () {
    it("Should set the correct L1 module", async function () {
      expect(await controller.l1Module()).to.equal(l1Module.address);
    });

    it("Should set the correct splits wallet", async function () {
      expect(await controller.splitsWallet()).to.equal(await mockSplitWallet.getAddress());
    });

    it("Should set the correct cross domain messenger", async function () {
      expect(await controller.crossDomainMessenger()).to.equal(await mockMessenger.getAddress());
    });

    it("Should not allow zero address for messenger", async function () {
      const PGL2ControllerOPStack = await ethers.getContractFactory("PGL2ControllerOPStack");
      await expect(
        PGL2ControllerOPStack.deploy(
          ethers.ZeroAddress,
          l1Module.address,
          await mockSplitWallet.getAddress()
        )
      ).to.be.revertedWith("Invalid messenger address");
    });

    it("Should not allow zero address for L1 module", async function () {
      const PGL2ControllerOPStack = await ethers.getContractFactory("PGL2ControllerOPStack");
      await expect(
        PGL2ControllerOPStack.deploy(
          await mockMessenger.getAddress(),
          ethers.ZeroAddress,
          await mockSplitWallet.getAddress()
        )
      ).to.be.revertedWith("Invalid L1 module address");
    });

    it("Should not allow zero address for splits wallet", async function () {
      const PGL2ControllerOPStack = await ethers.getContractFactory("PGL2ControllerOPStack");
      await expect(
        PGL2ControllerOPStack.deploy(
          await mockMessenger.getAddress(),
          l1Module.address,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Invalid splits wallet address");
    });
  });

  describe("Cross-Chain Authorization", function () {
    it("Should reject updateSplit from wrong messenger", async function () {
      await mockMessenger.setXDomainMessageSender(l1Module.address);

      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await expect(
        controller.connect(user).updateSplit(split)
      ).to.be.revertedWith("Not authorized L1 module");
    });

    it("Should reject calls from non-L1 module addresses", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await expect(
        controller.connect(owner).updateSplit(split)
      ).to.be.revertedWith("Not authorized L1 module");
    });
  });

  describe("Authorization Tests", function () {
    it("Should reject updateSplit from unauthorized caller", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await expect(
        controller.connect(user).updateSplit(split)
      ).to.be.revertedWith("Not authorized L1 module");
    });

    it("Should reject distribute from unauthorized caller", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await expect(
        controller.connect(user).distribute(split, ethers.ZeroAddress, owner.address)
      ).to.be.revertedWith("Not authorized L1 module");
    });

    it("Should reject execCalls from unauthorized caller", async function () {
      const calls = [{
        to: user.address,
        value: 0,
        data: "0x"
      }];

      await expect(
        controller.connect(user).execCalls(calls)
      ).to.be.revertedWith("Not authorized L1 module");
    });

    it("Should reject setPaused from unauthorized caller", async function () {
      await expect(
        controller.connect(user).setPaused(true)
      ).to.be.revertedWith("Not authorized L1 module");
    });

    it("Should reject transferOwnership from unauthorized caller", async function () {
      await expect(
        controller.connect(user).transferOwnership(user.address)
      ).to.be.revertedWith("Not authorized L1 module");
    });
  });

  describe("View Functions", function () {
    it("Should get split balance", async function () {
      const [splitBalance, warehouseBalance] = await controller.getSplitBalance(ethers.ZeroAddress);
      expect(splitBalance).to.equal(0);
      expect(warehouseBalance).to.equal(0);
    });

    it("Should get owner", async function () {
      const contractOwner = await controller.owner();
      expect(contractOwner).to.equal(await controller.getAddress());
    });

    it("Should get paused status", async function () {
      const isPaused = await controller.paused();
      expect(isPaused).to.be.false;
    });

    it("Should get split hash", async function () {
      const hash = await controller.splitHash();
      expect(hash).to.not.equal(ethers.ZeroHash);
    });
  });
});
