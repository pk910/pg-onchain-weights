const hre = require("hardhat");

async function main() {
  console.log("Deploying PGWeights contract...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // Deploy contract
  const PGWeights = await hre.ethers.getContractFactory("PGWeights");
  const pgWeights = await PGWeights.deploy();
  await pgWeights.waitForDeployment();

  const address = await pgWeights.getAddress();
  console.log("PGWeights deployed to:", address);

  // Verify deployment
  const owner = await pgWeights.owner();
  console.log("Contract owner:", owner);

  return address;
}

// Execute if run directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;
