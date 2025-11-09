// Script to initiate ownership transfer of splits wallet
// Usage:
//   L1: NEW_OWNER=0x... npx hardhat run scripts/utils-transfer-ownership.js --network sepolia
//   L2: NEW_OWNER=0x... L2_CHAIN=42161 npx hardhat run scripts/utils-transfer-ownership.js --network sepolia
//
// Note: L1 transfers go through the L1 controller, L2 transfers call the L2 module directly

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYMENT_STATE_FILE = path.join(__dirname, "..", "deployments.json");

async function main() {
  const network = hre.network.name;
  const newOwner = process.env.NEW_OWNER;
  const l2ChainStr = process.env.L2_CHAIN;

  if (!newOwner) {
    console.error("Usage: NEW_OWNER=0x... [L2_CHAIN=<chainId>] npx hardhat run scripts/utils-transfer-ownership.js --network <network>");
    console.error("\nExamples:");
    console.error("  # Transfer L1 splits ownership");
    console.error("  NEW_OWNER=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb npx hardhat run scripts/utils-transfer-ownership.js --network sepolia");
    console.error("\n  # Transfer L2 splits ownership (calls L2 module directly)");
    console.error("  NEW_OWNER=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb L2_CHAIN=42161 npx hardhat run scripts/utils-transfer-ownership.js --network sepolia");
    console.error("\nNote: For L2 transfers, you must be the owner of the L2 module (not just the L1 controller)");
    process.exit(1);
  }

  if (!hre.ethers.isAddress(newOwner)) {
    throw new Error(`Invalid address: ${newOwner}`);
  }

  // Parse L2_CHAIN if present
  const l2Chain = l2ChainStr ? parseInt(l2ChainStr) : null;
  if (l2Chain !== null && (isNaN(l2Chain) || l2Chain < 1)) {
    throw new Error("Invalid L2_CHAIN. Must be a positive integer (1=L1, >1=L2 chain ID)");
  }

  const isL2Transfer = l2Chain !== null && l2Chain !== 1;

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Transfer Splits Ownership${isL2Transfer ? ` on L2 Chain ${l2Chain}` : ' on L1'}`);
  console.log(`${"=".repeat(80)}\n`);

  // Only works on L1 (we call L2 modules from L1)
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
  if (!controllerAddress) {
    throw new Error(
      `L1 Controller address not found in deployment state for ${network}\n` +
      `Please deploy L1 controller first.`
    );
  }

  console.log(`L1 Controller: ${controllerAddress}`);
  console.log(`New Owner: ${newOwner}`);
  if (isL2Transfer) {
    console.log(`Target Chain: L2 Chain ${l2Chain}\n`);
  } else {
    console.log(`Target Chain: L1\n`);
  }

  const controller = await hre.ethers.getContractAt("PGL1SplitController", controllerAddress);

  let l2ModuleAddress, l2Module;

  if (isL2Transfer) {
    // L2 transfer via L2 module (called directly, not through L1 controller)
    // Check that L2 module is registered
    const isRegistered = await controller.isL2ModuleRegistered(l2Chain);
    if (!isRegistered) {
      throw new Error(
        `L2 module not registered for chain ${l2Chain}\n` +
        `Please register the L2 module first using 3-configure-l2-module.js`
      );
    }

    l2ModuleAddress = await controller.l2Modules(l2Chain);
    console.log(`L2 Module: ${l2ModuleAddress}`);

    // Determine module type based on chain
    const arbitrumChains = [42161, 421614]; // Arbitrum One, Arbitrum Sepolia
    const isArbitrum = arbitrumChains.includes(l2Chain);
    const moduleType = isArbitrum ? "PGL2ModuleArbitrum" : "PGL2ModuleOPStack";

    l2Module = await hre.ethers.getContractAt(moduleType, l2ModuleAddress);

    // Check ownership of the module
    const moduleOwner = await l2Module.owner();
    const [signer] = await hre.ethers.getSigners();
    console.log(`Module Owner: ${moduleOwner}`);
    console.log(`Current Signer: ${signer.address}`);

    if (moduleOwner.toLowerCase() !== signer.address.toLowerCase()) {
      console.log(`\n⚠️  WARNING: You are not the owner of the L2 module!`);
      console.log(`   Module Owner: ${moduleOwner}`);
      console.log(`   Your Address: ${signer.address}`);
      console.log(`\nOnly the module owner can transfer L2 splits ownership.\n`);
      process.exit(1);
    }

    console.log(`\n⚠️  Note: L2 ownership transfer is cross-chain and may take time to finalize.\n`);

    console.log(`Initiating L2 ownership transfer to ${newOwner}...`);

  } else {
    // L1 transfer
    // Get splits wallet
    const splitsWalletAddress = await controller.splitsWallet();
    console.log(`L1 Splits Wallet: ${splitsWalletAddress}\n`);

    if (splitsWalletAddress === hre.ethers.ZeroAddress) {
      throw new Error("Splits wallet not set on controller.");
    }

    // Check current owner
    const splitsWallet = await hre.ethers.getContractAt("ISplitWalletV2", splitsWalletAddress);
    const currentOwner = await splitsWallet.owner();
    console.log(`Current Owner: ${currentOwner}`);

    if (currentOwner.toLowerCase() !== controllerAddress.toLowerCase()) {
      console.log(`\n⚠️  WARNING: Controller is not the current owner!`);
      console.log(`   Controller: ${controllerAddress}`);
      console.log(`   Current Owner: ${currentOwner}`);
      console.log(`\nCannot transfer ownership if controller is not the owner.`);
      console.log(`You may need to accept a pending transfer first.\n`);
      process.exit(1);
    }

    console.log(`\nTransferring L1 ownership to ${newOwner}...`);
  }

  try {
    let tx;
    if (isL2Transfer) {
      // Call transferSplitOwnership on L2 module directly
      tx = await l2Module.transferSplitOwnership(newOwner);
    } else {
      // Call transferSplitOwnership on L1 controller
      tx = await controller.transferSplitOwnership(newOwner);
    }

    console.log(`Transaction sent: ${tx.hash}`);
    console.log(`Waiting for confirmation...`);

    const receipt = await tx.wait();
    console.log(`\n✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}\n`);

    if (isL2Transfer) {
      console.log(`✅ L2 ownership transfer initiated!`);
      console.log(`\nThe cross-chain message has been sent to L2 chain ${l2Chain}.`);
      console.log(`The ownership transfer will be finalized on L2 when the message is processed.`);
      console.log(`This may take several minutes depending on the L2 network.\n`);
    } else {
      // Check if it's two-step transfer for L1
      const splitsWallet = await hre.ethers.getContractAt("ISplitWalletV2", await controller.splitsWallet());
      const ownerAfter = await splitsWallet.owner();
      if (ownerAfter.toLowerCase() === newOwner.toLowerCase()) {
        console.log(`✅ Ownership transferred successfully!`);
        console.log(`New Owner: ${ownerAfter}\n`);
      } else {
        console.log(`⚠️  Ownership transfer initiated (two-step process)`);
        console.log(`Current Owner: ${ownerAfter}`);
        console.log(`\nThe new owner must accept the transfer by calling:`);
        console.log(`  acceptOwnership() on the splits wallet\n`);
      }
    }

  } catch (error) {
    console.error(`\n❌ Transaction failed:`, error.message);
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
