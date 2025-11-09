// Update split shares on L1 and propagate to L2s
// Usage: CUTOFF=YYYY-MM [INCENTIVE=650] [L2_FEE=0.01] [L2_CHAIN=<chainId>] npx hardhat run scripts/update-split-shares.js --network <network>

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYMENT_STATE_FILE = path.join(__dirname, "..", "deployments.json");

async function main() {
  const network = hre.network.name;

  // Parse cutoff date from environment variable
  const cutoffStr = process.env.CUTOFF;
  if (!cutoffStr) {
    console.error("Usage: CUTOFF=YYYY-MM npx hardhat run scripts/update-split-shares.js --network <network>");
    console.error("Example: CUTOFF=2025-11 npx hardhat run scripts/update-split-shares.js --network sepolia");
    console.error("\nOptional parameters:");
    console.error("  INCENTIVE=650     Distribution incentive in basis points (default: 0, max: 650 = 6.5%)");
    console.error("  L2_FEE=0.01       ETH to send for L2 messaging fees (default: 0.01 per L2)");
    console.error("  L2_CHAIN=<id>     Update only a specific chain (1=L1 only, >1=specific L2)");
    console.error("                    If not set, updates all registered chains");
    process.exit(1);
  }

  const match = cutoffStr.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) {
    throw new Error("Invalid CUTOFF format. Use YYYY-MM format.");
  }

  const cutoffYear = parseInt(match[1]);
  const cutoffMonth = parseInt(match[2]);

  // Validate inputs
  if (isNaN(cutoffYear) || cutoffYear < 1970 || cutoffYear > 2100) {
    throw new Error("Invalid year. Must be between 1970 and 2100.");
  }

  if (isNaN(cutoffMonth) || cutoffMonth < 1 || cutoffMonth > 12) {
    throw new Error("Invalid month. Must be between 1 and 12.");
  }

  // Parse optional parameters
  const distributionIncentive = parseInt(process.env.INCENTIVE || "0");
  if (distributionIncentive < 0 || distributionIncentive > 650) {
    throw new Error("Invalid INCENTIVE. Must be between 0 and 650 (0-6.5%)");
  }

  const l2FeePerChain = hre.ethers.parseEther(process.env.L2_FEE || "0.01");

  // Parse L2_CHAIN parameter if present
  const l2Chain = process.env.L2_CHAIN ? parseInt(process.env.L2_CHAIN) : null;
  if (l2Chain !== null && (isNaN(l2Chain) || l2Chain < 1)) {
    throw new Error("Invalid L2_CHAIN. Must be a positive integer (1=L1 only, >1=specific L2)");
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Update Split Shares on ${network}`);
  console.log(`${"=".repeat(80)}\n`);

  // Only works on L1
  const l1Networks = ["sepolia", "mainnet"];
  if (!l1Networks.includes(network)) {
    throw new Error(`This script only works on L1 networks (sepolia, mainnet). Current: ${network}`);
  }

  // Load deployment state
  let deploymentState = {};
  if (fs.existsSync(DEPLOYMENT_STATE_FILE)) {
    const data = fs.readFileSync(DEPLOYMENT_STATE_FILE, "utf8");
    deploymentState = JSON.parse(data);
  }

  const controllerAddress = deploymentState[network]?.l1Controller;
  const registryAddress = deploymentState[network]?.registry;

  if (!controllerAddress) {
    throw new Error(`L1 Controller not found in deployment state for ${network}`);
  }

  if (!registryAddress) {
    throw new Error(`Registry not found in deployment state for ${network}`);
  }

  const monthNames = ["", "January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"];

  console.log(`Controller: ${controllerAddress}`);
  console.log(`Registry: ${registryAddress}`);
  console.log(`Cutoff Date: ${monthNames[cutoffMonth]} ${cutoffYear}`);
  console.log(`Distribution Incentive: ${(distributionIncentive / 100).toFixed(2)}%`);
  if (l2Chain !== null) {
    console.log(`Target Chain: ${l2Chain === 1 ? "L1 only" : `L2 Chain ${l2Chain}`}`);
  } else {
    console.log(`Target Chain: All registered chains`);
  }
  console.log(``);

  // Get contracts
  const controller = await hre.ethers.getContractAt("PGL1SplitController", controllerAddress);
  const registry = await hre.ethers.getContractAt("PGMemberRegistry", registryAddress);

  // Check member count
  const activeMemberCount = await registry.getActiveMemberCount();
  const activeOrgMemberCount = await registry.getActiveOrgMemberCount();
  const totalMembers = Number(activeMemberCount) + Number(activeOrgMemberCount);

  console.log(`Active members: ${activeMemberCount.toString()}`);
  console.log(`Active org members: ${activeOrgMemberCount.toString()}`);
  console.log(`Total: ${totalMembers}\n`);

  if (totalMembers === 0) {
    throw new Error("No active members in registry. Import members first.");
  }

  // Preview the weights (read-only)
  console.log(`Calculating weights preview...`);
  try {
    const [weights, gasUsed] = await registry.getAllWeights(cutoffYear, cutoffMonth);
    console.log(`✓ Weight calculation successful`);
    console.log(`  Members with allocations: ${weights.length}`);
    console.log(`  Gas estimate: ${gasUsed.toString()}\n`);

    // Show top 5 allocations
    const sorted = [...weights].sort((a, b) => Number(b.percentage) - Number(a.percentage));
    console.log(`Top 5 allocations:`);
    for (let i = 0; i < Math.min(5, sorted.length); i++) {
      const pct = (Number(sorted[i].percentage) / 10000).toFixed(4);
      console.log(`  ${i + 1}. ${sorted[i].memberAddress} - ${pct}%`);
    }
    console.log(``);

  } catch (error) {
    console.error(`❌ Failed to calculate weights:`, error.message);
    throw error;
  }

  // Count registered L2s
  const registeredChainIds = await controller.getRegisteredChainIds();
  console.log(`Registered L2 chains: ${registeredChainIds.length}`);
  if (registeredChainIds.length > 0) {
    console.log(`L2 Chain IDs: ${registeredChainIds.map(id => id.toString()).join(", ")}`);
  }
  console.log(``);

  // Confirm action
  if (l2Chain !== null) {
    console.log(`⚠️  This will update split shares on ${l2Chain === 1 ? "L1 only" : `L2 chain ${l2Chain} only`}.`);
  } else {
    console.log(`⚠️  This will update split shares on L1 and notify ${registeredChainIds.length} L2(s).`);
  }

  // Execute update
  const functionName = l2Chain !== null ? "updateSplitSharesSingleChain" : "updateSplitShares";
  console.log(`Executing ${functionName}...`);

  try {
    let tx;
    if (l2Chain !== null) {
      // Update single chain only
      tx = await controller.updateSplitSharesSingleChain(
        cutoffYear,
        cutoffMonth,
        distributionIncentive,
        l2Chain
      );
    } else {
      // Update all chains
      tx = await controller.updateSplitShares(
        cutoffYear,
        cutoffMonth,
        distributionIncentive
      );
    }

    console.log(`Transaction sent: ${tx.hash}`);
    console.log(`Waiting for confirmation...`);

    const receipt = await tx.wait();

    console.log(`\n✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    // Parse events
    const iface = new hre.ethers.Interface([
      "event SplitSharesUpdated(uint16 cutoffYear, uint8 cutoffMonth, uint256 memberCount)"
    ]);

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === "SplitSharesUpdated") {
          console.log(`\n📊 Split Shares Updated:`);
          console.log(`   Cutoff: ${monthNames[parsed.args.cutoffMonth]} ${parsed.args.cutoffYear}`);
          console.log(`   Members: ${parsed.args.memberCount.toString()}`);
        }
      } catch (e) {
        // Not the event we're looking for
      }
    }

  } catch (error) {
    // If gas estimation fails, try to send anyway to get the revert trace
    if (error.message.includes("execution reverted")) {
      console.log("\n⚠️  Gas estimation failed, sending transaction anyway to get revert trace...");
      try {
        if (l2Chain !== null) {
          tx = await controller.updateSplitSharesSingleChain(
            cutoffYear,
            cutoffMonth,
            distributionIncentive,
            l2Chain,
            { gasLimit: 15000000 } // Manual gas limit
          );
        } else {
          tx = await controller.updateSplitShares(
            cutoffYear,
            cutoffMonth,
            distributionIncentive,
            { gasLimit: 15000000 } // Manual gas limit
          );
        }
      } catch (sendError) {
        console.error("\n❌ Transaction failed:");
        console.error(sendError);
        throw sendError;
      }
    } else {
      console.error(`\n❌ Transaction failed:`, error.message);
      if (error.message.includes("MemberRegistry not set")) {
        console.log(`\nPlease set the member registry on the controller first.`);
      } else if (error.message.includes("Splits address not set")) {
        console.log(`\nPlease set the splits wallet address on the controller first.`);
      } else if (error.message.includes("No active members")) {
        console.log(`\nNo active members found. Import members first.`);
      }
      throw error;
    }
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`✅ Split shares updated successfully!`);
  console.log(`${"=".repeat(80)}`);
  console.log(`\nNext steps:`);
  console.log(`1. Verify the split update on the splits wallet`);
  console.log(`2. Run distribution when ready:`);
  console.log(`   TOKEN=0x... DISTRIBUTOR=0x... npx hardhat run scripts/distribute.js --network ${network}`);
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
