// 1-deploy.js - Master Deployment Script
// Deploys and configures all contracts across L1 and multiple L2s in one go
// Usage: npx hardhat run scripts/1-deploy.js --network <sepolia|mainnet>

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);
const config = require("../deploy-config");
const deployPlan = require("../deploy-plan");

// Network mapping for testnets
const NETWORK_MAPPINGS = {
  sepolia: {
    l1: "sepolia",
    l2Networks: {
      base: "baseSepolia",
      optimism: "opSepolia",
      arbitrum: "arbSepolia",
    },
  },
  mainnet: {
    l1: "mainnet",
    l2Networks: {
      base: "base",
      optimism: "optimism",
      arbitrum: "arbitrum",
    },
  },
};

// Deployment state file
const DEPLOYMENT_STATE_FILE = path.join(__dirname, "..", "deployments.json");

class DeploymentOrchestrator {
  constructor(network) {
    this.l1Network = network;
    this.networkMapping = NETWORK_MAPPINGS[network];

    if (!this.networkMapping) {
      throw new Error(`Network ${network} not supported. Use 'sepolia' or 'mainnet'`);
    }

    this.plan = deployPlan[network];
    if (!this.plan) {
      throw new Error(`No deployment plan found for ${network}`);
    }

    this.state = this.loadState();
    this.deployedContracts = {};
  }

  // Load existing deployment state
  loadState() {
    if (fs.existsSync(DEPLOYMENT_STATE_FILE)) {
      const data = fs.readFileSync(DEPLOYMENT_STATE_FILE, "utf8");
      return JSON.parse(data);
    }
    return {};
  }

  // Save deployment state
  saveState() {
    if (!this.state[this.l1Network]) {
      this.state[this.l1Network] = {};
    }

    // Merge new deployments into state
    Object.assign(this.state[this.l1Network], this.deployedContracts);

    fs.writeFileSync(
      DEPLOYMENT_STATE_FILE,
      JSON.stringify(this.state, null, 2)
    );
    console.log(`\n✅ Deployment state saved to ${DEPLOYMENT_STATE_FILE}`);
  }

