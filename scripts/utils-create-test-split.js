/**
 * @title Create Dummy Split Contract
 * @notice Creates a new SplitsV2 wallet for testing with owner 99% and dead address 1%
 * @dev Uses 0xSplits V2 Factory to deploy a new split wallet
 *
 * Usage:
 *   npx hardhat run scripts/utils-create-split.js --network sepolia
 *   npx hardhat run scripts/utils-create-split.js --network baseSepolia
 *
 * Environment Variables:
 *   - SPLIT_FACTORY: Override the factory address from deploy-config.js
 *   - OWNER_ALLOCATION: Override owner allocation (default: 99000000 = 99%)
 *   - DEAD_ALLOCATION: Override dead address allocation (default: 10000 = 1%)
 *   - DISTRIBUTION_INCENTIVE: Set distribution incentive in bps (default: 0, max: 650)
 *
 * The created split will be:
 *   - Owner (deployer): 99%
 *   - Dead address (0x000...dEaD): 1%
 *   - Controlled by deployer
 *   - Saved to deployments.json under the network name
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const config = require("../deploy-config");

// Dead address (standard burn address)
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Creating split using account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // Get network config
  const networkName = hre.network.name;
  const networkConfig = config[networkName];

  if (!networkConfig) {
    throw new Error(`Network ${networkName} not found in deploy-config.js`);
  }

  // Get factory address
  const factoryAddress = process.env.SPLIT_FACTORY || networkConfig.splitFactoryV2;

  if (!factoryAddress || factoryAddress === "0x0000000000000000000000000000000000000000") {
    console.error("\n❌ SplitFactoryV2 address not configured!");
    console.error("\nPlease set the factory address in one of these ways:");
    console.error("1. Set SPLIT_FACTORY environment variable:");
    console.error("   SPLIT_FACTORY=0x... npx hardhat run scripts/utils-create-split.js --network", networkName);
    console.error("\n2. Update deploy-config.js with the factory address for", networkName);
    console.error("\n3. Find the 0xSplits V2 factory address at: https://docs.splits.org/");
    process.exit(1);
  }

  console.log("\n📋 Configuration:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Network:", networkName);
  console.log("Factory:", factoryAddress);
  console.log("Owner:", deployer.address);
  console.log("Dead Address:", DEAD_ADDRESS);

  // Parse allocations (using basis points scaled by 10000)
  // Total allocation should be 100000000 (100% with 6 decimal precision)
  const ownerAllocation = process.env.OWNER_ALLOCATION || "99000000"; // 99%
  const deadAllocation = process.env.DEAD_ALLOCATION || "1000000";    // 1%
  const distributionIncentive = process.env.DISTRIBUTION_INCENTIVE || "0"; // 0% incentive

  // Validate incentive
  if (parseInt(distributionIncentive) > 650) {
    throw new Error("Distribution incentive cannot exceed 650 basis points (6.5%)");
  }

  // Create split configuration
  const recipients = [deployer.address, DEAD_ADDRESS];
  const allocations = [ownerAllocation, deadAllocation];
  const totalAllocation = BigInt(ownerAllocation) + BigInt(deadAllocation);

  console.log("\n💰 Split Allocation:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Owner (${deployer.address}):`);
  console.log(`  ${(Number(ownerAllocation) / 1000000).toFixed(2)}%`);
  console.log(`Dead Address (${DEAD_ADDRESS}):`);
  console.log(`  ${(Number(deadAllocation) / 1000000).toFixed(2)}%`);
  console.log(`Distribution Incentive: ${Number(distributionIncentive) / 100}%`);
  console.log(`Total Allocation: ${totalAllocation}`);

  // Create split struct
  const split = {
    recipients: recipients,
    allocations: allocations,
    totalAllocation: totalAllocation,
    distributionIncentive: parseInt(distributionIncentive)
  };

  // Get factory contract
  console.log("\n🏭 Connecting to SplitFactoryV2...");

  // First, let's try to verify the factory exists and has code
  const factoryCode = await hre.ethers.provider.getCode(factoryAddress);
  if (factoryCode === "0x") {
    console.error("\n❌ No contract found at factory address:", factoryAddress);
    console.error("\nPossible issues:");
    console.error("1. Wrong factory address for this network");
    console.error("2. Factory not deployed on this network");
    console.error("\nPlease verify the factory address at: https://docs.splits.org/");
    process.exit(1);
  }

  const factory = await hre.ethers.getContractAt(
    "ISplitFactoryV2",
    factoryAddress
  );

  // Create split
  console.log("\n🚀 Creating new split wallet...");
  console.log("\nAttempting to create split with parameters:");
  console.log("  Split struct:", JSON.stringify({
    recipients: split.recipients,
    allocations: split.allocations.map(a => a.toString()),
    totalAllocation: split.totalAllocation.toString(),
    distributionIncentive: split.distributionIncentive
  }, null, 2));
  console.log("  Owner:", deployer.address);
  console.log("  Creator:", deployer.address);

  let tx;
  try {
    tx = await factory.createSplit(
      split,
      deployer.address, // owner
      deployer.address  // creator
    );
  } catch (error) {
    console.error("\n❌ Failed to create split!");
    console.error("\nError:", error.message);

    if (error.message.includes("execution reverted")) {
      console.error("\n⚠️  The factory contract reverted the transaction.");
      console.error("\nPossible reasons:");
      console.error("1. The factory interface might not match the actual contract");
      console.error("2. Total allocation might need to be exactly 1e6 or 1e18");
      console.error("3. The factory might have additional validation requirements");
      console.error("\n💡 Alternative: Create splits using the 0xSplits UI:");
      console.error("   https://app.splits.org/");
      console.error("\nOr check the actual factory interface at:");
      console.error("   https://docs.splits.org/");
      console.error("   Block explorer:", `https://sepolia.etherscan.io/address/${factoryAddress}#code`);
    }

    throw error;
  }

  console.log("Transaction hash:", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt.blockNumber);

  // Extract split address from events
  // The factory should emit a SplitCreated event with the split address
  let splitAddress = null;

  for (const log of receipt.logs) {
    try {
      // Try to parse as factory event
      const parsed = factory.interface.parseLog(log);
      if (parsed && parsed.args && parsed.args.split) {
        splitAddress = parsed.args.split;
        break;
      }
    } catch (e) {
      // Not a factory event, continue
    }
  }

  // If we couldn't find it in events, try to extract from logs
  if (!splitAddress) {
    console.log("\n⚠️  Could not extract split address from events.");
    console.log("Please check the transaction on a block explorer to find the split address.");
    console.log("Transaction:", tx.hash);

    // Try to find any address in the logs that looks like a contract
    const addressPattern = /0x[a-fA-F0-9]{40}/g;
    const addresses = receipt.logs
      .map(log => log.address)
      .filter(addr => addr !== factoryAddress && addr !== hre.ethers.ZeroAddress);

    if (addresses.length > 0) {
      console.log("\nPossible split addresses found in logs:");
      addresses.forEach((addr, i) => console.log(`  ${i + 1}. ${addr}`));
      splitAddress = addresses[0];
      console.log(`\nUsing first address: ${splitAddress}`);
    }
  }

  if (splitAddress) {
    console.log("\n" + "=".repeat(60));
    console.log("✅ Split Wallet Created!");
    console.log("=".repeat(60));
    console.log("\nSplit Address:", splitAddress);
    console.log("Owner:", deployer.address);
    console.log("Network:", networkName);

    // Save to deployments.json
    const deploymentPath = path.join(__dirname, "..", "deployments.json");
    let deploymentState = {};

    if (fs.existsSync(deploymentPath)) {
      deploymentState = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    }

    if (!deploymentState[networkName]) {
      deploymentState[networkName] = {};
    }

    // Save split address with timestamp
    const timestamp = new Date().toISOString();
    const splitKey = `testSplit_${Date.now()}`;

    deploymentState[networkName][splitKey] = {
      address: splitAddress,
      owner: deployer.address,
      created: timestamp,
      allocation: {
        owner: `${(Number(ownerAllocation) / 1000000).toFixed(2)}%`,
        dead: `${(Number(deadAllocation) / 1000000).toFixed(2)}%`,
      }
    };

    fs.writeFileSync(
      deploymentPath,
      JSON.stringify(deploymentState, null, 2)
    );

    console.log("\n💾 Split address saved to deployments.json");
    console.log("Key:", splitKey);

    console.log("\n📝 Next Steps:");
    console.log("1. Use this split address in your deploy-plan.js or .env file");
    console.log("2. Test the split by sending ETH or tokens to:", splitAddress);
    console.log("3. Distribute funds using scripts/6-distribute.js");

    console.log("\n⚠️  Note: This is a TEST split for development purposes only!");
  } else {
    console.log("\n❌ Could not determine split address.");
    console.log("Check the transaction on a block explorer:", tx.hash);
  }

  console.log("\n✅ Done!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
