/**
 * @title Transfer Test Split Ownership to Controller
 * @notice Transfers ownership of test splits wallets to their respective controllers
 * @dev Use this after creating test splits with utils-create-split.js
 *
 * Usage:
 *   # Transfer on L1 (Sepolia)
 *   npx hardhat run scripts/utils-transfer-test-split-ownership.js --network sepolia
 *
 *   # Transfer on L2 (Base Sepolia)
 *   npx hardhat run scripts/utils-transfer-test-split-ownership.js --network baseSepolia
 *
 * This script will:
 *   1. Read the splits wallet address from deploy-config.js
 *   2. Get the controller address from deployments.json
 *   3. Call transferOwnership() on the splits wallet to transfer to the controller
 *   4. (Optional) Then run utils-accept-ownership.js to complete the two-step transfer
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const config = require("../deploy-config");

const DEPLOYMENT_STATE_FILE = path.join(__dirname, "..", "deployments.json");

async function main() {
  const network = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Transfer Test Split Ownership on ${network}`);
  console.log(`${"=".repeat(80)}\n`);
  console.log(`Deployer: ${deployer.address}\n`);

  // Load deployment state
  let deploymentState = {};
  if (fs.existsSync(DEPLOYMENT_STATE_FILE)) {
    const data = fs.readFileSync(DEPLOYMENT_STATE_FILE, "utf8");
    deploymentState = JSON.parse(data);
  }

  // Get network config
  const networkConfig = config[network];
  if (!networkConfig) {
    throw new Error(`Network ${network} not found in deploy-config.js`);
  }

  // Get splits wallet address from config
  const splitsWalletAddress = networkConfig.splitsWallet;
  if (!splitsWalletAddress) {
    throw new Error(
      `Splits wallet not configured for ${network}.\n` +
      `Please set it in deploy-config.js or environment variable.`
    );
  }

  console.log(`Splits Wallet: ${splitsWalletAddress}`);

  // Determine if this is L1 or L2 and get controller address
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
    // L2 Controller - determine which L2
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
        `Expected: deployments.json -> ${l1Network} -> l2Controller_${l2Type}\n` +
        `Please deploy L2 controller first.`
      );
    }
  }

  console.log(`Controller Type: ${controllerType}`);
  console.log(`Controller Address: ${controllerAddress}\n`);

  // Get splits wallet contract
  const splitsWallet = await hre.ethers.getContractAt("ISplitWalletV2", splitsWalletAddress);

  // Check current owner
  let currentOwner;
  try {
    currentOwner = await splitsWallet.owner();
    console.log(`Current Splits Owner: ${currentOwner}`);
  } catch (error) {
    throw new Error(`Failed to read current owner: ${error.message}`);
  }

  // Verify deployer is the current owner
  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(
      `Deployer is not the current owner of the splits wallet.\n` +
      `Current Owner: ${currentOwner}\n` +
      `Deployer: ${deployer.address}\n` +
      `Only the current owner can transfer ownership.`
    );
  }

  // Check if already owned by controller
  if (currentOwner.toLowerCase() === controllerAddress.toLowerCase()) {
    console.log(`\n✅ Splits wallet is already owned by the controller!`);
    console.log(`Nothing to do.\n`);
    return;
  }

  // Transfer ownership
  console.log(`\n🔄 Transferring ownership to controller...`);
  console.log(`From: ${currentOwner}`);
  console.log(`To:   ${controllerAddress}\n`);

  try {
    const tx = await splitsWallet.transferOwnership(controllerAddress);
    console.log(`Transaction sent: ${tx.hash}`);
    console.log(`Etherscan: https://${network === "sepolia" ? "sepolia." : ""}etherscan.io/tx/${tx.hash}`);
    console.log(`Waiting for confirmation...`);

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}\n`);

    // Check if this is a two-step transfer
    const newOwner = await splitsWallet.owner();
    console.log(`Splits Owner After Transfer: ${newOwner}`);

    if (newOwner.toLowerCase() === controllerAddress.toLowerCase()) {
      console.log(`\n✅ SUCCESS: Ownership transferred directly!`);
      console.log(`Controller now owns the splits wallet.\n`);
    } else if (newOwner.toLowerCase() === currentOwner.toLowerCase()) {
      console.log(`\n⚠️  This appears to be a two-step ownership transfer.`);
      console.log(`The controller needs to accept ownership.\n`);
      console.log(`📋 Next step: Run the acceptance script:\n`);
      console.log(`   npx hardhat run scripts/utils-accept-ownership.js --network ${network}\n`);
    } else {
      console.log(`\n⚠️  WARNING: Unexpected ownership state.`);
      console.log(`   Expected: ${controllerAddress} (new owner)`);
      console.log(`   Or:       ${currentOwner} (pending acceptance)`);
      console.log(`   Actual:   ${newOwner}\n`);
    }

  } catch (error) {
    console.error(`\n❌ Error transferring ownership:`, error.message);

    if (error.message.includes("reverted")) {
      console.log(`\nPossible reasons:`);
      console.log(`1. Splits wallet doesn't support transferOwnership()`);
      console.log(`2. Contract is paused`);
      console.log(`3. Address validation failed\n`);
    }

    throw error;
  }

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
