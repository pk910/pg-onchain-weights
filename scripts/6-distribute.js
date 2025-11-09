// Trigger distribution on L1 or L2 through the L1 controller
// Usage: TOKEN=0x... DISTRIBUTOR=0x... [L2_CHAIN=84532] [L2_FEE=0.01] npx hardhat run scripts/distribute.js --network <network>

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYMENT_STATE_FILE = path.join(__dirname, "..", "deployments.json");

// Chain ID to name mapping
const CHAIN_NAMES = {
  11155111: "Sepolia",
  1: "Ethereum",
  84532: "Base Sepolia",
  8453: "Base",
  11155420: "OP Sepolia",
  10: "Optimism",
  421614: "Arbitrum Sepolia",
  42161: "Arbitrum One"
};

async function main() {
  const network = hre.network.name;

  // Parse parameters
  const token = process.env.TOKEN;
  const distributor = process.env.DISTRIBUTOR;
  const l2ChainId = process.env.L2_CHAIN ? parseInt(process.env.L2_CHAIN) : null;
  const l2Fee = process.env.L2_FEE ? hre.ethers.parseEther(process.env.L2_FEE) : hre.ethers.parseEther("0.01");

  if (!token || !distributor) {
    console.error("Usage: TOKEN=0x... DISTRIBUTOR=0x... npx hardhat run scripts/distribute.js --network <network>");
    console.error("\nRequired:");
    console.error("  TOKEN       Token address to distribute (use 0x0000000000000000000000000000000000000000 for ETH)");
    console.error("  DISTRIBUTOR Address that will receive the distribution incentive");
    console.error("\nOptional (for L2 distribution):");
    console.error("  L2_CHAIN    Chain ID of L2 to distribute on (e.g., 84532 for Base Sepolia)");
    console.error("  L2_FEE      ETH for L2 messaging fee (default: 0.01)");
    console.error("\nExamples:");
    console.error("  # Distribute ETH on L1");
    console.error("  TOKEN=0x0000000000000000000000000000000000000000 DISTRIBUTOR=0x... npx hardhat run scripts/distribute.js --network sepolia");
    console.error("\n  # Distribute USDC on Base Sepolia");
    console.error("  TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e DISTRIBUTOR=0x... L2_CHAIN=84532 npx hardhat run scripts/distribute.js --network sepolia");
    process.exit(1);
  }

  if (!hre.ethers.isAddress(token)) {
    throw new Error(`Invalid token address: ${token}`);
  }

  if (!hre.ethers.isAddress(distributor)) {
    throw new Error(`Invalid distributor address: ${distributor}`);
  }

  const isL2Distribution = l2ChainId !== null;

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Execute Distribution on ${network}`);
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

  console.log(`Controller: ${controllerAddress}`);
  console.log(`Registry: ${registryAddress}`);
  console.log(`Token: ${token}${token === hre.ethers.ZeroAddress ? " (ETH)" : ""}`);
  console.log(`Distributor: ${distributor}`);

  if (isL2Distribution) {
    const chainName = CHAIN_NAMES[l2ChainId] || `Chain ${l2ChainId}`;
    console.log(`L2 Chain: ${chainName} (${l2ChainId})`);
    console.log(`L2 Fee: ${hre.ethers.formatEther(l2Fee)} ETH`);
  } else {
    console.log(`Target: L1 (Sepolia)`);
  }
  console.log(``);

  // Get contracts
  const controller = await hre.ethers.getContractAt("PGL1SplitController", controllerAddress);
  const registry = await hre.ethers.getContractAt("PGMemberRegistry", registryAddress);

  // Check if L2 module is registered (if L2 distribution)
  if (isL2Distribution) {
    console.log(`Checking L2 module registration...`);
    const registeredChainIds = await controller.getRegisteredChainIds();
    const isRegistered = registeredChainIds.some(id => Number(id) === l2ChainId);

    if (!isRegistered) {
      throw new Error(
        `L2 chain ${l2ChainId} is not registered.\n` +
        `Registered chains: ${registeredChainIds.map(id => `${id} (${CHAIN_NAMES[Number(id)] || "Unknown"})`).join(", ")}`
      );
    }
    console.log(`✓ L2 module registered\n`);
  }

  // Get the current split configuration from the splits wallet
  console.log(`Reading current split configuration...`);

  const splitsWalletAddress = await controller.splitsWallet();
  if (splitsWalletAddress === hre.ethers.ZeroAddress) {
    throw new Error("Splits wallet not set on controller");
  }

  const splitsWallet = await hre.ethers.getContractAt("ISplitWalletV2", splitsWalletAddress);

  // Get current split hash (we need to reconstruct the split to call distribute)
  const splitHash = await splitsWallet.splitHash();
  console.log(`Current split hash: ${splitHash}`);

  // Get the latest weights to reconstruct the split
  // Note: In production, you'd want to store the last used cutoff date
  // For now, we'll use the current month as a default
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  console.log(`Fetching weights for ${currentYear}-${currentMonth.toString().padStart(2, '0')}...`);
  const [weights] = await registry.getAllWeights(currentYear, currentMonth);

  if (weights.length === 0) {
    throw new Error(
      `No weights found. Make sure you've run updateSplitShares first.\n` +
      `Run: CUTOFF=${currentYear}-${currentMonth.toString().padStart(2, '0')} npx hardhat run scripts/update-split-shares.js --network ${network}`
    );
  }

  console.log(`✓ Found ${weights.length} members\n`);

  // Reconstruct the Split struct
  const recipients = weights.map(w => w.memberAddress);
  const allocations = weights.map(w => w.percentage);
  const totalAllocation = allocations.reduce((sum, alloc) => sum + alloc, 0n);
  const distributionIncentive = 0; // Use 0 as default, or parse from env

  const split = {
    recipients,
    allocations,
    totalAllocation,
    distributionIncentive
  };

  // Check token balance
  console.log(`Checking balance...`);
  let balance;

  if (token === hre.ethers.ZeroAddress) {
    // ETH balance
    balance = await hre.ethers.provider.getBalance(splitsWalletAddress);
    console.log(`Splits wallet ETH balance: ${hre.ethers.formatEther(balance)} ETH`);
  } else {
    // ERC20 balance
    const tokenContract = await hre.ethers.getContractAt(
      ["function balanceOf(address) view returns (uint256)", "function symbol() view returns (string)", "function decimals() view returns (uint8)"],
      token
    );

    try {
      balance = await tokenContract.balanceOf(splitsWalletAddress);
      const symbol = await tokenContract.symbol();
      const decimals = await tokenContract.decimals();
      console.log(`Splits wallet ${symbol} balance: ${hre.ethers.formatUnits(balance, decimals)} ${symbol}`);
    } catch (error) {
      console.log(`⚠️  Could not read token balance: ${error.message}`);
      balance = 0n;
    }
  }

  if (balance === 0n) {
    console.log(`\n⚠️  WARNING: Split wallet has zero balance for this token.`);
    console.log(`   Distribution will succeed but no funds will be distributed.\n`);
  }

  // Confirm action
  console.log(`⚠️  Ready to execute distribution.`);
  if (isL2Distribution) {
    console.log(`   This will trigger distribution on ${CHAIN_NAMES[l2ChainId] || `Chain ${l2ChainId}`} via cross-chain message.`);
    console.log(`   L2 messaging fee: ${hre.ethers.formatEther(l2Fee)} ETH\n`);
  } else {
    console.log(`   This will distribute funds to ${recipients.length} recipients on L1.\n`);
  }

  // Execute distribution
  console.log(`Executing distribution...`);

  try {
    let tx;

    if (isL2Distribution) {
      // L2 distribution via controller
      tx = await controller.distributeL2(
        l2ChainId,
        split,
        token,
        distributor,
        { value: l2Fee }
      );
    } else {
      // L1 distribution
      tx = await controller.distribute(
        split,
        token,
        distributor
      );
    }

    console.log(`Transaction sent: ${tx.hash}`);
    console.log(`Waiting for confirmation...`);

    const receipt = await tx.wait();

    console.log(`\n✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    // Parse events
    const iface = new hre.ethers.Interface([
      "event DistributionExecuted(address token, address distributor)"
    ]);

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === "DistributionExecuted") {
          console.log(`\n📊 Distribution Executed:`);
          console.log(`   Token: ${parsed.args.token}`);
          console.log(`   Distributor: ${parsed.args.distributor}`);
        }
      } catch (e) {
        // Not the event we're looking for
      }
    }

    if (isL2Distribution) {
      console.log(`\n⏳ Note: L2 distribution is being processed via cross-chain message.`);
      console.log(`   It may take several minutes to complete on the L2.`);
      console.log(`   Monitor the L2 controller for completion.`);
    }

  } catch (error) {
    console.error(`\n❌ Transaction failed:`, error.message);

    if (error.message.includes("Splits address not set")) {
      console.log(`\nPlease set the splits wallet address on the controller first.`);
    } else if (error.message.includes("L2 module not registered")) {
      console.log(`\nL2 module for chain ${l2ChainId} is not registered.`);
      console.log(`Register it first using the deployment scripts.`);
    }

    throw error;
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`✅ Distribution executed successfully!`);
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
