const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Parse cutoff date from environment variable or use default
  let cutoffYear = 2025;
  let cutoffMonth = 11;

  // Check for CUTOFF environment variable (YYYY-MM format)
  if (process.env.CUTOFF) {
    const match = process.env.CUTOFF.match(/^(\d{4})-(\d{1,2})$/);
    if (!match) {
      console.error("Invalid CUTOFF format. Use YYYY-MM format.");
      console.log("Usage: CUTOFF=YYYY-MM npm run demo");
      console.log("Example: CUTOFF=2024-06 npm run demo");
      process.exit(1);
    }
    cutoffYear = parseInt(match[1]);
    cutoffMonth = parseInt(match[2]);

    // Validate inputs
    if (isNaN(cutoffYear) || cutoffYear < 1970 || cutoffYear > 2100) {
      console.error("Invalid year. Must be between 1970 and 2100.");
      process.exit(1);
    }

    if (isNaN(cutoffMonth) || cutoffMonth < 1 || cutoffMonth > 12) {
      console.error("Invalid month. Must be between 1 and 12.");
      process.exit(1);
    }
  }

  console.log("=".repeat(80));
  console.log("PGWeights Contract Demo - Deploy, Import & Calculate");
  console.log("=".repeat(80));

  const [deployer] = await hre.ethers.getSigners();
  console.log("\n1. Deploying contract...");
  console.log("   Deployer:", deployer.address);

  // Deploy
  const PGWeights = await hre.ethers.getContractFactory("PGWeights");
  const pgWeights = await PGWeights.deploy();
  await pgWeights.waitForDeployment();
  const address = await pgWeights.getAddress();
  console.log("   ✓ Contract deployed to:", address);

  // Read import data (batched)
  console.log("\n2. Reading batched import data...");
  const importDataPath = path.join(__dirname, "../test_data/import_data.hex");

  if (!fs.existsSync(importDataPath)) {
    console.log("   ✗ test_data/import_data.hex not found!");
    console.log("   → Run: ./setup.sh");
    process.exit(1);
  }

  const importDataFile = fs.readFileSync(importDataPath, "utf8");
  const importBatches = importDataFile.split('\n')
    .map(line => line.trim())
    .filter(line => line);  // Skip empty lines

  console.log("   ✓ Loaded import data");
  console.log("   → Batches to import:", importBatches.length);

  // Calculate total member count
  let totalMembers = 0;
  for (const batch of importBatches) {
    const batchMembers = (batch.length - 2) / 54; // -2 for "0x" prefix
    totalMembers += batchMembers;
  }
  console.log("   → Total members:", Math.floor(totalMembers));

  // Import members in batches
  console.log("\n3. Importing members in batches...");
  let totalGasUsed = 0n;

  for (let i = 0; i < importBatches.length; i++) {
    const batchData = importBatches[i];
    const batchMembers = Math.floor((batchData.length - 2) / 54);

    console.log(`   Batch ${i + 1}/${importBatches.length}: ${batchMembers} members...`);
    const importTx = await pgWeights.importMembers(batchData);
    const importReceipt = await importTx.wait();
    totalGasUsed += importReceipt.gasUsed;
    console.log(`   ✓ Batch ${i + 1} imported (${importReceipt.gasUsed.toString()} gas)`);
  }

  console.log("   ✓ All batches imported");
  console.log("   → Total gas used:", totalGasUsed.toString());
  console.log("   → Gas per member:", Math.floor(Number(totalGasUsed) / totalMembers));

  // Verify import
  const activeMemberCount = await pgWeights.getActiveMemberCount();
  console.log("   → Active members:", activeMemberCount.toString());

  // Add org member (example: 5% fixed allocation)
  console.log("\n4. Adding org member with 5% fixed allocation...");
  const orgAddress = "0xccccEbdBdA2D68bABA6da99449b9CA41Dba9d4FF";
  const orgPercentage = 50000; // 5.0000%
  const addOrgTx = await pgWeights.addOrgMember(orgAddress, orgPercentage);
  const addOrgReceipt = await addOrgTx.wait();
  console.log("   ✓ Org member added");
  console.log("   → Gas used:", addOrgReceipt.gasUsed.toString());

  // Calculate weights
  const monthNames = ["", "January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"];
  console.log(`\n5. Calculating weights for ${monthNames[cutoffMonth]} ${cutoffYear}...`);

  // Call with gas estimation
  const estimatedGas = await pgWeights.getAllWeights.estimateGas(cutoffYear, cutoffMonth);
  console.log("   → Estimated gas:", estimatedGas.toString());

  // Call the function (read-only, no transaction)
  const [results, gasUsed] = await pgWeights.getAllWeights(cutoffYear, cutoffMonth);
  console.log("   ✓ Weights calculated");
  console.log("   → Actual gas (from contract):", gasUsed.toString());
  console.log("   → Total members:", results.length);

  // Analyze results
  console.log("\n6. Analyzing results...");

  // Find org member
  const orgMember = results.find(r => r.memberAddress.toLowerCase() === orgAddress.toLowerCase());
  if (orgMember) {
    const orgPct = Number(orgMember.percentage) / 10000;
    console.log("   Org member allocation:", orgPct.toFixed(4) + "%");
  }

  // Calculate total percentage
  let totalPercentage = 0n;
  for (const result of results) {
    totalPercentage += result.percentage;
  }
  const totalPct = Number(totalPercentage) / 10000;
  console.log("   Total percentage:    ", totalPct.toFixed(4) + "%");

  // Save output
  console.log("\n7. Saving output...");
  const outputPath = path.join(__dirname, "../test_data/output.txt");
  const outputLines = results.map(r =>
    `${r.memberAddress},${r.percentage}`
  ).join(',');
  fs.writeFileSync(outputPath, outputLines);
  console.log("   ✓ Output saved to test_data/output.txt");

  // Display all members in readable format with detailed breakdown
  console.log("\n8. All member allocations (with breakdown):");
  console.log("   Fetching detailed breakdown for each member...");

  // Fetch breakdown for all members (skip org members)
  const breakdowns = [];
  for (let i = 0; i < results.length; i++) {
    try {
      const breakdown = await pgWeights.getMemberBreakdown(results[i].memberAddress, cutoffYear, cutoffMonth);
      breakdowns.push({
        address: results[i].memberAddress,
        monthsSinceJoin: breakdown[0],
        activeMonths: breakdown[1],
        weightedMonths: breakdown[2],
        sqrtWeight: breakdown[3],
        percentage: results[i].percentage,
        isOrgMember: false
      });
    } catch (e) {
      // This is likely an org member - add with N/A values
      breakdowns.push({
        address: results[i].memberAddress,
        monthsSinceJoin: 0n,
        activeMonths: 0n,
        weightedMonths: 0n,
        sqrtWeight: 0n,
        percentage: results[i].percentage,
        isOrgMember: true
      });
    }
  }

  // Sort by join date (oldest members first)
  breakdowns.sort((a, b) => {
    // Org members go first
    if (a.isOrgMember && !b.isOrgMember) return -1;
    if (!a.isOrgMember && b.isOrgMember) return 1;
    // Then sort by monthsSinceJoin descending (oldest first)
    return Number(b.monthsSinceJoin - a.monthsSinceJoin);
  });

  // Top 5 members by percentage
  const sortedByPct = [...breakdowns].sort((a, b) => Number(b.percentage - a.percentage));
  console.log("\n   Top 5 members by allocation:");
  for (let i = 0; i < Math.min(5, sortedByPct.length); i++) {
    const pct = (Number(sortedByPct[i].percentage) / 10000).toFixed(4);
    console.log(`   ${i + 1}. ${sortedByPct[i].address} - ${pct}%`);
  }

  console.log("\n   All members (sorted by join date, oldest first):");
  console.log("   " + "─".repeat(130));
  console.log("   " +
    "Address".padEnd(44) +
    "Months".padStart(8) +
    "Active".padStart(8) +
    "Weighted".padStart(10) +
    "Sqrt".padStart(15) +
    "Raw%".padStart(12) +
    "Percent".padStart(14)
  );
  console.log("   " + "─".repeat(130));

  for (let i = 0; i < breakdowns.length; i++) {
    const b = breakdowns[i];
    const pct = (Number(b.percentage) / 10000).toFixed(4);

    if (b.isOrgMember) {
      // Org member - show N/A for breakdown fields
      console.log(
        `   ${b.address.padEnd(44)}` +
        `${"N/A".padStart(8)}` +
        `${"N/A".padStart(8)}` +
        `${"N/A".padStart(10)}` +
        `${"ORG".padStart(15)}` +
        `${b.percentage.toString().padStart(12)}` +
        `${(pct + "%").padStart(14)}`
      );
    } else {
      // Regular member - show full breakdown
      const sqrtFormatted = (Number(b.sqrtWeight) / 1e6).toFixed(6);
      const weightedFormatted = (Number(b.weightedMonths)).toFixed(2);

      console.log(
        `   ${b.address.padEnd(44)}` +
        `${b.monthsSinceJoin.toString().padStart(8)}` +
        `${b.activeMonths.toString().padStart(8)}` +
        `${weightedFormatted.padStart(10)}` +
        `${sqrtFormatted.padStart(15)}` +
        `${b.percentage.toString().padStart(12)}` +
        `${(pct + "%").padStart(14)}`
      );
    }
  }
  console.log("   " + "─".repeat(130));

  console.log("\n" + "=".repeat(80));
  console.log("Demo completed successfully!");
  console.log("=".repeat(80));
  console.log("\nSummary:");
  console.log("  Contract:          ", address);
  console.log("  Members imported:  ", activeMemberCount.toString());
  console.log("  Gas for getAllWeights:", gasUsed.toString());
  console.log("  Gas per member:    ", Math.floor(Number(gasUsed) / results.length));
  console.log("=".repeat(80));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
