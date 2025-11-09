const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PGL2ModuleOPStack", function () {
  let module;
  let mockMessenger;
  let owner;
  let l1Controller;
  let l2Controller;
  let user;

  beforeEach(async function () {
    [owner, l1Controller, l2Controller, user] = await ethers.getSigners();

    // Deploy Mock Cross Domain Messenger
    const MockCrossDomainMessenger = await ethers.getContractFactory("MockCrossDomainMessenger");
    mockMessenger = await MockCrossDomainMessenger.deploy();
    await mockMessenger.waitForDeployment();

    // Deploy PGL2ModuleOPStack
    const PGL2ModuleOPStack = await ethers.getContractFactory("PGL2ModuleOPStack");
    module = await PGL2ModuleOPStack.deploy(
      await mockMessenger.getAddress(),
      10, // Optimism chain ID
      "Optimism"
    );
    await module.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct chain ID", async function () {
      expect(await module.chainId()).to.equal(10);
    });

    it("Should set the correct name", async function () {
      expect(await module.name()).to.equal("Optimism");
    });

    it("Should set the correct messenger address", async function () {
      expect(await module.crossDomainMessenger()).to.equal(await mockMessenger.getAddress());
    });

    it("Should set the right owner", async function () {
      expect(await module.owner()).to.equal(owner.address);
    });

    it("Should not allow zero address for messenger", async function () {
      const PGL2ModuleOPStack = await ethers.getContractFactory("PGL2ModuleOPStack");
      await expect(
        PGL2ModuleOPStack.deploy(ethers.ZeroAddress, 10, "Optimism")
      ).to.be.revertedWith("Invalid messenger address");
    });

    it("Should not allow zero chain ID", async function () {
      const PGL2ModuleOPStack = await ethers.getContractFactory("PGL2ModuleOPStack");
      await expect(
        PGL2ModuleOPStack.deploy(await mockMessenger.getAddress(), 0, "Optimism")
      ).to.be.revertedWith("Invalid chain ID");
    });

    it("Should not allow empty name", async function () {
      const PGL2ModuleOPStack = await ethers.getContractFactory("PGL2ModuleOPStack");
      await expect(
        PGL2ModuleOPStack.deploy(await mockMessenger.getAddress(), 10, "")
      ).to.be.revertedWith("Invalid name");
    });
  });

  describe("Configuration", function () {
    it("Should set L1 controller address", async function () {
      await module.setL1Controller(l1Controller.address);
      expect(await module.l1Controller()).to.equal(l1Controller.address);
    });

    it("Should emit event when L1 controller is set", async function () {
      await expect(module.setL1Controller(l1Controller.address))
        .to.emit(module, "L1ControllerUpdated")
        .withArgs(ethers.ZeroAddress, l1Controller.address);
    });

    it("Should not allow zero address for L1 controller", async function () {
      await expect(
        module.setL1Controller(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid L1 controller address");
    });

    it("Should set L2 controller address", async function () {
      await module.setL2Controller(l2Controller.address);
      expect(await module.l2Controller()).to.equal(l2Controller.address);
    });

    it("Should emit event when L2 controller is set", async function () {
      await expect(module.setL2Controller(l2Controller.address))
        .to.emit(module, "L2ControllerUpdated")
        .withArgs(ethers.ZeroAddress, l2Controller.address);
    });

    it("Should not allow zero address for L2 controller", async function () {
      await expect(
        module.setL2Controller(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid L2 controller address");
    });

    it("Should only allow owner to set controllers", async function () {
      await expect(
        module.connect(user).setL1Controller(l1Controller.address)
      ).to.be.revertedWith("Only owner");

      await expect(
        module.connect(user).setL2Controller(l2Controller.address)
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("Update Split", function () {
    beforeEach(async function () {
      await module.setL1Controller(l1Controller.address);
      await module.setL2Controller(l2Controller.address);
    });

    it("Should send cross-chain message when called by L1 controller", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await module.connect(l1Controller).updateSplit(split);
      expect(await mockMessenger.sendMessageCalled()).to.be.true;
    });

    it("Should send cross-chain message when called by owner", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await module.connect(owner).updateSplit(split);
      expect(await mockMessenger.sendMessageCalled()).to.be.true;
    });

    it("Should not allow unauthorized calls", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await expect(
        module.connect(user).updateSplit(split)
      ).to.be.revertedWith("Not authorized");
    });

    it("Should require L2 controller to be set", async function () {
      const newModule = await (await ethers.getContractFactory("PGL2ModuleOPStack")).deploy(
        await mockMessenger.getAddress(),
        10,
        "Optimism"
      );
      await newModule.waitForDeployment();

      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await expect(
        newModule.updateSplit(split)
      ).to.be.revertedWith("L2 controller not set");
    });
  });

  describe("Distribute", function () {
    beforeEach(async function () {
      await module.setL1Controller(l1Controller.address);
      await module.setL2Controller(l2Controller.address);
    });

    it("Should send distribution message", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await module.connect(l1Controller).distribute(split, ethers.ZeroAddress, owner.address);
      expect(await mockMessenger.sendMessageCalled()).to.be.true;
    });

    it("Should send distribution message with amount", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await module.connect(l1Controller)["distribute((address[],uint256[],uint256,uint16),address,uint256,bool,address)"](
        split,
        ethers.ZeroAddress,
        ethers.parseEther("1"),
        false,
        owner.address
      );

      expect(await mockMessenger.sendMessageCalled()).to.be.true;
    });

    it("Should only allow L1 controller or owner", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await expect(
        module.connect(user).distribute(split, ethers.ZeroAddress, owner.address)
      ).to.be.revertedWith("Not authorized");
    });
  });

  describe("Exec Calls", function () {
    beforeEach(async function () {
      await module.setL2Controller(l2Controller.address);
    });

    it("Should send execCalls message", async function () {
      const calls = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,uint256,bytes)[]"],
        [[[user.address, 0, "0x"]]]
      );

      await module.execCalls(calls);
      expect(await mockMessenger.sendMessageCalled()).to.be.true;
    });

    it("Should only allow owner", async function () {
      const calls = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,uint256,bytes)[]"],
        [[[user.address, 0, "0x"]]]
      );

      await expect(
        module.connect(user).execCalls(calls)
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("Set Paused", function () {
    beforeEach(async function () {
      await module.setL2Controller(l2Controller.address);
    });

    it("Should send setPaused message", async function () {
      await module.setPaused(true);
      expect(await mockMessenger.sendMessageCalled()).to.be.true;
    });

    it("Should only allow owner", async function () {
      await expect(
        module.connect(user).setPaused(true)
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("Transfer Split Ownership", function () {
    beforeEach(async function () {
      await module.setL2Controller(l2Controller.address);
    });

    it("Should send transferOwnership message", async function () {
      await module.transferSplitOwnership(user.address);
      expect(await mockMessenger.sendMessageCalled()).to.be.true;
    });

    it("Should only allow owner", async function () {
      await expect(
        module.connect(user).transferSplitOwnership(user.address)
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("ETH Management", function () {
    it("Should accept ETH deposits", async function () {
      await owner.sendTransaction({
        to: await module.getAddress(),
        value: ethers.parseEther("1")
      });

      expect(await module.getBalance()).to.equal(ethers.parseEther("1"));
    });

    it("Should allow owner to redeem ETH", async function () {
      await owner.sendTransaction({
        to: await module.getAddress(),
        value: ethers.parseEther("1")
      });

      const balanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await module.redeem(ethers.parseEther("0.5"));
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(owner.address);
      expect(balanceAfter).to.be.closeTo(
        balanceBefore + ethers.parseEther("0.5") - gasUsed,
        ethers.parseEther("0.001")
      );

      expect(await module.getBalance()).to.equal(ethers.parseEther("0.5"));
    });

    it("Should not allow redeeming more than balance", async function () {
      await owner.sendTransaction({
        to: await module.getAddress(),
        value: ethers.parseEther("1")
      });

      await expect(
        module.redeem(ethers.parseEther("2"))
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Should only allow owner to redeem", async function () {
      await owner.sendTransaction({
        to: await module.getAddress(),
        value: ethers.parseEther("1")
      });

      await expect(
        module.connect(user).redeem(ethers.parseEther("0.5"))
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("Message Encoding", function () {
    beforeEach(async function () {
      await module.setL1Controller(l1Controller.address);
      await module.setL2Controller(l2Controller.address);
    });

    it("Should encode updateSplit message correctly", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await module.connect(l1Controller).updateSplit(split);

      const [target, message, gasLimit] = await mockMessenger.getLastMessage();
      expect(target).to.equal(l2Controller.address);
      expect(gasLimit).to.equal(1_000_000);

      // Verify message contains the correct function signature
      const functionSelector = message.slice(0, 10);
      const expectedSelector = ethers.id("updateSplit((address[],uint256[],uint256,uint16))").slice(0, 10);
      expect(functionSelector).to.equal(expectedSelector);
    });
  });
});
