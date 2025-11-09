const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PGL2ModuleArbitrum", function () {
  let module;
  let mockInbox;
  let owner;
  let l1Controller;
  let l2Controller;
  let user;

  beforeEach(async function () {
    [owner, l1Controller, l2Controller, user] = await ethers.getSigners();

    // Deploy Mock Arbitrum Inbox
    const MockArbitrumInbox = await ethers.getContractFactory("MockArbitrumInbox");
    mockInbox = await MockArbitrumInbox.deploy();
    await mockInbox.waitForDeployment();

    // Deploy PGL2ModuleArbitrum
    const PGL2ModuleArbitrum = await ethers.getContractFactory("PGL2ModuleArbitrum");
    module = await PGL2ModuleArbitrum.deploy(
      await mockInbox.getAddress(),
      42161, // Arbitrum One chain ID
      "Arbitrum One"
    );
    await module.waitForDeployment();

    // Fund the module with ETH for fees
    await owner.sendTransaction({
      to: await module.getAddress(),
      value: ethers.parseEther("1")
    });
  });

  describe("Deployment", function () {
    it("Should set the correct chain ID", async function () {
      expect(await module.chainId()).to.equal(42161);
    });

    it("Should set the correct name", async function () {
      expect(await module.name()).to.equal("Arbitrum One");
    });

    it("Should set the correct inbox address", async function () {
      expect(await module.inbox()).to.equal(await mockInbox.getAddress());
    });

    it("Should set the right owner", async function () {
      expect(await module.owner()).to.equal(owner.address);
    });

    it("Should initialize gas parameters to defaults", async function () {
      expect(await module.gasLimit()).to.equal(1_000_000);
      expect(await module.maxFeePerGas()).to.equal(ethers.parseUnits("10", "gwei"));
      expect(await module.maxSubmissionCost()).to.equal(ethers.parseEther("0.001"));
    });

    it("Should not allow zero address for inbox", async function () {
      const PGL2ModuleArbitrum = await ethers.getContractFactory("PGL2ModuleArbitrum");
      await expect(
        PGL2ModuleArbitrum.deploy(ethers.ZeroAddress, 42161, "Arbitrum One")
      ).to.be.revertedWith("Invalid inbox address");
    });

    it("Should not allow zero chain ID", async function () {
      const PGL2ModuleArbitrum = await ethers.getContractFactory("PGL2ModuleArbitrum");
      await expect(
        PGL2ModuleArbitrum.deploy(await mockInbox.getAddress(), 0, "Arbitrum One")
      ).to.be.revertedWith("Invalid chain ID");
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

  describe("Gas Parameters", function () {
    it("Should allow owner to set custom gas parameters", async function () {
      await expect(
        module.setGasParameters(2_000_000, ethers.parseUnits("20", "gwei"), ethers.parseEther("0.002"))
      ).to.emit(module, "GasParametersUpdated")
        .withArgs(2_000_000, ethers.parseUnits("20", "gwei"), ethers.parseEther("0.002"));

      expect(await module.gasLimit()).to.equal(2_000_000);
      expect(await module.maxFeePerGas()).to.equal(ethers.parseUnits("20", "gwei"));
      expect(await module.maxSubmissionCost()).to.equal(ethers.parseEther("0.002"));
    });

    it("Should not allow zero gas limit", async function () {
      await expect(
        module.setGasParameters(0, ethers.parseUnits("10", "gwei"), ethers.parseEther("0.001"))
      ).to.be.revertedWith("Gas limit must be greater than 0");
    });

    it("Should not allow zero max fee per gas", async function () {
      await expect(
        module.setGasParameters(1_000_000, 0, ethers.parseEther("0.001"))
      ).to.be.revertedWith("Max fee per gas must be greater than 0");
    });

    it("Should not allow zero max submission cost", async function () {
      await expect(
        module.setGasParameters(1_000_000, ethers.parseUnits("10", "gwei"), 0)
      ).to.be.revertedWith("Max submission cost must be greater than 0");
    });

    it("Should allow resetting gas parameters to defaults", async function () {
      // Set custom parameters
      await module.setGasParameters(2_000_000, ethers.parseUnits("20", "gwei"), ethers.parseEther("0.002"));

      // Reset to defaults
      await module.resetGasParameters();

      expect(await module.gasLimit()).to.equal(1_000_000);
      expect(await module.maxFeePerGas()).to.equal(ethers.parseUnits("10", "gwei"));
      expect(await module.maxSubmissionCost()).to.equal(ethers.parseEther("0.001"));
    });

    it("Should only allow owner to set gas parameters", async function () {
      await expect(
        module.connect(user).setGasParameters(2_000_000, ethers.parseUnits("20", "gwei"), ethers.parseEther("0.002"))
      ).to.be.revertedWith("Only owner");
    });

    it("Should only allow owner to reset gas parameters", async function () {
      await expect(
        module.connect(user).resetGasParameters()
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("Update Split", function () {
    beforeEach(async function () {
      await module.setL1Controller(l1Controller.address);
      await module.setL2Controller(l2Controller.address);
    });

    it("Should create retryable ticket when called by L1 controller", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await module.connect(l1Controller).updateSplit(split);
      expect(await mockInbox.createRetryableTicketCalled()).to.be.true;
    });

    it("Should create retryable ticket when called by owner", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await module.connect(owner).updateSplit(split);
      expect(await mockInbox.createRetryableTicketCalled()).to.be.true;
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
      const newModule = await (await ethers.getContractFactory("PGL2ModuleArbitrum")).deploy(
        await mockInbox.getAddress(),
        42161,
        "Arbitrum One"
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

    it("Should require sufficient balance for fees", async function () {
      const newModule = await (await ethers.getContractFactory("PGL2ModuleArbitrum")).deploy(
        await mockInbox.getAddress(),
        42161,
        "Arbitrum One"
      );
      await newModule.waitForDeployment();
      await newModule.setL2Controller(l2Controller.address);

      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await expect(
        newModule.updateSplit(split)
      ).to.be.revertedWith("Insufficient balance for L2 fees");
    });

    it("Should set correct refund addresses to L2 controller", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await module.connect(l1Controller).updateSplit(split);

      const [to, , , excessFeeRefund, callValueRefund] = await mockInbox.getLastTicket();
      expect(to).to.equal(l2Controller.address);
      expect(excessFeeRefund).to.equal(l2Controller.address);
      expect(callValueRefund).to.equal(l2Controller.address);
    });
  });

  describe("Distribute", function () {
    beforeEach(async function () {
      await module.setL1Controller(l1Controller.address);
      await module.setL2Controller(l2Controller.address);
    });

    it("Should create retryable ticket for distribution", async function () {
      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await module.connect(l1Controller).distribute(split, ethers.ZeroAddress, owner.address);
      expect(await mockInbox.createRetryableTicketCalled()).to.be.true;
    });

    it("Should create retryable ticket for distribution with amount", async function () {
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

      expect(await mockInbox.createRetryableTicketCalled()).to.be.true;
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

  describe("Owner-Only Functions", function () {
    beforeEach(async function () {
      await module.setL2Controller(l2Controller.address);
    });

    it("Should allow owner to call execCalls", async function () {
      const calls = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,uint256,bytes)[]"],
        [[[user.address, 0, "0x"]]]
      );

      await module.execCalls(calls);
      expect(await mockInbox.createRetryableTicketCalled()).to.be.true;
    });

    it("Should allow owner to call setPaused", async function () {
      await module.setPaused(true);
      expect(await mockInbox.createRetryableTicketCalled()).to.be.true;
    });

    it("Should allow owner to call transferSplitOwnership", async function () {
      await module.transferSplitOwnership(user.address);
      expect(await mockInbox.createRetryableTicketCalled()).to.be.true;
    });

    it("Should allow owner to call forwardRefunds", async function () {
      await module.forwardRefunds();
      expect(await mockInbox.createRetryableTicketCalled()).to.be.true;
    });

    it("Should only allow owner for these functions", async function () {
      const calls = "0x";

      await expect(
        module.connect(user).execCalls(calls)
      ).to.be.revertedWith("Only owner");

      await expect(
        module.connect(user).setPaused(true)
      ).to.be.revertedWith("Only owner");

      await expect(
        module.connect(user).transferSplitOwnership(user.address)
      ).to.be.revertedWith("Only owner");

      await expect(
        module.connect(user).forwardRefunds()
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("ETH Management", function () {
    it("Should accept ETH deposits", async function () {
      await owner.sendTransaction({
        to: await module.getAddress(),
        value: ethers.parseEther("0.5")
      });

      expect(await module.getBalance()).to.be.gte(ethers.parseEther("1.5"));
    });

    it("Should allow owner to redeem ETH", async function () {
      const balanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await module.redeem(ethers.parseEther("0.5"));
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(owner.address);
      expect(balanceAfter).to.be.closeTo(
        balanceBefore + ethers.parseEther("0.5") - gasUsed,
        ethers.parseEther("0.001")
      );

      expect(await module.getBalance()).to.be.closeTo(ethers.parseEther("0.5"), ethers.parseEther("0.001"));
    });

    it("Should not allow redeeming more than balance", async function () {
      await expect(
        module.redeem(ethers.parseEther("10"))
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Should only allow owner to redeem", async function () {
      await expect(
        module.connect(user).redeem(ethers.parseEther("0.5"))
      ).to.be.revertedWith("Only owner");
    });
  });
});
