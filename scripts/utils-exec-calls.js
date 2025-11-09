// Script to execute arbitrary calls through the L1 controller
// Usage: node scripts/exec-calls.js (interactive) or set env vars

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const DEPLOYMENT_STATE_FILE = path.join(__dirname, "..", "deployments.json");

// Create readline interface for interactive mode
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  const network = hre.network.name;
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Execute Calls through L1 Controller on ${network}`);
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
  if (!controllerAddress) {
    throw new Error(
      `L1 Controller address not found in deployment state for ${network}\n` +
      `Please deploy L1 controller first.`
    );
  }

  console.log(`L1 Controller: ${controllerAddress}\n`);

  const controller = await hre.ethers.getContractAt("PGL1SplitController", controllerAddress);

  // Get splits wallet
  const splitsWalletAddress = await controller.splitsWallet();
  console.log(`Splits Wallet: ${splitsWalletAddress}\n`);

  if (splitsWalletAddress === hre.ethers.ZeroAddress) {
    throw new Error("Splits wallet not set on controller.");
  }

  // Interactive mode to build calls
  console.log(`${"=".repeat(80)}`);
  console.log(`BUILD CALLS`);
  console.log(`${"=".repeat(80)}\n`);

  const calls = [];

  // Predefined common operations
  console.log(`Common operations:`);
  console.log(`1. Accept Ownership (acceptOwnership())`);
  console.log(`2. Transfer Ownership (transferOwnership(address))`);
  console.log(`3. Set Paused (setPaused(bool))`);
  console.log(`4. Custom call\n`);

  const choice = await question(`Select operation (1-4): `);

  let targetAddress = splitsWalletAddress;
  let calldata;

  switch (choice.trim()) {
    case "1":
      // Accept Ownership
      console.log(`\nAccepting ownership of splits wallet...`);
      calldata = hre.ethers.id("acceptOwnership()").slice(0, 10);
      break;

    case "2":
      // Transfer Ownership
      const newOwner = await question(`Enter new owner address: `);
      if (!hre.ethers.isAddress(newOwner)) {
        throw new Error("Invalid address");
      }
      console.log(`\nTransferring ownership to ${newOwner}...`);
      const iface = new hre.ethers.Interface(["function transferOwnership(address)"]);
      calldata = iface.encodeFunctionData("transferOwnership", [newOwner]);
      break;

    case "3":
      // Set Paused
      const pausedStr = await question(`Paused (true/false): `);
      const paused = pausedStr.toLowerCase() === "true";
      console.log(`\nSetting paused to ${paused}...`);
      const pauseIface = new hre.ethers.Interface(["function setPaused(bool)"]);
      calldata = pauseIface.encodeFunctionData("setPaused", [paused]);
      break;

    case "4":
      // Custom call
      targetAddress = await question(`Target contract address: `);
      if (!hre.ethers.isAddress(targetAddress)) {
        throw new Error("Invalid address");
      }
      const sig = await question(`Function signature (e.g., "myFunction(uint256,address)"): `);
      const argsStr = await question(`Arguments (comma-separated, leave empty if none): `);

      const args = argsStr.trim() ? argsStr.split(",").map(a => a.trim()) : [];
      const customIface = new hre.ethers.Interface([`function ${sig}`]);
      const functionName = sig.split("(")[0];
      calldata = customIface.encodeFunctionData(functionName, args);
      break;

    default:
      throw new Error("Invalid choice");
  }

  rl.close();

  calls.push({
    to: targetAddress,
    value: 0,
    data: calldata
  });

  console.log(`\n${"=".repeat(80)}`);
  console.log(`CALL DETAILS`);
  console.log(`${"=".repeat(80)}`);
  console.log(`Target: ${calls[0].to}`);
  console.log(`Value:  ${calls[0].value}`);
  console.log(`Data:   ${calls[0].data}`);
  console.log(`${"=".repeat(80)}\n`);

  // Ask for confirmation
  console.log(`⚠️  Review the call details above carefully!`);

  // Execute
  console.log(`\nExecuting call...`);

  try {
    const tx = await controller.execCalls(calls);
    console.log(`Transaction sent: ${tx.hash}`);
    console.log(`Waiting for confirmation...`);

    const receipt = await tx.wait();
    console.log(`\n✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);

    // Try to decode return data from logs if available
    if (receipt.logs && receipt.logs.length > 0) {
      console.log(`\nTransaction logs: ${receipt.logs.length} events emitted`);
    }

  } catch (error) {
    console.error(`\n❌ Transaction failed:`, error.message);

    if (error.data) {
      console.log(`Error data: ${error.data}`);
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
