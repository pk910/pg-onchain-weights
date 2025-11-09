/**
 * @title Update Splits from List
 * @notice Updates split shares from a simplified list without requiring member registry
 *
 * Usage:
 *   SPLITS="0xAddr1:100,0xAddr2:200,0xAddr3:150" \
 *   INCENTIVE=500 \
 *   L2_CHAIN=1 \
 *   npx hardhat run scripts/5b-update-splits-from-list.js --network sepolia
 *
 * Environment Variables:
 *   - SPLITS: Comma-separated list of "address:allocation" pairs
 *     Allocations are relative weights (e.g., 90:10 or 100:200:150)
 *     Script will scale them to SplitsV2 format (total = 1e6)
 *   - INCENTIVE: Distribution incentive in basis points (optional, default: 0, max: 650 = 6.5%)
 *   - L2_CHAIN: Update only a specific chain (1=L1 only, >1=specific L2)
 *     If not set, updates all registered chains
 *
 * Example with test data:
 *   npx hardhat run scripts/5b-update-splits-from-list.js --network sepolia
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Update splits from list using account:", deployer.address);

  // Load deployment state
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployments.json not found. Run deployment first.");
  }

  const deploymentState = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const networkName = hre.network.name;
  const addresses = deploymentState[networkName];

  if (!addresses || !addresses.l1Controller) {
    throw new Error(`L1 controller not found for network ${networkName}`);
  }

  // Get L1 controller
  const controller = await hre.ethers.getContractAt(
    "PGL1SplitController",
    addresses.l1Controller
  );

  console.log("\nL1 Controller:", addresses.l1Controller);

  // Parse splits from environment or use test data
  let inputSplits;

  if (process.env.SPLITS) {
    const splitPairs = process.env.SPLITS.split(",").map(s => s.trim());
    inputSplits = splitPairs.map(pair => {
      const [recipient, allocation] = pair.split(":").map(s => s.trim());
      if (!recipient || !allocation) {
        throw new Error(`Invalid split format: ${pair}. Expected "address:allocation"`);
      }
      return { recipient, allocation: BigInt(allocation) };
    });

    console.log("\n📊 Using provided data:");
    console.log(`Splits: ${inputSplits.length}`);
  } else {
    console.log("\n⚠️  No SPLITS provided, using test data...");

    // Test data: 3 recipients with different weights
    inputSplits = [
      { recipient: "0x1111111111111111111111111111111111111111", allocation: 100n },
      { recipient: "0x2222222222222222222222222222222222222222", allocation: 200n },
      { recipient: "0x3333333333333333333333333333333333333333", allocation: 150n }
    ];

    console.log("Test Splits:", inputSplits);
  }

  // Validate splits
  if (inputSplits.length === 0) {
    throw new Error("Must provide at least one split");
  }

  // Parse distribution incentive (in basis points, max 650 = 6.5%)
  const incentive = process.env.INCENTIVE ? parseInt(process.env.INCENTIVE) : 0;
  if (incentive > 650) {
    throw new Error("Distribution incentive cannot exceed 650 basis points (6.5%)");
  }

  // Parse L2_CHAIN parameter if present
  const l2Chain = process.env.L2_CHAIN ? parseInt(process.env.L2_CHAIN) : null;
  if (l2Chain !== null && (isNaN(l2Chain) || l2Chain < 1)) {
    throw new Error("Invalid L2_CHAIN. Must be a positive integer (1=L1 only, >1=specific L2)");
  }

  // Calculate input total
  const inputTotal = inputSplits.reduce((sum, split) => sum + split.allocation, 0n);

  // Scale allocations to SplitsV2 format (totalAllocation = 1e6)
  const SPLITS_PRECISION = 1000000n;
  const scaledSplits = inputSplits.map(split => {
    const scaledAllocation = (split.allocation * SPLITS_PRECISION) / inputTotal;
    return {
      recipient: split.recipient,
      allocation: scaledAllocation
    };
  });

  // Calculate scaled total and handle rounding
  let scaledTotal = scaledSplits.reduce((sum, split) => sum + split.allocation, 0n);

  // Add any rounding remainder to the first allocation
  if (scaledTotal < SPLITS_PRECISION) {
    scaledSplits[0].allocation += (SPLITS_PRECISION - scaledTotal);
    scaledTotal = SPLITS_PRECISION;
  }

  console.log("\n📋 Split Configuration:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Total Recipients: ${inputSplits.length}`);
  console.log(`Input Total (raw weights): ${inputTotal.toString()}`);
  console.log(`Scaled Total (SplitsV2 format): ${scaledTotal.toString()} (1e6 = 100%)`);
  console.log(`Distribution Incentive: ${incentive / 100}% (${incentive} bps)`);
  if (l2Chain !== null) {
    console.log(`Target Chain: ${l2Chain === 1 ? "L1 only" : `L2 Chain ${l2Chain}`}`);
  } else {
    console.log(`Target Chain: All registered chains`);
  }
  console.log("\nRecipients and Allocations:");
  for (let i = 0; i < inputSplits.length; i++) {
    const percentage = (Number(inputSplits[i].allocation) / Number(inputTotal) * 100).toFixed(4);
    const scaledAlloc = scaledSplits[i].allocation;
    console.log(`  ${i + 1}. ${inputSplits[i].recipient}`);
    console.log(`     Input: ${inputSplits[i].allocation} (${percentage}%)`);
    console.log(`     Scaled: ${scaledAlloc} (${Number(scaledAlloc) / 10000}%)`);
  }

  // Update splits
  const functionName = l2Chain !== null ? "updateSplitFromListSingleChain" : "updateSplitFromList";
  console.log(`\n🔄 Updating splits using ${functionName}...`);

  let tx;
  try {
    if (l2Chain !== null) {
      // Update single chain only
      tx = await controller.updateSplitFromListSingleChain(
        scaledSplits,
        incentive,
        l2Chain
      );
    } else {
      // Update all chains
      tx = await controller.updateSplitFromList(
        scaledSplits,
        incentive
      );
    }
  } catch (error) {
    // If gas estimation fails, try to send anyway to get the revert trace
    if (error.message.includes("execution reverted")) {
      console.log("\n⚠️  Gas estimation failed, sending transaction anyway to get revert trace...");
      try {
        if (l2Chain !== null) {
          tx = await controller.updateSplitFromListSingleChain(
            scaledSplits,
            incentive,
            l2Chain,
            { gasLimit: 5000000 } // Manual gas limit
          );
        } else {
          tx = await controller.updateSplitFromList(
            scaledSplits,
            incentive,
            { gasLimit: 5000000 } // Manual gas limit
          );
        }
      } catch (sendError) {
        console.error("\n❌ Transaction failed:");
        console.error(sendError);
        throw sendError;
      }
    } else {
      throw error;
    }
  }

  console.log("Transaction hash:", tx.hash);
  console.log("Etherscan:", `https://sepolia.etherscan.io/tx/${tx.hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt.blockNumber);

  // Check for events
  const splitUpdatedEvent = receipt.logs.find(
    log => {
      try {
        const parsed = controller.interface.parseLog(log);
        return parsed?.name === "SplitSharesUpdated";
      } catch {
        return false;
      }
    }
  );

  if (splitUpdatedEvent) {
    const parsed = controller.interface.parseLog(splitUpdatedEvent);
    console.log("\n✅ Split updated successfully!");
    console.log(`   Members: ${parsed.args.memberCount}`);
  }

  // Get registered L2 modules
  const l2Count = await controller.getL2ModuleCount();
  if (l2Count > 0) {
    console.log(`\n📡 Notified ${l2Count} L2 module(s)`);
    const chainIds = await controller.getRegisteredChainIds();
    for (const chainId of chainIds) {
      const module = await controller.l2Modules(chainId);
      const moduleName = await hre.ethers.getContractAt("IPGSplitL2Module", module).then(m => m.name());
      console.log(`   ✓ ${moduleName} (Chain ID: ${chainId})`);
    }
  } else {
    console.log("\nℹ️  No L2 modules registered");
  }

  console.log("\n✅ Done!");
  if (l2Chain !== null) {
    console.log(`\nSplit has been updated on ${l2Chain === 1 ? "L1 only" : `L2 chain ${l2Chain} only`}`);
  } else {
    console.log("\nSplit has been updated on L1 and all registered L2s");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
