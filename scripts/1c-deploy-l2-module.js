/**
 * @title Deploy Single L2 Module
 * @notice Deploys a single L2 module on L1 for cross-chain communication
 * @dev Use this when you need to deploy an additional L2 module after initial deployment
 *
 * Usage:
 *   L2_TYPE=arbitrum npx hardhat run scripts/1c-deploy-l2-module.js --network sepolia
 *   L2_TYPE=base npx hardhat run scripts/1c-deploy-l2-module.js --network sepolia
 *   L2_TYPE=optimism npx hardhat run scripts/1c-deploy-l2-module.js --network sepolia
 *
 * This script:
 *   1. Deploys the appropriate L2 module (PGL2ModuleArbitrum or PGL2ModuleOPStack)
 *   2. Optionally sets the L1 controller on the module if already deployed
 *   3. Updates deployments.json
 *
 * Environment Variables:
 *   - L2_TYPE: Type of L2 network (base, optimism, arbitrum) - REQUIRED
 *   - SET_CONTROLLER: Set to 'true' to automatically set L1 controller (optional)
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const config = require("../deploy-config.js");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying L2 Module using account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  const l2Type = process.env.L2_TYPE;
  const setController = process.env.SET_CONTROLLER === "true" || process.env.SET_CONTROLLER === "1";

  if (!l2Type) {
    console.error("Usage: L2_TYPE=<type> npx hardhat run scripts/1c-deploy-l2-module.js --network <network>");
    console.error("\nSupported L2 types:");
    console.error("  - arbitrum");
    console.error("  - base");
    console.error("  - optimism");
    console.error("\nExamples:");
    console.error("  L2_TYPE=arbitrum npx hardhat run scripts/1c-deploy-l2-module.js --network sepolia");
    console.error("  L2_TYPE=base npx hardhat run scripts/1c-deploy-l2-module.js --network mainnet");
    console.error("\nOptional: Set L1 controller automatically:");
    console.error("  L2_TYPE=arbitrum SET_CONTROLLER=true npx hardhat run scripts/1c-deploy-l2-module.js --network sepolia");
    process.exit(1);
  }

  // Validate L2 type
  const validTypes = ["arbitrum", "base", "optimism"];
  if (!validTypes.includes(l2Type)) {
    throw new Error(`Invalid L2_TYPE: ${l2Type}. Must be one of: ${validTypes.join(", ")}`);
  }

  const networkName = hre.network.name;

  // Only works on L1 networks
  const l1Networks = ["sepolia", "mainnet"];
  if (!l1Networks.includes(networkName)) {
    throw new Error(`This script only works on L1 networks (sepolia, mainnet). Current: ${networkName}`);
  }

  // Determine L2 network key based on L1 network and L2 type
  const l2NetworkMap = {
    sepolia: {
      arbitrum: "arbSepolia",
      base: "baseSepolia",
      optimism: "opSepolia"
    },
    mainnet: {
      arbitrum: "arbitrum",
      base: "base",
      optimism: "optimism"
    }
  };

  const l2NetworkKey = l2NetworkMap[networkName][l2Type];
  const l2Config = config[l2NetworkKey];

  if (!l2Config) {
    throw new Error(`No configuration found for ${l2Type} on ${networkName}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Deploying ${l2Type} L2 Module on ${networkName}`);
  console.log("=".repeat(60));
  console.log("\nL2 Configuration:");
  console.log(`  Chain ID: ${l2Config.chainId}`);
  console.log(`  Name: ${l2Config.name}`);
  if (l2Type === "arbitrum") {
    console.log(`  Inbox: ${l2Config.inbox}`);
  } else {
    console.log(`  L1 CrossDomainMessenger: ${l2Config.l1CrossDomainMessenger}`);
  }

  // Load deployment state
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  let deploymentState = {};
  if (fs.existsSync(deploymentPath)) {
    deploymentState = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }

  // Initialize network state if needed
  if (!deploymentState[networkName]) {
    deploymentState[networkName] = {};
  }

  const moduleStateKey = `l2Module_${l2Type}`;

  // Check if module already deployed
  if (deploymentState[networkName][moduleStateKey]) {
    console.log(`\n⚠️  ${l2Type} L2 module already deployed at:`, deploymentState[networkName][moduleStateKey]);
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      readline.question("Deploy a new module anyway? (yes/no): ", resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== "yes") {
      console.log("Deployment cancelled.");
      process.exit(0);
    }
  }

  // Deploy the appropriate L2 module
  console.log(`\n🚀 Deploying ${l2Type} L2 Module...`);

  let moduleAddress;

  if (l2Type === "arbitrum") {
    // Deploy PGL2ModuleArbitrum
    const Module = await hre.ethers.getContractFactory("PGL2ModuleArbitrum");
    const module = await Module.deploy(
      l2Config.inbox,
      l2Config.chainId,
      l2Config.name
    );
    await module.waitForDeployment();
    moduleAddress = await module.getAddress();

    console.log("✅ PGL2ModuleArbitrum deployed to:", moduleAddress);
    console.log(`   Inbox: ${l2Config.inbox}`);
    console.log(`   Chain ID: ${l2Config.chainId}`);
    console.log(`   Name: ${l2Config.name}`);
  } else {
    // Deploy PGL2ModuleOPStack (for Base and Optimism)
    const Module = await hre.ethers.getContractFactory("PGL2ModuleOPStack");
    const module = await Module.deploy(
      l2Config.l1CrossDomainMessenger,
      l2Config.chainId,
      l2Config.name
    );
    await module.waitForDeployment();
    moduleAddress = await module.getAddress();

    console.log("✅ PGL2ModuleOPStack deployed to:", moduleAddress);
    console.log(`   L1 CrossDomainMessenger: ${l2Config.l1CrossDomainMessenger}`);
    console.log(`   Chain ID: ${l2Config.chainId}`);
    console.log(`   Name: ${l2Config.name}`);
  }

  // Optionally set L1 controller
  if (setController && deploymentState[networkName].l1Controller) {
    console.log("\n📝 Setting L1 Controller on module...");
    const module = await hre.ethers.getContractAt(
      l2Type === "arbitrum" ? "PGL2ModuleArbitrum" : "PGL2ModuleOPStack",
      moduleAddress
    );

    const l1ControllerAddress = deploymentState[networkName].l1Controller;
    console.log(`L1 Controller: ${l1ControllerAddress}`);

    const tx = await module.setL1Controller(l1ControllerAddress);
    console.log(`Transaction hash: ${tx.hash}`);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
  } else if (setController) {
    console.log("\n⚠️  SET_CONTROLLER=true but no L1 controller found in deployment state");
    console.log("You'll need to set the L1 controller manually later");
  }

  // Update deployment state
  console.log("\n💾 Updating deployment state...");
  deploymentState[networkName][moduleStateKey] = moduleAddress;

  fs.writeFileSync(
    deploymentPath,
    JSON.stringify(deploymentState, null, 2)
  );

  console.log("✅ Deployment state updated in deployments.json");

  console.log("\n" + "=".repeat(60));
  console.log("✅ L2 Module Deployment Complete!");
  console.log("=".repeat(60));
  console.log("\nDeployed Contract:");
  console.log(`  ${l2Type} L2 Module:`, moduleAddress);
  console.log(`  State key: ${moduleStateKey}`);

  console.log("\nNext steps:");
  console.log(`  1. Deploy L2 controller on ${l2Config.name}:`);
  console.log(`     npx hardhat run scripts/2-deploy-l2-controller.js --network ${l2NetworkKey}`);
  console.log(`  2. Configure L2 module (link controller & register with L1):`);
  console.log(`     L2_TYPE=${l2Type} npx hardhat run scripts/3-configure-l2-module.js --network ${networkName}`);
  if (!setController) {
    console.log(`  3. Optionally set L1 controller on module:`);
    console.log(`     Call setL1Controller() on the module at ${moduleAddress}`);
  }
  console.log(`  4. Fund the module for L2 messaging fees:`);
  console.log(`     Send ETH to ${moduleAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
