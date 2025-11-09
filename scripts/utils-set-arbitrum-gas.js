// Script to set gas parameters for Arbitrum L2 module
// Usage: GAS_LIMIT=2000000 MAX_FEE=20 SUBMISSION_COST=0.002 npx hardhat run scripts/utils-set-arbitrum-gas.js --network sepolia
// Or to reset to defaults: RESET=true npx hardhat run scripts/utils-set-arbitrum-gas.js --network sepolia

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYMENT_STATE_FILE = path.join(__dirname, "..", "deployments.json");

async function main() {
  const network = hre.network.name;

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Set Arbitrum Module Gas Parameters on ${network}`);
  console.log(`${"=".repeat(80)}\n`);

  // Only works on L1 networks (where the L2 module is deployed)
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

  const moduleAddress = deploymentState[network]?.l2Module_arbitrum;

  if (!moduleAddress) {
    throw new Error(
      `Arbitrum L2 module not found in deployment state for ${network}\n` +
      `Please deploy the Arbitrum L2 module first.`
    );
  }

  console.log(`Arbitrum Module: ${moduleAddress}\n`);

  // Get the module contract
  const module = await hre.ethers.getContractAt("PGL2ModuleArbitrum", moduleAddress);

  // Check if we should reset to defaults
  const shouldReset = process.env.RESET === "true" || process.env.RESET === "1";

  if (shouldReset) {
    console.log(`Resetting gas parameters to defaults...`);

    const tx = await module.resetGasParameters();
    console.log(`Transaction sent: ${tx.hash}`);
    console.log(`Waiting for confirmation...`);

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}\n`);

    // Read the new values
    const gasLimit = await module.gasLimit();
    const maxFeePerGas = await module.maxFeePerGas();
    const maxSubmissionCost = await module.maxSubmissionCost();

    console.log(`Gas parameters reset to defaults:`);
    console.log(`  Gas Limit: ${gasLimit.toString()}`);
    console.log(`  Max Fee Per Gas: ${hre.ethers.formatUnits(maxFeePerGas, "gwei")} gwei`);
    console.log(`  Max Submission Cost: ${hre.ethers.formatEther(maxSubmissionCost)} ETH`);

  } else {
    // Parse parameters from environment
    const gasLimitStr = process.env.GAS_LIMIT;
    const maxFeeStr = process.env.MAX_FEE; // in gwei
    const submissionCostStr = process.env.SUBMISSION_COST; // in ETH

    if (!gasLimitStr || !maxFeeStr || !submissionCostStr) {
      console.error("Usage: GAS_LIMIT=<value> MAX_FEE=<gwei> SUBMISSION_COST=<eth> npx hardhat run scripts/utils-set-arbitrum-gas.js --network <network>");
      console.error("Example: GAS_LIMIT=2000000 MAX_FEE=20 SUBMISSION_COST=0.002 npx hardhat run scripts/utils-set-arbitrum-gas.js --network sepolia");
      console.error("\nOr to reset to defaults:");
      console.error("  RESET=true npx hardhat run scripts/utils-set-arbitrum-gas.js --network sepolia");
      console.error("\nCurrent values:");
      const gasLimit = await module.gasLimit();
      const maxFeePerGas = await module.maxFeePerGas();
      const maxSubmissionCost = await module.maxSubmissionCost();
      console.error(`  Gas Limit: ${gasLimit.toString()}`);
      console.error(`  Max Fee Per Gas: ${hre.ethers.formatUnits(maxFeePerGas, "gwei")} gwei`);
      console.error(`  Max Submission Cost: ${hre.ethers.formatEther(maxSubmissionCost)} ETH`);
      process.exit(1);
    }

    const gasLimit = BigInt(gasLimitStr);
    const maxFeePerGas = hre.ethers.parseUnits(maxFeeStr, "gwei");
    const maxSubmissionCost = hre.ethers.parseEther(submissionCostStr);

    console.log(`New gas parameters:`);
    console.log(`  Gas Limit: ${gasLimit.toString()}`);
    console.log(`  Max Fee Per Gas: ${hre.ethers.formatUnits(maxFeePerGas, "gwei")} gwei`);
    console.log(`  Max Submission Cost: ${hre.ethers.formatEther(maxSubmissionCost)} ETH\n`);

    // Calculate estimated max fee
    const estimatedMaxFee = maxSubmissionCost + (gasLimit * maxFeePerGas);
    console.log(`Estimated max fee per retryable ticket: ${hre.ethers.formatEther(estimatedMaxFee)} ETH\n`);

    console.log(`Setting gas parameters...`);

    const tx = await module.setGasParameters(gasLimit, maxFeePerGas, maxSubmissionCost);
    console.log(`Transaction sent: ${tx.hash}`);
    console.log(`Waiting for confirmation...`);

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}\n`);

    // Parse events
    const iface = new hre.ethers.Interface([
      "event GasParametersUpdated(uint256 gasLimit, uint256 maxFeePerGas, uint256 maxSubmissionCost)"
    ]);

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === "GasParametersUpdated") {
          console.log(`✅ Gas Parameters Updated:`);
          console.log(`   Gas Limit: ${parsed.args.gasLimit.toString()}`);
          console.log(`   Max Fee Per Gas: ${hre.ethers.formatUnits(parsed.args.maxFeePerGas, "gwei")} gwei`);
          console.log(`   Max Submission Cost: ${hre.ethers.formatEther(parsed.args.maxSubmissionCost)} ETH`);
        }
      } catch (e) {
        // Not the event we're looking for
      }
    }
  }

  // Check module balance
  const balance = await module.getBalance();
  console.log(`\nModule ETH balance: ${hre.ethers.formatEther(balance)} ETH`);

  const gasLimit = await module.gasLimit();
  const maxFeePerGas = await module.maxFeePerGas();
  const maxSubmissionCost = await module.maxSubmissionCost();
  const maxFeePerTicket = maxSubmissionCost + (gasLimit * maxFeePerGas);
  const ticketsAffordable = balance / maxFeePerTicket;

  console.log(`Can afford approximately ${Math.floor(Number(ticketsAffordable))} retryable tickets with current balance\n`);

  if (balance < maxFeePerTicket) {
    console.log(`⚠️  WARNING: Module balance is insufficient for even one retryable ticket!`);
    console.log(`   Please fund the module with at least ${hre.ethers.formatEther(maxFeePerTicket)} ETH\n`);
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