  // Deploy or get existing contract on current network
  async deployOrUseExisting(contractName, deployFn, planValue, stateKey) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📋 ${contractName}`);
    console.log(`${"=".repeat(60)}`);

    // Check if we should skip
    if (planValue === "skip") {
      console.log(`⏭️  Skipping ${contractName} - can be deployed later`);
      return null;
    }

    // Check if we should use existing
    if (planValue !== "deploy") {
      console.log(`✓ Using existing ${contractName} at: ${planValue}`);
      return planValue;
    }

    // Check if already deployed in this session
    if (this.deployedContracts[stateKey]) {
      console.log(`✓ Already deployed in this session: ${this.deployedContracts[stateKey]}`);
      return this.deployedContracts[stateKey];
    }

    // Check saved state
    if (this.state[this.l1Network]?.[stateKey]) {
      console.log(`ℹ Found in deployment state: ${this.state[this.l1Network][stateKey]}`);
      const answer = await this.promptUser(
        `Use existing deployment? (y/n): `
      );

      if (answer.toLowerCase() === "y") {
        return this.state[this.l1Network][stateKey];
      }
    }

    // Deploy new contract
    console.log(`🚀 Deploying new ${contractName}...`);
    const address = await deployFn();
    this.deployedContracts[stateKey] = address;
    console.log(`✅ Deployed ${contractName} to: ${address}`);

    return address;
  }

  // Deploy on a different network using child process
  async deployOnNetwork(network, scriptName, envVars = {}) {
    console.log(`\n🔄 Switching to network: ${network}`);

    const env = {
      ...process.env,
      ...envVars,
    };

    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}="${value}"`)
      .join(" ");

    const command = `${envString} npx hardhat run scripts/${scriptName} --network ${network}`;

    try {
      const { stdout, stderr } = await execAsync(command, { env });
      console.log(stdout);
      if (stderr) console.error(stderr);

      // Extract address from output (assuming last line contains address)
      const addressMatch = stdout.match(/0x[a-fA-F0-9]{40}/g);
      if (addressMatch) {
        return addressMatch[addressMatch.length - 1];
      }

      throw new Error("Could not extract deployed address from output");
    } catch (error) {
      console.error(`Error deploying on ${network}:`, error.message);
      throw error;
    }
  }

  // Simple prompt for user input (for interactive confirmations)
  async promptUser(question) {
    // For non-interactive mode, just return 'n'
    return 'n';
  }

  // ========================================
  // L1 Deployment Functions
  // ========================================

  async deployRegistry() {
    return await this.deployOrUseExisting(
      "PGMemberRegistry",
      async () => {
        const Registry = await hre.ethers.getContractFactory("PGMemberRegistry");
        const registry = await Registry.deploy();
        await registry.waitForDeployment();
        return await registry.getAddress();
      },
      this.plan.l1.registry,
      "registry"
    );
  }

  async deployL1Controller() {
    return await this.deployOrUseExisting(
      "PGL1SplitController",
      async () => {
        const Controller = await hre.ethers.getContractFactory("PGL1SplitController");
        const controller = await Controller.deploy();
        await controller.waitForDeployment();
        return await controller.getAddress();
      },
      this.plan.l1.controller,
      "l1Controller"
    );
  }

  async deployL2ModuleOPStack(l2Name) {
    const l2NetworkKey = this.networkMapping.l2Networks[l2Name];
    const l2Config = config[l2NetworkKey];

    return await this.deployOrUseExisting(
      `PGL2ModuleOPStack (${l2Name})`,
      async () => {
        const Module = await hre.ethers.getContractFactory("PGL2ModuleOPStack");
        const module = await Module.deploy(
          l2Config.l1CrossDomainMessenger,
          l2Config.chainId,
          l2Config.name
        );
        await module.waitForDeployment();
        return await module.getAddress();
      },
      this.plan.l2[l2Name].module,
      `l2Module_${l2Name}`
    );
  }

  async deployL2ModuleArbitrum() {
    const l2NetworkKey = this.networkMapping.l2Networks.arbitrum;
    const l2Config = config[l2NetworkKey];

    return await this.deployOrUseExisting(
      "PGL2ModuleArbitrum",
      async () => {
        const Module = await hre.ethers.getContractFactory("PGL2ModuleArbitrum");
        const module = await Module.deploy(
          l2Config.inbox,
          l2Config.chainId,
          l2Config.name
        );
        await module.waitForDeployment();
        return await module.getAddress();
      },
      this.plan.l2.arbitrum.module,
      "l2Module_arbitrum"
    );
  }

  // ========================================
  // Configuration Functions
  // ========================================

  async configureL1Controller(controllerAddress, registryAddress, splitsWallet) {
    console.log(`\n📝 Configuring L1 Controller...`);

    const controller = await hre.ethers.getContractAt(
      "PGL1SplitController",
      controllerAddress
    );

    // Set Member Registry (if provided)
    if (registryAddress) {
      const currentRegistry = await controller.memberRegistry();
      if (currentRegistry === hre.ethers.ZeroAddress) {
        console.log(`  Setting Member Registry: ${registryAddress}`);
        const tx = await controller.setMemberRegistry(registryAddress);
        await tx.wait();
        console.log(`  ✅ Member Registry set`);
      } else {
        console.log(`  ℹ Member Registry already set: ${currentRegistry}`);
      }
    } else {
      console.log(`  ⏭️  Member Registry skipped - can be set later with setMemberRegistry()`);
    }

    // Set Splits Wallet
    if (splitsWallet) {
      const currentSplits = await controller.splitsWallet();
      if (currentSplits === hre.ethers.ZeroAddress) {
        console.log(`  Setting Splits Wallet: ${splitsWallet}`);
        const tx = await controller.setSplitsAddress(splitsWallet);
        await tx.wait();
        console.log(`  ✅ Splits Wallet set`);
      } else {
        console.log(`  ℹ Splits Wallet already set: ${currentSplits}`);
      }
    }
  }

  async configureL2Module(moduleAddress, l1ControllerAddress, l2ControllerAddress, chainId, l2Name) {
    console.log(`\n📝 Configuring L2 Module for ${l2Name}...`);

    const module = await hre.ethers.getContractAt(
      l2Name === "arbitrum" ? "PGL2ModuleArbitrum" : "PGL2ModuleOPStack",
      moduleAddress
    );

    // Set L1 Controller
    const currentL1Controller = await module.l1Controller();
    if (currentL1Controller === hre.ethers.ZeroAddress) {
      console.log(`  Setting L1 Controller: ${l1ControllerAddress}`);
      const tx = await module.setL1Controller(l1ControllerAddress);
      await tx.wait();
      console.log(`  ✅ L1 Controller set`);
    } else {
      console.log(`  ℹ L1 Controller already set: ${currentL1Controller}`);
    }

    // Set L2 Controller
    const currentL2Controller = await module.l2Controller();
    if (currentL2Controller === hre.ethers.ZeroAddress) {
      console.log(`  Setting L2 Controller: ${l2ControllerAddress}`);
      const tx = await module.setL2Controller(l2ControllerAddress);
      await tx.wait();
      console.log(`  ✅ L2 Controller set`);
    } else {
      console.log(`  ℹ L2 Controller already set: ${currentL2Controller}`);
    }
  }

  async registerL2ModuleWithL1Controller(l1ControllerAddress, chainId, moduleAddress, l2Name) {
    console.log(`\n📝 Registering ${l2Name} module with L1 Controller...`);

    const controller = await hre.ethers.getContractAt(
      "PGL1SplitController",
      l1ControllerAddress
    );

    // Check if already registered
    try {
      const existingModule = await controller.l2Modules(chainId);
      if (existingModule !== hre.ethers.ZeroAddress) {
        console.log(`  ℹ Module already registered for chain ${chainId}: ${existingModule}`);
        return;
      }
    } catch (error) {
      // Not registered yet
    }

    console.log(`  Registering module for chain ${chainId}: ${moduleAddress}`);
    const tx = await controller.addL2Module(chainId, moduleAddress);
    await tx.wait();
    console.log(`  ✅ Module registered`);
  }

  // ========================================
  // Main Deployment Flow
  // ========================================

  async run() {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🚀 PROTOCOL GUILD DEPLOYMENT - ${this.l1Network.toUpperCase()}`);
    console.log(`${"=".repeat(80)}\n`);

    const [deployer] = await hre.ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);

    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH`);

    // ========================================
    // PHASE 1: Deploy L1 Components
    // ========================================
    console.log(`\n\n${"=".repeat(80)}`);
    console.log(`PHASE 1: L1 COMPONENTS (${this.l1Network})`);
    console.log(`${"=".repeat(80)}`);

    const registryAddress = await this.deployRegistry();
    const l1ControllerAddress = await this.deployL1Controller();

    // Configure L1 Controller
    await this.configureL1Controller(
      l1ControllerAddress,
      registryAddress,
      this.plan.l1.splitsWallet
    );

    // ========================================
    // PHASE 2: Deploy L2 Modules (on L1)
    // ========================================
    console.log(`\n\n${"=".repeat(80)}`);
    console.log(`PHASE 2: L2 MODULES (on ${this.l1Network})`);
    console.log(`${"=".repeat(80)}`);

    const l2Modules = {};
    const l2Configs = {};

    // Deploy modules for each enabled L2
    for (const [l2Name, l2Plan] of Object.entries(this.plan.l2)) {
      if (!l2Plan.enabled) {
        console.log(`\n⏭️  Skipping ${l2Name} (disabled in plan)`);
        continue;
      }

      const l2NetworkKey = this.networkMapping.l2Networks[l2Name];
      l2Configs[l2Name] = config[l2NetworkKey];

      if (l2Name === "arbitrum") {
        l2Modules[l2Name] = await this.deployL2ModuleArbitrum();
      } else {
        l2Modules[l2Name] = await this.deployL2ModuleOPStack(l2Name);
      }
    }

    // ========================================
    // Save State & Summary
    // ========================================
    this.saveState();

    console.log(`\n\n${"=".repeat(80)}`);
    console.log(`✅ L1 DEPLOYMENT COMPLETE`);
    console.log(`${"=".repeat(80)}\n`);

    console.log(`📦 Deployed Contracts:\n`);
    console.log(`L1 (${this.l1Network}):`);
    if (registryAddress) {
      console.log(`  Registry:        ${registryAddress}`);
    } else {
      console.log(`  Registry:        (skipped - deploy later with 1b-deploy-registry.js)`);
    }
    console.log(`  L1 Controller:   ${l1ControllerAddress}`);

    console.log(`\nL2 Modules (on ${this.l1Network}):`);
    for (const [l2Name, address] of Object.entries(l2Modules)) {
      console.log(`  ${l2Name.padEnd(12)} ${address}`);
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log(`📋 NEXT STEPS`);
    console.log(`${"=".repeat(80)}\n`);

    const enabledL2s = Object.keys(l2Modules);

    if (enabledL2s.length > 0) {
      console.log(`1. Deploy L2 Controllers on each L2 network:\n`);
      for (const l2Name of enabledL2s) {
        const l2NetworkKey = this.networkMapping.l2Networks[l2Name];
        console.log(`   npx hardhat run scripts/2-deploy-l2-controller.js --network ${l2NetworkKey}`);
      }

      console.log(`\n2. Configure each L2 module (after L2 controllers are deployed):\n`);
      for (const l2Name of enabledL2s) {
        console.log(`   L2_TYPE=${l2Name} npx hardhat run scripts/3-configure-l2-module.js --network ${this.l1Network}`);
      }
    } else {
      console.log(`No L2 modules enabled. Deployment complete!`);
    }

    console.log(`\n${"=".repeat(80)}\n`);
  }
}

// ========================================
// Main Execution
// ========================================

async function main() {
  const network = hre.network.name;

  console.log(`Starting deployment on network: ${network}`);

  const orchestrator = new DeploymentOrchestrator(network);
  await orchestrator.run();
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
