// Import members to the registry from hex-encoded data
// Usage: IMPORT_FILE=path/to/file.hex npx hardhat run scripts/import-members.js --network <network>

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYMENT_STATE_FILE = path.join(__dirname, "..", "deployments.json");

async function main() {
  const network = hre.network.name;

  // Get import file path
  const importFilePath = process.env.IMPORT_FILE || path.join(__dirname, "../test_data/import_data.hex");

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Import Members to Registry on ${network}`);
  console.log(`${"=".repeat(80)}\n`);

  // Load deployment state
  let deploymentState = {};
  if (fs.existsSync(DEPLOYMENT_STATE_FILE)) {
    const data = fs.readFileSync(DEPLOYMENT_STATE_FILE, "utf8");
    deploymentState = JSON.parse(data);
  }

  // Determine which network (only L1 has registry)
  const l1Networks = ["sepolia", "mainnet"];
  if (!l1Networks.includes(network)) {
    throw new Error(
      `Registry only exists on L1 networks (sepolia, mainnet).\n` +
      `Current network: ${network}`
    );
  }

  const registryAddress = deploymentState[network]?.registry;
  if (!registryAddress) {
    throw new Error(
      `Registry address not found in deployment state for ${network}\n` +
      `Please deploy registry first.`
    );
  }

  console.log(`Registry: ${registryAddress}`);
  console.log(`Import file: ${importFilePath}\n`);

  // Check if file exists
  if (!fs.existsSync(importFilePath)) {
    console.error(`❌ Import file not found: ${importFilePath}`);
    console.log(`\nTo use test data:`);
    console.log(`1. Run: ./setup.sh`);
    console.log(`2. Use: IMPORT_FILE=test_data/import_data.hex\n`);
    console.log(`Or specify custom file: IMPORT_FILE=/path/to/your/data.hex\n`);
    process.exit(1);
  }

  // Read import data
  console.log(`Reading import data...`);
  const importDataFile = fs.readFileSync(importFilePath, "utf8");
  const importBatches = importDataFile.split('\n')
    .map(line => line.trim())
    .filter(line => line && line.startsWith('0x'));  // Skip empty lines and non-hex

  console.log(`✓ Loaded ${importBatches.length} batches\n`);

  // Calculate total member count
  let totalMembers = 0;
  for (const batch of importBatches) {
    // Each member is 27 bytes = 54 hex chars
    const batchMembers = (batch.length - 2) / 54; // -2 for "0x" prefix
    totalMembers += batchMembers;
  }
  console.log(`Total members to import: ${Math.floor(totalMembers)}\n`);

  // Get registry contract
  const registry = await hre.ethers.getContractAt("PGMemberRegistry", registryAddress);

  // Check current member count
  const currentCount = await registry.getActiveMemberCount();
  console.log(`Current active members: ${currentCount.toString()}`);

  // Ask for confirmation
  console.log(`\n⚠️  This will import ${Math.floor(totalMembers)} members in ${importBatches.length} batches.`);
  console.log(`Estimated gas: ~${Math.floor(totalMembers * 50000).toLocaleString()} (approximate)\n`);

  // Import members in batches
  console.log(`Starting import...\n`);
  let totalGasUsed = 0n;

  for (let i = 0; i < importBatches.length; i++) {
    const batchData = importBatches[i];
    const batchMembers = Math.floor((batchData.length - 2) / 54);

    console.log(`Batch ${i + 1}/${importBatches.length}: ${batchMembers} members`);
    console.log(`  Data length: ${batchData.length} chars (${(batchData.length - 2) / 2} bytes)`);

    try {
      const tx = await registry.importMembers(batchData);
      console.log(`  Transaction: ${tx.hash}`);
      console.log(`  Waiting for confirmation...`);

      const receipt = await tx.wait();
      totalGasUsed += receipt.gasUsed;

      console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
      console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
      console.log(``);

    } catch (error) {
      console.error(`  ❌ Failed to import batch ${i + 1}:`, error.message);

      if (error.message.includes("Member already exists")) {
        console.log(`  ⚠️  Some members in this batch already exist. Skipping batch.`);
        continue;
      }

      throw error;
    }
  }

  // Verify import
  const newCount = await registry.getActiveMemberCount();
  const imported = Number(newCount) - Number(currentCount);

  console.log(`${"=".repeat(80)}`);
  console.log(`✅ Import complete!`);
  console.log(`${"=".repeat(80)}`);
  console.log(`Total gas used: ${totalGasUsed.toString()}`);
  console.log(`Gas per member: ${Math.floor(Number(totalGasUsed) / imported).toLocaleString()}`);
  console.log(`Active members before: ${currentCount.toString()}`);
  console.log(`Active members after: ${newCount.toString()}`);
  console.log(`Members imported: ${imported}`);
  console.log(`${"=".repeat(80)}\n`);
}

// Execute
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;
