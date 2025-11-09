// Helper script to configure L2 modules after L2 controller deployment
// Usage: L2_TYPE=<type> npx hardhat run scripts/3-configure-l2-module.js --network <l1Network>
// Example: L2_TYPE=base npx hardhat run scripts/3-configure-l2-module.js --network sepolia

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const config = require("../deploy-config");

const DEPLOYMENT_STATE_FILE = path.join(__dirname, "..", "deployments.json");

async function main() {
  const network = hre.network.name;
  const l2Type = process.argv[2] || process.env.L2_TYPE;

  if (!l2Type) {
    console.error("Usage: L2_TYPE=<type> npx hardhat run scripts/3-configure-l2-module.js --network <l1Network>");
    console.error("Example: L2_TYPE=base npx hardhat run scripts/3-configure-l2-module.js --network sepolia");
    process.exit(1);
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Configuring L2 Module for ${l2Type}`);
  console.log(`${"=".repeat(80)}\n`);

  // Load deployment state
  let deploymentState = {};
  if (fs.existsSync(DEPLOYMENT_STATE_FILE)) {
    const data = fs.readFileSync(DEPLOYMENT_STATE_FILE, "utf8");
    deploymentState = JSON.parse(data);
  }

  const l1ControllerAddress = deploymentState[network]?.l1Controller;
  const l2ModuleAddress = deploymentState[network]?.[`l2Module_${l2Type}`];

  // Read L2 controller address from deployment state (can be overridden via env var)
  let l2ControllerAddress = process.env.L2_CONTROLLER_ADDRESS || deploymentState[network]?.[`l2Controller_${l2Type}`];

  if (!l1ControllerAddress || !l2ModuleAddress) {
    throw new Error(
      `Missing deployment addresses in state.\n` +
      `Expected: deployments.json -> ${network} -> l1Controller & l2Module_${l2Type}\n` +
      `Please deploy L1 components first.`
    );
  }

  if (!l2ControllerAddress) {
    throw new Error(
      `L2 controller address not found.\n` +
      `Expected: deployments.json -> ${network} -> l2Controller_${l2Type}\n` +
      `Please deploy L2 controller first using script 2-deploy-l2-controller.js`
    );
  }

  console.log(`L1 Controller:   ${l1ControllerAddress}`);
  console.log(`L2 Module:       ${l2ModuleAddress}`);
  console.log(`L2 Controller:   ${l2ControllerAddress}\n`);

  // Get the appropriate contract type
  const contractType = l2Type === "arbitrum" ? "PGL2ModuleArbitrum" : "PGL2ModuleOPStack";
  const module = await hre.ethers.getContractAt(contractType, l2ModuleAddress);

  // Get chain ID for this L2
  const networkMapping = {
    sepolia: { base: "baseSepolia", optimism: "opSepolia", arbitrum: "arbSepolia" },
    mainnet: { base: "base", optimism: "optimism", arbitrum: "arbitrum" },
  };

  const l2NetworkKey = networkMapping[network]?.[l2Type];
  const l2Config = config[l2NetworkKey];
  const chainId = l2Config?.chainId;

  if (!chainId) {
    throw new Error(`Could not determine chain ID for ${l2Type}`);
  }

  console.log(`Chain ID: ${chainId}\n`);

  // Step 1: Set L1 Controller on L2 Module (if not set)
  console.log("Step 1: Setting L1 Controller on L2 Module...");
  const currentL1Controller = await module.l1Controller();
  if (currentL1Controller === hre.ethers.ZeroAddress) {
    const tx1 = await module.setL1Controller(l1ControllerAddress);
    await tx1.wait();
    console.log("  ✅ L1 Controller set on L2 Module");
  } else {
    console.log(`  ℹ L1 Controller already set: ${currentL1Controller}`);
  }

  // Step 2: Set L2 Controller on L2 Module (if not set)
  console.log("\nStep 2: Setting L2 Controller on L2 Module...");
  const currentL2Controller = await module.l2Controller();
  if (currentL2Controller === hre.ethers.ZeroAddress) {
    const tx2 = await module.setL2Controller(l2ControllerAddress);
    await tx2.wait();
    console.log("  ✅ L2 Controller set on L2 Module");
  } else {
    console.log(`  ℹ L2 Controller already set: ${currentL2Controller}`);
  }

  // Step 3: Register L2 Module with L1 Controller
  console.log("\nStep 3: Registering L2 Module with L1 Controller...");
  const l1Controller = await hre.ethers.getContractAt(
    "PGL1SplitController",
    l1ControllerAddress
  );

  const existingModule = await l1Controller.l2Modules(chainId);

  if (existingModule !== hre.ethers.ZeroAddress) {
    console.log(`  ℹ Module already registered for chain ${chainId}: ${existingModule}`);

    // Check if it's a different address
    if (existingModule.toLowerCase() !== l2ModuleAddress.toLowerCase()) {
      console.log(`  ⚠️  The registered module address differs from the one you're configuring:`);
      console.log(`     Current:  ${existingModule}`);
      console.log(`     New:      ${l2ModuleAddress}\n`);

      const readline = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        readline.question("Do you want to override and replace the existing module? (yes/no): ", resolve);
      });
      readline.close();

      if (answer.toLowerCase() === "yes") {
        // Remove the old module first
        console.log(`\n  Removing old module ${existingModule}...`);
        const removeTx = await l1Controller.removeL2Module(chainId);
        await removeTx.wait();
        console.log(`  ✅ Old module removed`);

        // Register the new module
        console.log(`\n  Registering new module ${l2ModuleAddress}...`);
        const addTx = await l1Controller.addL2Module(chainId, l2ModuleAddress);
        await addTx.wait();
        console.log(`  ✅ New L2 Module registered with L1 Controller`);
      } else {
        console.log(`  ⚠️  Keeping existing module. Configuration skipped.`);
      }
    } else {
      console.log(`  ✅ Module already registered with correct address`);
    }
  } else {
    // No module registered, add the new one
    console.log(`  Registering new module ${l2ModuleAddress}...`);
    const tx3 = await l1Controller.addL2Module(chainId, l2ModuleAddress);
    await tx3.wait();
    console.log(`  ✅ L2 Module registered with L1 Controller`);
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`✅ Configuration complete for ${l2Type}!`);
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
