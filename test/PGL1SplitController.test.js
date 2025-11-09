const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PGL1SplitController", function () {
  let controller;
  let memberRegistry;
  let mockSplitWallet;
  let owner;
  let member1, member2, member3;

  beforeEach(async function () {
    [owner, member1, member2, member3] = await ethers.getSigners();

    // Deploy PGMemberRegistry
    const PGMemberRegistry = await ethers.getContractFactory("PGMemberRegistry");
    memberRegistry = await PGMemberRegistry.deploy();
    await memberRegistry.waitForDeployment();

    // Deploy Mock Split Wallet
    const MockSplitWallet = await ethers.getContractFactory("MockSplitWalletV2");
    mockSplitWallet = await MockSplitWallet.deploy();
    await mockSplitWallet.waitForDeployment();

    // Deploy PGL1SplitController
    const PGL1SplitController = await ethers.getContractFactory("PGL1SplitController");
    controller = await PGL1SplitController.deploy();
    await controller.waitForDeployment();

    // Setup: Transfer ownership of mock split wallet to controller
    await mockSplitWallet.transferOwnership(await controller.getAddress());
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await controller.owner()).to.equal(owner.address);
    });

    it("Should have zero L2 modules initially", async function () {
      expect(await controller.getL2ModuleCount()).to.equal(0);
    });
  });

  describe("Configuration", function () {
    it("Should set member registry address", async function () {
      await controller.setMemberRegistry(await memberRegistry.getAddress());
      expect(await controller.memberRegistry()).to.equal(await memberRegistry.getAddress());
    });

    it("Should not allow zero address for member registry", async function () {
      await expect(
        controller.setMemberRegistry(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid registry address");
    });

    it("Should set splits wallet address", async function () {
      await controller.setSplitsAddress(await mockSplitWallet.getAddress());
      expect(await controller.splitsWallet()).to.equal(await mockSplitWallet.getAddress());
    });

    it("Should not allow zero address for splits wallet", async function () {
      await expect(
        controller.setSplitsAddress(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid splits address");
    });

    it("Should only allow owner to set addresses", async function () {
      await expect(
        controller.connect(member1).setMemberRegistry(await memberRegistry.getAddress())
      ).to.be.revertedWith("Only owner");

      await expect(
        controller.connect(member1).setSplitsAddress(await mockSplitWallet.getAddress())
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("L2 Module Management", function () {
    let mockL2Module;

    beforeEach(async function () {
      const MockL2Module = await ethers.getContractFactory("MockL2Module");
      mockL2Module = await MockL2Module.deploy(10, "Optimism");
      await mockL2Module.waitForDeployment();
    });

    it("Should add L2 module", async function () {
      await controller.addL2Module(10, await mockL2Module.getAddress());

      expect(await controller.isL2ModuleRegistered(10)).to.be.true;
      expect(await controller.getL2ModuleCount()).to.equal(1);

      const chainIds = await controller.getRegisteredChainIds();
      expect(chainIds.length).to.equal(1);
      expect(chainIds[0]).to.equal(10);
    });

    it("Should not allow duplicate L2 modules", async function () {
      await controller.addL2Module(10, await mockL2Module.getAddress());

      await expect(
        controller.addL2Module(10, await mockL2Module.getAddress())
      ).to.be.revertedWith("Module already registered");
    });

    it("Should remove L2 module", async function () {
      await controller.addL2Module(10, await mockL2Module.getAddress());
      await controller.removeL2Module(10);

      expect(await controller.isL2ModuleRegistered(10)).to.be.false;
      expect(await controller.getL2ModuleCount()).to.equal(0);
    });

    it("Should not allow removing non-existent module", async function () {
      await expect(
        controller.removeL2Module(999)
      ).to.be.revertedWith("Module not registered");
    });

    it("Should reject module with mismatched chain ID", async function () {
      await expect(
        controller.addL2Module(999, await mockL2Module.getAddress())
      ).to.be.revertedWith("Chain ID mismatch");
    });
  });

  describe("Split Share Updates", function () {
    beforeEach(async function () {
      // Setup controller with registry and wallet
      await controller.setMemberRegistry(await memberRegistry.getAddress());
      await controller.setSplitsAddress(await mockSplitWallet.getAddress());

      // Add test members
      await memberRegistry.addMember(member1.address, 2024, 1, 100);
      await memberRegistry.addMember(member2.address, 2024, 6, 100);
      await memberRegistry.addMember(member3.address, 2023, 1, 50);
    });

    it("Should update split shares from member registry", async function () {
      await expect(
        controller.updateSplitShares(2025, 11, 0)
      ).to.emit(controller, "SplitSharesUpdated");

      // Verify the split was updated in the mock wallet
      expect(await mockSplitWallet.updateSplitCalled()).to.be.true;
    });

    it("Should require valid month", async function () {
      await expect(
        controller.updateSplitShares(2025, 0, 0)
      ).to.be.revertedWith("Invalid month");

      await expect(
        controller.updateSplitShares(2025, 13, 0)
      ).to.be.revertedWith("Invalid month");
    });

    it("Should require member registry to be set", async function () {
      const newController = await (await ethers.getContractFactory("PGL1SplitController")).deploy();
      await newController.waitForDeployment();
      await newController.setSplitsAddress(await mockSplitWallet.getAddress());

      await expect(
        newController.updateSplitShares(2025, 11, 0)
      ).to.be.revertedWith("MemberRegistry not set");
    });

    it("Should require splits wallet to be set", async function () {
      const newController = await (await ethers.getContractFactory("PGL1SplitController")).deploy();
      await newController.waitForDeployment();
      await newController.setMemberRegistry(await memberRegistry.getAddress());

      await expect(
        newController.updateSplitShares(2025, 11, 0)
      ).to.be.revertedWith("Splits address not set");
    });

    it("Should require at least one active member", async function () {
      // Create a new registry with no members
      const emptyRegistry = await (await ethers.getContractFactory("PGMemberRegistry")).deploy();
      await emptyRegistry.waitForDeployment();

      const newController = await (await ethers.getContractFactory("PGL1SplitController")).deploy();
      await newController.waitForDeployment();
      await newController.setMemberRegistry(await emptyRegistry.getAddress());
      await newController.setSplitsAddress(await mockSplitWallet.getAddress());

      await expect(
        newController.updateSplitShares(2025, 11, 0)
      ).to.be.revertedWith("No active members");
    });
  });

  describe("Update Split From List", function () {
    beforeEach(async function () {
      await controller.setSplitsAddress(await mockSplitWallet.getAddress());
    });

    it("Should update split from recipient list", async function () {
      const splits = [
        { recipient: member1.address, allocation: 100000 },
        { recipient: member2.address, allocation: 200000 },
        { recipient: member3.address, allocation: 300000 }
      ];

      await expect(
        controller.updateSplitFromList(splits, 0)
      ).to.emit(controller, "SplitSharesUpdated");

      expect(await mockSplitWallet.updateSplitCalled()).to.be.true;
    });

    it("Should reject empty recipient list", async function () {
      await expect(
        controller.updateSplitFromList([], 0)
      ).to.be.revertedWith("No recipients provided");
    });

    it("Should reject zero address recipients", async function () {
      const splits = [
        { recipient: ethers.ZeroAddress, allocation: 100000 }
      ];

      await expect(
        controller.updateSplitFromList(splits, 0)
      ).to.be.revertedWith("Invalid recipient address");
    });

    it("Should reject zero allocations", async function () {
      const splits = [
        { recipient: member1.address, allocation: 0 }
      ];

      await expect(
        controller.updateSplitFromList(splits, 0)
      ).to.be.revertedWith("Allocation must be greater than 0");
    });
  });

  describe("Single Chain Updates", function () {
    let mockL2Module;

    beforeEach(async function () {
      await controller.setMemberRegistry(await memberRegistry.getAddress());
      await controller.setSplitsAddress(await mockSplitWallet.getAddress());

      // Add test members
      await memberRegistry.addMember(member1.address, 2024, 1, 100);
      await memberRegistry.addMember(member2.address, 2024, 6, 100);

      // Setup L2 module
      const MockL2Module = await ethers.getContractFactory("MockL2Module");
      mockL2Module = await MockL2Module.deploy(10, "Optimism");
      await mockL2Module.waitForDeployment();
      await controller.addL2Module(10, await mockL2Module.getAddress());
    });

    it("Should update L1 split only when chainId is 1", async function () {
      await controller.updateSplitSharesSingleChain(2025, 11, 0, 1);

      expect(await mockSplitWallet.updateSplitCalled()).to.be.true;
      expect(await mockL2Module.updateSplitCalled()).to.be.false;
    });

    it("Should update L2 split only when chainId matches module", async function () {
      await controller.updateSplitSharesSingleChain(2025, 11, 0, 10);

      expect(await mockSplitWallet.updateSplitCalled()).to.be.false;
      expect(await mockL2Module.updateSplitCalled()).to.be.true;
    });

    it("Should reject unregistered L2 chain ID", async function () {
      await expect(
        controller.updateSplitSharesSingleChain(2025, 11, 0, 999)
      ).to.be.revertedWith("L2 module not registered");
    });
  });

  describe("Distribution", function () {
    beforeEach(async function () {
      await controller.setSplitsAddress(await mockSplitWallet.getAddress());
    });

    it("Should distribute funds", async function () {
      const split = {
        recipients: [member1.address, member2.address],
        allocations: [500000, 500000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await controller.distribute(split, ethers.ZeroAddress, owner.address);
      expect(await mockSplitWallet.distributeCalled()).to.be.true;
    });

    it("Should distribute with amount", async function () {
      const split = {
        recipients: [member1.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await controller["distribute((address[],uint256[],uint256,uint16),address,uint256,bool,address)"](
        split,
        ethers.ZeroAddress,
        ethers.parseEther("1"),
        false,
        owner.address
      );

      expect(await mockSplitWallet.distributeCalled()).to.be.true;
    });
  });

  describe("Split Wallet Proxy Functions", function () {
    beforeEach(async function () {
      await controller.setSplitsAddress(await mockSplitWallet.getAddress());
    });

    it("Should transfer split ownership", async function () {
      await controller.transferSplitOwnership(member1.address);
      expect(await mockSplitWallet.owner()).to.equal(member1.address);
    });

    it("Should set split paused status", async function () {
      await controller.setSplitPaused(true);
      expect(await mockSplitWallet.paused()).to.be.true;

      await controller.setSplitPaused(false);
      expect(await mockSplitWallet.paused()).to.be.false;
    });

    it("Should execute arbitrary calls", async function () {
      const calls = [{
        to: member1.address,
        value: 0,
        data: "0x"
      }];

      await controller.execCalls(calls);
      expect(await mockSplitWallet.execCallsCalled()).to.be.true;
    });

    it("Should get split balance", async function () {
      const [splitBalance, warehouseBalance] = await controller.getSplitBalance(ethers.ZeroAddress);
      expect(splitBalance).to.equal(0);
      expect(warehouseBalance).to.equal(0);
    });

    it("Should get split owner", async function () {
      const splitOwner = await controller.getSplitOwner();
      expect(splitOwner).to.equal(await controller.getAddress());
    });

    it("Should get split paused status", async function () {
      const isPaused = await controller.getSplitPaused();
      expect(isPaused).to.be.false;
    });

    it("Should get split hash", async function () {
      const hash = await controller.getSplitHash();
      expect(hash).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("Access Control", function () {
    it("Should only allow owner to update split shares", async function () {
      await controller.setMemberRegistry(await memberRegistry.getAddress());
      await controller.setSplitsAddress(await mockSplitWallet.getAddress());

      await expect(
        controller.connect(member1).updateSplitShares(2025, 11, 0)
      ).to.be.revertedWith("Only owner");
    });

    it("Should only allow owner to distribute", async function () {
      const split = {
        recipients: [member1.address],
        allocations: [1000000],
        totalAllocation: 1000000,
        distributionIncentive: 0
      };

      await expect(
        controller.connect(member1).distribute(split, ethers.ZeroAddress, owner.address)
      ).to.be.revertedWith("Only owner");
    });
  });
});
