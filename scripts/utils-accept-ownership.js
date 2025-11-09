// Script to accept ownership of splits wallet through the controller
// This is needed for two-step ownership transfers
// Usage: npx hardhat run scripts/accept-splits-ownership.js --network <network>

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYMENT_STATE_FILE = path.join(__dirname, "..", "deployments.json");

async function main() {
  const network = hre.network.name;
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Accepting Splits Ownership on ${network}`);
  console.log(`${"=".repeat(80)}\n`);

  // Load deployment state
  let deploymentState = {};
  if (fs.existsSync(DEPLOYMENT_STATE_FILE)) {
    const data = fs.readFileSync(DEPLOYMENT_STATE_FILE, "utf8");
    deploymentState = JSON.parse(data);
  }

  // Determine if this is L1 or L2
  const l1Networks = ["sepolia", "mainnet"];
  const isL1 = l1Networks.includes(network);

  let controllerAddress, controllerType;

  if (isL1) {
    // L1 Controller
    const l1Network = network;
    controllerAddress = deploymentState[l1Network]?.l1Controller;
    controllerType = "PGL1SplitController";

    if (!controllerAddress) {
      throw new Error(
        `L1 Controller address not found in deployment state for ${l1Network}\n` +
        `Please deploy L1 controller first.`
      );
    }
  } else {
    // L2 Controller - need to determine which L2
    let l1Network, l2Type;

    if (network === "baseSepolia" || network === "base") {
      l2Type = "base";
      l1Network = network === "baseSepolia" ? "sepolia" : "mainnet";
      controllerType = "PGL2ControllerOPStack";
    } else if (network === "opSepolia" || network === "optimism") {
      l2Type = "optimism";
      l1Network = network === "opSepolia" ? "sepolia" : "mainnet";
      controllerType = "PGL2ControllerOPStack";
    } else if (network === "arbSepolia" || network === "arbitrum") {
      l2Type = "arbitrum";
      l1Network = network === "arbSepolia" ? "sepolia" : "mainnet";
      controllerType = "PGL2ControllerArbitrum";
    } else {
      throw new Error(`Unsupported network: ${network}`);
    }

    controllerAddress = deploymentState[l1Network]?.[`l2Controller_${l2Type}`];

    if (!controllerAddress) {
      throw new Error(
        `L2 Controller address not found in deployment state.\n` +
        `Expected: deployments.json -> ${l1Network} -> l2Controller_${l2Type}`
      );
    }
  }

  console.log(`Controller Type: ${controllerType}`);
  console.log(`Controller Address: ${controllerAddress}\n`);

  const controller = await hre.ethers.getContractAt(controllerType, controllerAddress);

  // Get the splits wallet address
  let splitsWalletAddress;
  try {
    if (isL1) {
      splitsWalletAddress = await controller.splitsWallet();
    } else {
      splitsWalletAddress = await controller.splitsAddress();
    }
  } catch (error) {
    throw new Error(`Failed to get splits wallet address: ${error.message}`);
  }

  console.log(`Splits Wallet: ${splitsWalletAddress}\n`);

  if (splitsWalletAddress === hre.ethers.ZeroAddress) {
    throw new Error("Splits wallet not set on controller. Please configure it first.");
  }

  // Check current owner of splits wallet
  const splitsWallet = await hre.ethers.getContractAt("ISplitWalletV2", splitsWalletAddress);
  let currentOwner;
  try {
    currentOwner = await splitsWallet.owner();
    console.log(`Current Splits Owner: ${currentOwner}`);
  } catch (error) {
    console.log(`⚠️  Could not read current owner: ${error.message}`);
  }

  // Prepare the acceptOwnership call
  // First, try to encode the acceptOwnership() call
  const acceptOwnershipData = hre.ethers.id("acceptOwnership()").slice(0, 10); // Function selector

  console.log(`\nPreparing to accept ownership...`);
  console.log(`Function: acceptOwnership()`);
  console.log(`Calldata: ${acceptOwnershipData}\n`);

  // Create the Call struct
  const call = {
    to: splitsWalletAddress,
    value: 0,
    data: acceptOwnershipData
  };

  console.log(`Executing acceptOwnership through controller...`);

  try {
    let tx;
    if (isL1) {
      // Use execCalls on L1 controller
      tx = await controller.execCalls([call]);
    } else {
      // L2 controllers don't have splits wallet execCalls, they manage it differently
      throw new Error(
        `L2 controllers cannot execute arbitrary calls on splits wallet.\n` +
        `Ownership transfer on L2 must be done differently.\n` +
        `You may need to accept ownership directly or through a different mechanism.`
      );
    }

    console.log(`Transaction sent: ${tx.hash}`);
    console.log(`Waiting for confirmation...`);

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}\n`);

    // Verify new owner
    try {
      const newOwner = await splitsWallet.owner();
      console.log(`New Splits Owner: ${newOwner}`);

      if (newOwner.toLowerCase() === controllerAddress.toLowerCase()) {
        console.log(`\n✅ SUCCESS: Controller now owns the splits wallet!`);
      } else {
        console.log(`\n⚠️  WARNING: Ownership may not have transferred correctly.`);
        console.log(`   Expected: ${controllerAddress}`);
        console.log(`   Actual:   ${newOwner}`);
      }
    } catch (error) {
      console.log(`⚠️  Could not verify new owner: ${error.message}`);
    }

  } catch (error) {
    console.error(`\n❌ Error executing acceptOwnership:`, error.message);

    // Check if it's because acceptOwnership doesn't exist
    if (error.message.includes("reverted") || error.message.includes("execution reverted")) {
      console.log(`\nThis could mean:`);
      console.log(`1. No pending ownership transfer exists`);
      console.log(`2. The splits wallet uses direct ownership transfer (not two-step)`);
      console.log(`3. The acceptOwnership function has a different signature\n`);
      console.log(`Alternative: Try initiating ownership transfer FROM the current owner TO the controller`);
    }

    throw error;
  }

  console.log(`\n${"=".repeat(80)}\n`);
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
