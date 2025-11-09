const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PGMemberRegistry", function () {
  let pgMemberRegistry;
  let owner;
  let manager;
  let member1;

  beforeEach(async function () {
    [owner, manager, member1] = await ethers.getSigners();

    const PGMemberRegistry = await ethers.getContractFactory("PGMemberRegistry");
    pgMemberRegistry = await PGMemberRegistry.deploy();
    await pgMemberRegistry.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await pgMemberRegistry.owner()).to.equal(owner.address);
    });

    it("Should have zero members initially", async function () {
      const count = await pgMemberRegistry.getActiveMemberCount();
      expect(count).to.equal(0);
    });
  });

  describe("Member Management", function () {
    it("Should add a member", async function () {
      await pgMemberRegistry.addMember(member1.address, 2024, 1, 100);

      const count = await pgMemberRegistry.getActiveMemberCount();
      expect(count).to.equal(1);

      const member = await pgMemberRegistry.getMember(member1.address);
      expect(member.memberAddress).to.equal(member1.address);
      expect(member.joinYear).to.equal(2024);
      expect(member.joinMonth).to.equal(1);
      expect(member.partTimeFactor).to.equal(100);
      expect(member.active).to.equal(true);
    });

    it("Should not allow non-owner to add member", async function () {
      await expect(
        pgMemberRegistry.connect(member1).addMember(member1.address, 2024, 1, 100)
      ).to.be.revertedWith("Only owner");
    });

    it("Should update a member", async function () {
      await pgMemberRegistry.addMember(member1.address, 2024, 1, 100);
      await pgMemberRegistry.updateMember(member1.address, 50, 2, true);

      const member = await pgMemberRegistry.getMember(member1.address);
      expect(member.partTimeFactor).to.equal(50);
      expect(member.monthsOnBreak).to.equal(2);
    });

    it("Should delete a member", async function () {
      await pgMemberRegistry.addMember(member1.address, 2024, 1, 100);
      await pgMemberRegistry.delMember(member1.address);

      const count = await pgMemberRegistry.getActiveMemberCount();
      expect(count).to.equal(0);
    });
  });

  describe("Org Members", function () {
    it("Should add org member with fixed percentage", async function () {
      await pgMemberRegistry.addOrgMember(member1.address, 50000); // 5%

      const orgMember = await pgMemberRegistry.getOrgMember(member1.address);
      expect(orgMember.memberAddress).to.equal(member1.address);
      expect(orgMember.fixedPercentage).to.equal(50000);
      expect(orgMember.active).to.equal(true);
    });

    it("Should not allow percentage > 100%", async function () {
      await expect(
        pgMemberRegistry.addOrgMember(member1.address, 1000001)
      ).to.be.revertedWith("Invalid percentage");
    });
  });

  describe("Weight Calculation", function () {
    it("Should return weights for all members", async function () {
      // Add multiple members
      const [, , , addr2, addr3] = await ethers.getSigners();
      await pgMemberRegistry.addMember(member1.address, 2024, 1, 100);
      await pgMemberRegistry.addMember(addr2.address, 2024, 6, 100);
      await pgMemberRegistry.addMember(addr3.address, 2023, 1, 50);

      const [results, gasUsed] = await pgMemberRegistry.getAllWeights(2025, 11);

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
      await pgMemberRegistry.addOrgMember(member1.address, 50000);

      // Add regular member
      const [, , , addr2] = await ethers.getSigners();
      await pgMemberRegistry.addMember(addr2.address, 2024, 1, 100);

      const [results] = await pgMemberRegistry.getAllWeights(2025, 11);

      expect(results.length).to.equal(2);

      // Find org member
      const orgResult = results.find(r => r.memberAddress === member1.address);
      expect(orgResult.percentage).to.equal(50000); // Exactly 5%

      // Regular member should get remaining 95%
      const regularResult = results.find(r => r.memberAddress === addr2.address);
      expect(regularResult.percentage).to.be.closeTo(950000n, 100n);
    });
  });
});
