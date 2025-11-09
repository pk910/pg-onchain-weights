// Helper script to deploy L2 controllers after L1 deployment
// Usage: npx hardhat run scripts/deploy-l2-controller.js --network <l2Network>
// The script auto-detects L2 type and reads L1 module address from deployments.json

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const config = require("../deploy-config");

const DEPLOYMENT_STATE_FILE = path.join(__dirname, "..", "deployments.json");

async function main() {
  const network = hre.network.name;
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Deploying L2 Controller on ${network}`);
  console.log(`${"=".repeat(80)}\n`);

  // Determine L2 type from network
  let l2Type, l1Network;

  if (network === "baseSepolia" || network === "base") {
    l2Type = "base";
    l1Network = network === "baseSepolia" ? "sepolia" : "mainnet";
  } else if (network === "opSepolia" || network === "optimism") {
    l2Type = "optimism";
    l1Network = network === "opSepolia" ? "sepolia" : "mainnet";
  } else if (network === "arbSepolia" || network === "arbitrum") {
    l2Type = "arbitrum";
    l1Network = network === "arbSepolia" ? "sepolia" : "mainnet";
  } else {
    throw new Error(`Unsupported network: ${network}. Use baseSepolia, opSepolia, arbSepolia, base, optimism, or arbitrum`);
  }

  // Load deployment state to get L1 module address
  let deploymentState = {};
  if (fs.existsSync(DEPLOYMENT_STATE_FILE)) {
    const data = fs.readFileSync(DEPLOYMENT_STATE_FILE, "utf8");
    deploymentState = JSON.parse(data);
  }

  const l1ModuleAddress = deploymentState[l1Network]?.[`l2Module_${l2Type}`];
  if (!l1ModuleAddress) {
    throw new Error(
      `L1 module address not found in deployment state.\n` +
      `Expected: deployments.json -> ${l1Network} -> l2Module_${l2Type}\n` +
      `Please deploy L1 components first using: npx hardhat run scripts/deploy-full.js --network ${l1Network}`
    );
  }

  console.log(`L1 Network: ${l1Network}`);
  console.log(`L2 Type: ${l2Type}`);
  console.log(`L1 Module Address: ${l1ModuleAddress}`);

  // Get splits wallet from config
  const networkConfig = config[network];
  const splitsWallet = networkConfig?.splitsWallet;

  if (!splitsWallet) {
    throw new Error(
      `Splits wallet not configured for ${network}.\n` +
      `Please set it in deploy-config.js or via environment variable.`
    );
  }

  console.log(`Splits Wallet: ${splitsWallet}\n`);

  // Deploy appropriate controller
  let controller, address;

  if (l2Type === "arbitrum") {
    console.log("Deploying PGL2ControllerArbitrum...");
    const PGL2ControllerArbitrum = await hre.ethers.getContractFactory("PGL2ControllerArbitrum");
    controller = await PGL2ControllerArbitrum.deploy(l1ModuleAddress, splitsWallet);
    await controller.waitForDeployment();
  } else {
    // OP Stack (Base or Optimism)
    console.log("Deploying PGL2ControllerOPStack...");
    const PGL2ControllerOPStack = await hre.ethers.getContractFactory("PGL2ControllerOPStack");
    controller = await PGL2ControllerOPStack.deploy(
      networkConfig.l2CrossDomainMessenger,
      l1ModuleAddress,
      splitsWallet
    );
    await controller.waitForDeployment();
  }

  address = await controller.getAddress();

  const [deployer] = await hre.ethers.getSigners();
  console.log("\n✅ Deployment successful!");
  console.log(`${"=".repeat(80)}`);
  console.log(`L2 Controller:  ${address}`);
  console.log(`Deployed by:    ${deployer.address}`);

  // Wait for contract to be available and query state
  try {
    console.log(`Owner:          ${await controller.owner()}`);
    console.log(`L1 Module:      ${await controller.l1Module()}`);

    if (l2Type === "arbitrum") {
      console.log(`Aliased L1:     ${await controller.getAliasedL1Module()}`);
    }
  } catch (error) {
    console.log(`⚠️  Contract deployed but state not yet readable (this is normal)`);
    console.log(`   Transaction may still be confirming...`);
  }

  console.log(`${"=".repeat(80)}\n`);

  // Save to deployment state
  if (!deploymentState[l1Network]) {
    deploymentState[l1Network] = {};
  }
  deploymentState[l1Network][`l2Controller_${l2Type}`] = address;

  fs.writeFileSync(
    DEPLOYMENT_STATE_FILE,
    JSON.stringify(deploymentState, null, 2)
  );
  console.log(`✅ Saved to deployment state: ${DEPLOYMENT_STATE_FILE}\n`);

  // Next steps
  console.log("📋 Next steps:");
  console.log(`1. Switch back to L1 network (${l1Network})`);
  console.log(`2. Run configuration command:\n`);
  console.log(`   L2_TYPE=${l2Type} npx hardhat run scripts/3-configure-l2-module.js --network ${l1Network}\n`);

  return address;
}

// Execute deployment
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;
