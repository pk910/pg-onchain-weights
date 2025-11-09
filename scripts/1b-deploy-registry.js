/**
 * @title Deploy Member Registry Later
 * @notice Deploys the PGMemberRegistry contract and configures it with the L1 controller
 * @dev Use this when you skipped registry deployment during initial setup
 *
 * Usage:
 *   npx hardhat run scripts/1b-deploy-registry.js --network sepolia
 *
 * This script:
 *   1. Deploys PGMemberRegistry
 *   2. Calls setMemberRegistry() on the L1 controller
 *   3. Updates deployments.json
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying Member Registry using account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // Load deployment state
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("deployments.json not found. Run initial deployment first.");
  }

  const deploymentState = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const networkName = hre.network.name;
  const addresses = deploymentState[networkName];

  if (!addresses || !addresses.l1Controller) {
    throw new Error(`L1 controller not found for network ${networkName}. Deploy L1 controller first.`);
  }

  console.log("\nL1 Controller:", addresses.l1Controller);

  // Check if registry already deployed
  if (addresses.registry && addresses.registry !== "skip") {
    console.log("\n⚠️  Registry already deployed at:", addresses.registry);
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      readline.question("Deploy a new registry anyway? (yes/no): ", resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== "yes") {
      console.log("Deployment cancelled.");
      process.exit(0);
    }
  }

  // Deploy Member Registry
  console.log("\n🚀 Deploying PGMemberRegistry...");
  const Registry = await hre.ethers.getContractFactory("PGMemberRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();

  console.log("✅ PGMemberRegistry deployed to:", registryAddress);

  // Configure L1 Controller
  console.log("\n📝 Configuring L1 Controller...");
  const controller = await hre.ethers.getContractAt(
    "PGL1SplitController",
    addresses.l1Controller
  );

  // Check current registry
  const currentRegistry = await controller.memberRegistry();
  console.log("Current registry:", currentRegistry);

  console.log("Setting member registry on L1 controller...");
  const tx = await controller.setMemberRegistry(registryAddress);
  console.log("Transaction hash:", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt.blockNumber);

  // Update deployment state
  console.log("\n💾 Updating deployment state...");
  deploymentState[networkName].registry = registryAddress;

  fs.writeFileSync(
    deploymentPath,
    JSON.stringify(deploymentState, null, 2)
  );

  console.log("✅ Deployment state updated in deployments.json");

  console.log("\n" + "=".repeat(60));
  console.log("✅ Member Registry Deployment Complete!");
  console.log("=".repeat(60));
  console.log("\nDeployed Contracts:");
  console.log("  PGMemberRegistry:", registryAddress);
  console.log("  L1 Controller:", addresses.l1Controller);
  console.log("\nNext steps:");
  console.log("  1. Import members: npx hardhat run scripts/4-import-members.js --network", networkName);
  console.log("  2. Update splits: npx hardhat run scripts/5-update-splits.js --network", networkName);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
