const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PGWeights", function () {
  let pgWeights;
  let owner;
  let manager;
  let member1;

  beforeEach(async function () {
    [owner, manager, member1] = await ethers.getSigners();

    const PGWeights = await ethers.getContractFactory("PGWeights");
    pgWeights = await PGWeights.deploy();
    await pgWeights.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await pgWeights.owner()).to.equal(owner.address);
    });

    it("Should have zero members initially", async function () {
      const count = await pgWeights.getActiveMemberCount();
      expect(count).to.equal(0);
    });
  });

  describe("Member Management", function () {
    it("Should add a member", async function () {
      await pgWeights.addMember(member1.address, 2024, 1, 100);

      const count = await pgWeights.getActiveMemberCount();
      expect(count).to.equal(1);

      const member = await pgWeights.getMember(member1.address);
      expect(member.memberAddress).to.equal(member1.address);
      expect(member.joinYear).to.equal(2024);
      expect(member.joinMonth).to.equal(1);
      expect(member.partTimeFactor).to.equal(100);
      expect(member.active).to.equal(true);
    });

    it("Should not allow non-owner to add member", async function () {
      await expect(
        pgWeights.connect(member1).addMember(member1.address, 2024, 1, 100)
      ).to.be.revertedWith("Only manager or owner");
    });

    it("Should update a member", async function () {
      await pgWeights.addMember(member1.address, 2024, 1, 100);
      await pgWeights.updateMember(member1.address, 50, 2, true);

      const member = await pgWeights.getMember(member1.address);
      expect(member.partTimeFactor).to.equal(50);
      expect(member.monthsOnBreak).to.equal(2);
    });

    it("Should delete a member", async function () {
      await pgWeights.addMember(member1.address, 2024, 1, 100);
      await pgWeights.delMember(member1.address);

      const count = await pgWeights.getActiveMemberCount();
      expect(count).to.equal(0);
    });
  });

  describe("Org Members", function () {
    it("Should add org member with fixed percentage", async function () {
      await pgWeights.addOrgMember(member1.address, 50000); // 5%

      const orgMember = await pgWeights.getOrgMember(member1.address);
      expect(orgMember.memberAddress).to.equal(member1.address);
      expect(orgMember.fixedPercentage).to.equal(50000);
      expect(orgMember.active).to.equal(true);
    });

    it("Should not allow percentage > 100%", async function () {
      await expect(
        pgWeights.addOrgMember(member1.address, 1000001)
      ).to.be.revertedWith("Invalid percentage");
    });
  });

  describe("Weight Calculation", function () {
    it("Should return weights for all members", async function () {
      // Add multiple members
      const [, , , addr2, addr3] = await ethers.getSigners();
      await pgWeights.addMember(member1.address, 2024, 1, 100);
      await pgWeights.addMember(addr2.address, 2024, 6, 100);
      await pgWeights.addMember(addr3.address, 2023, 1, 50);

      const [results, gasUsed] = await pgWeights.getAllWeights(2025, 11);

      expect(results.length).to.equal(3);
      expect(gasUsed).to.be.gt(0);

      // Check total percentage is ~100%
      let totalPct = 0n;
      for (const result of results) {
        totalPct += result.percentage;
      }
      expect(totalPct).to.be.closeTo(1000000n, 100n); // Within 0.01%
    });

    it("Should handle org members correctly", async function () {
      // Add org member with 5% fixed
      await pgWeights.addOrgMember(member1.address, 50000);

      // Add regular member
      const [, , , addr2] = await ethers.getSigners();
      await pgWeights.addMember(addr2.address, 2024, 1, 100);

      const [results] = await pgWeights.getAllWeights(2025, 11);

      expect(results.length).to.equal(2);

      // Find org member
      const orgResult = results.find(r => r.memberAddress === member1.address);
      expect(orgResult.percentage).to.equal(50000); // Exactly 5%

      // Regular member should get remaining 95%
      const regularResult = results.find(r => r.memberAddress === addr2.address);
      expect(regularResult.percentage).to.be.closeTo(950000n, 100n);
    });
  });

  describe("Manager Permissions", function () {
    it("Should allow owner to add manager", async function () {
      await pgWeights.addManager(manager.address);
      expect(await pgWeights.managers(manager.address)).to.equal(true);
    });

    it("Should allow manager to add members", async function () {
      await pgWeights.addManager(manager.address);
      await pgWeights.connect(manager).addMember(member1.address, 2024, 1, 100);

      const count = await pgWeights.getActiveMemberCount();
      expect(count).to.equal(1);
    });
  });
});
