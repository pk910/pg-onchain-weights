const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PGL2ControllerArbitrum", function () {
  let controller;
  let mockSplitWallet;
  let owner;
  let l1Module;
  let aliasedL1Module;
  let user;

  const OFFSET = "0x1111000000000000000000000000000000001111";

  beforeEach(async function () {
    [owner, l1Module, user] = await ethers.getSigners();

    // Calculate aliased L1 module address
    const l1ModuleInt = BigInt(l1Module.address);
    const offsetInt = BigInt(OFFSET);
    const aliasedInt = l1ModuleInt + offsetInt;
    aliasedL1Module = ethers.getAddress("0x" + (aliasedInt & ((1n << 160n) - 1n)).toString(16).padStart(40, '0'));

    // Deploy Mock Split Wallet
    const MockSplitWallet = await ethers.getContractFactory("MockSplitWalletV2");
    mockSplitWallet = await MockSplitWallet.deploy();
    await mockSplitWallet.waitForDeployment();

    // Deploy PGL2ControllerArbitrum
    const PGL2ControllerArbitrum = await ethers.getContractFactory("PGL2ControllerArbitrum");
    controller = await PGL2ControllerArbitrum.deploy(
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

    it("Should calculate the correct aliased L1 module address", async function () {
      expect(await controller.getAliasedL1Module()).to.equal(aliasedL1Module);
    });

    it("Should have correct refund threshold", async function () {
      expect(await controller.REFUND_FORWARD_THRESHOLD()).to.equal(ethers.parseEther("0.5"));
    });

    it("Should not allow zero address for L1 module", async function () {
      const PGL2ControllerArbitrum = await ethers.getContractFactory("PGL2ControllerArbitrum");
      await expect(
        PGL2ControllerArbitrum.deploy(
          ethers.ZeroAddress,
          await mockSplitWallet.getAddress()
        )
      ).to.be.revertedWith("Invalid L1 module address");
    });

    it("Should not allow zero address for splits wallet", async function () {
      const PGL2ControllerArbitrum = await ethers.getContractFactory("PGL2ControllerArbitrum");
      await expect(
        PGL2ControllerArbitrum.deploy(
          l1Module.address,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("Invalid splits wallet address");
    });
  });

  describe("Refund Handling", function () {
    it("Should accept ETH refunds", async function () {
      await expect(
        owner.sendTransaction({
          to: await controller.getAddress(),
          value: ethers.parseEther("0.1")
        })
      ).to.emit(controller, "RefundsReceived")
        .withArgs(ethers.parseEther("0.1"));

      expect(await controller.getRefundBalance()).to.equal(ethers.parseEther("0.1"));
    });

    it("Should get current refund balance", async function () {
      await owner.sendTransaction({
        to: await controller.getAddress(),
        value: ethers.parseEther("0.2")
      });

      expect(await controller.getRefundBalance()).to.equal(ethers.parseEther("0.2"));
    });
  });

  describe("Authorization", function () {
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

    it("Should reject forwardRefunds from unauthorized caller", async function () {
      await owner.sendTransaction({
        to: await controller.getAddress(),
        value: ethers.parseEther("0.1")
      });

      await expect(
        controller.connect(user).forwardRefunds()
      ).to.be.revertedWith("Not authorized L1 module");
    });
  });

  describe("Manual Refund Forwarding", function () {
    it("Should allow L1 module to manually forward refunds", async function () {
      // Send refunds to controller
      await owner.sendTransaction({
        to: await controller.getAddress(),
        value: ethers.parseEther("0.2")
      });

      // Get initial balance of split wallet
      const initialBalance = await ethers.provider.getBalance(await mockSplitWallet.getAddress());

      // Impersonate aliased L1 module
      await ethers.provider.send("hardhat_impersonateAccount", [aliasedL1Module]);
      const aliasedSigner = await ethers.getSigner(aliasedL1Module);

      // Fund the aliased account for gas
      await owner.sendTransaction({
        to: aliasedL1Module,
        value: ethers.parseEther("1")
      });

      await expect(
        controller.connect(aliasedSigner).forwardRefunds()
      ).to.emit(controller, "RefundsForwarded")
        .withArgs(ethers.parseEther("0.2"), false);

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [aliasedL1Module]);

      // Check that refunds were forwarded to split wallet
      const finalBalance = await ethers.provider.getBalance(await mockSplitWallet.getAddress());
      expect(finalBalance - initialBalance).to.equal(ethers.parseEther("0.2"));

      // Controller should have 0 balance now
      expect(await controller.getRefundBalance()).to.equal(0);
    });

    it("Should require refunds to forward", async function () {
      // Impersonate aliased L1 module
      await ethers.provider.send("hardhat_impersonateAccount", [aliasedL1Module]);
      const aliasedSigner = await ethers.getSigner(aliasedL1Module);

      await owner.sendTransaction({
        to: aliasedL1Module,
        value: ethers.parseEther("1")
      });

      await expect(
        controller.connect(aliasedSigner).forwardRefunds()
      ).to.be.revertedWith("No refunds to forward");

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [aliasedL1Module]);
    });
  });

  describe("Automatic Refund Forwarding", function () {
    beforeEach(async function () {
      // Impersonate aliased L1 module for all tests
      await ethers.provider.send("hardhat_impersonateAccount", [aliasedL1Module]);
      await owner.sendTransaction({
        to: aliasedL1Module,
        value: ethers.parseEther("1")
      });
    });

    afterEach(async function () {
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [aliasedL1Module]);
    });

    it("Should automatically forward refunds when updateSplit is called and threshold exceeded", async function () {
      // Send refunds above threshold
      await owner.sendTransaction({
        to: await controller.getAddress(),
        value: ethers.parseEther("0.6")
      });

      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      const aliasedSigner = await ethers.getSigner(aliasedL1Module);

      await expect(
        controller.connect(aliasedSigner).updateSplit(split)
      ).to.emit(controller, "RefundsForwarded")
        .withArgs(ethers.parseEther("0.6"), true);

      expect(await mockSplitWallet.updateSplitCalled()).to.be.true;
      expect(await controller.getRefundBalance()).to.equal(0);
    });

    it("Should not forward refunds when below threshold", async function () {
      // Send refunds below threshold
      await owner.sendTransaction({
        to: await controller.getAddress(),
        value: ethers.parseEther("0.3")
      });

      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      const aliasedSigner = await ethers.getSigner(aliasedL1Module);

      // Should not emit RefundsForwarded event
      const tx = await controller.connect(aliasedSigner).updateSplit(split);
      const receipt = await tx.wait();

      const refundEvents = receipt.logs.filter(
        log => log.fragment && log.fragment.name === "RefundsForwarded"
      );
      expect(refundEvents.length).to.equal(0);

      // Refunds should still be in controller
      expect(await controller.getRefundBalance()).to.equal(ethers.parseEther("0.3"));
    });

    it("Should automatically forward refunds when distribute is called and threshold exceeded", async function () {
      await owner.sendTransaction({
        to: await controller.getAddress(),
        value: ethers.parseEther("0.7")
      });

      const split = {
        recipients: [user.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      const aliasedSigner = await ethers.getSigner(aliasedL1Module);

      await expect(
        controller.connect(aliasedSigner).distribute(split, ethers.ZeroAddress, owner.address)
      ).to.emit(controller, "RefundsForwarded")
        .withArgs(ethers.parseEther("0.7"), true);

      expect(await mockSplitWallet.distributeCalled()).to.be.true;
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
