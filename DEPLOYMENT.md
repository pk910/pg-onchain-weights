# Protocol Guild Deployment Guide

This guide covers the complete deployment process for the Protocol Guild Weight Tracking System across L1 and multiple L2 networks.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Deployment Methods](#deployment-methods)
  - [Automated Deployment](#automated-deployment)
- [Post-Deployment](#post-deployment)
- [Troubleshooting](#troubleshooting)

## Overview

The Protocol Guild system consists of:

**L1 Components (Ethereum):**
- `PGMemberRegistry`: Stores member data and calculates weights
- `PGL1SplitController`: Main controller for managing splits across L2s

**L2 Components (Base, Optimism, Arbitrum):**
- `PGL2Module*`: L1-side bridge module for each L2
- `PGL2Controller*`: L2-side controller that manages splits on L2

## Prerequisites

### Creating Test Splits (Testnet Only)

If you don't have SplitsV2 wallets on testnet, you have two options:

#### Option 1: Use 0xSplits UI (Recommended)

The easiest way to create test splits:

1. Go to https://app.splits.org/
2. Connect your wallet
3. Create a new Split with:
   - Your address: 99%
   - Dead address (`0x000000000000000000000000000000000000dEaD`): 1%
4. Set yourself as the controller/owner
5. Copy the split address for your deployment configuration

This ensures compatibility with the official SplitsV2 contracts.

#### Option 2: Use Script (Experimental)

Try the automated script (may require factory interface adjustments):

```bash
# Create split on Sepolia (L1)
npx hardhat run scripts/utils-create-split.js --network sepolia

# Create split on Base Sepolia (L2)
npx hardhat run scripts/utils-create-split.js --network baseSepolia
```

⚠️ **Note:** The script may need adjustments based on the actual factory interface. If it fails, use Option 1 (UI) instead.

1. **Environment Setup**

   Copy `.env.example` to `.env` and configure:

   ```bash
   # Private key for deployment
   PRIVATE_KEY=your_private_key_here

   # RPC URLs (optional, defaults provided)
   SEPOLIA_RPC_URL=https://rpc.sepolia.org
   OP_SEPOLIA_RPC_URL=https://sepolia.optimism.io
   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
   ARB_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

   # Splits wallet addresses
   SEPOLIA_SPLITS_WALLET=0x...           # L1 splits address
   BASE_SEPOLIA_SPLITS_WALLET=0x...      # Base splits address
   OP_SEPOLIA_SPLITS_WALLET=0x...        # Optimism splits address
   ARB_SEPOLIA_SPLITS_WALLET=0x...       # Arbitrum splits address
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Compile Contracts**

   ```bash
   npx hardhat compile
   ```

## Configuration

Edit `deploy-plan.js` to configure what to deploy:

```javascript
module.exports = {
  sepolia: {
    l1: {
      // Set to 'deploy' for new, 'skip' to deploy later, or provide existing address
      registry: 'deploy',           // or '0x123...' or 'skip'
      controller: 'deploy',          // or '0x456...'
      splitsWallet: process.env.SEPOLIA_SPLITS_WALLET,
    },

    l2: {
      base: {
        enabled: true,              // Enable/disable Base deployment
        module: 'deploy',           // L2 module on L1
        controller: 'deploy',       // L2 controller on Base
        splitsWallet: process.env.BASE_SEPOLIA_SPLITS_WALLET,
      },

      optimism: {
        enabled: true,
        module: 'deploy',
        controller: 'deploy',
        splitsWallet: process.env.OP_SEPOLIA_SPLITS_WALLET,
      },

      arbitrum: {
        enabled: true,
        module: 'deploy',
        controller: 'deploy',
        splitsWallet: process.env.ARB_SEPOLIA_SPLITS_WALLET,
      },
    },
  },
};
```

## Deployment Methods

### Automated Deployment

Deploys all L1 components and L2 modules in one go, with separate L2 controller deployments.

**Step 1: Deploy L1 Components and L2 Modules**

```bash
npx hardhat run scripts/1-deploy.js --network sepolia
```

This will:
- ✅ Deploy `PGMemberRegistry` (or use existing/skip)
- ✅ Deploy `PGL1SplitController` (or use existing)
- ✅ Configure L1 controller with registry and splits wallet
- ✅ Deploy all enabled L2 modules on L1
- ✅ Save deployment state to `deployments.json`
- ✅ Output next steps for L2 controller deployment

**Note:** L2 controllers can be reused across L1 redeployments. Configuration happens in Step 3.

**Step 2: Deploy L2 Controllers**

For each enabled L2, run the deployment on the respective L2 network:

```bash
# Deploy on Base Sepolia
npx hardhat run scripts/2-deploy-l2-controller.js --network baseSepolia

# Deploy on OP Sepolia
npx hardhat run scripts/2-deploy-l2-controller.js --network opSepolia

# Deploy on Arbitrum Sepolia
npx hardhat run scripts/2-deploy-l2-controller.js --network arbSepolia
```

The L2 controller script automatically:
- Reads the L1 module address from `deployments.json`
- Deploys the appropriate controller type
- Saves the address back to `deployments.json`

**Step 3: Configure L2 Modules**

After deploying each L2 controller, configure the L2 module:

```bash
# Configure Base module
L2_TYPE=base npx hardhat run scripts/3-configure-l2-module.js --network sepolia

# Configure Optimism module
L2_TYPE=optimism npx hardhat run scripts/3-configure-l2-module.js --network sepolia

# Configure Arbitrum module
L2_TYPE=arbitrum npx hardhat run scripts/3-configure-l2-module.js --network sepolia
```

This automatically reads the L2 controller address from `deployments.json`, sets the L2 controller on the module, and registers it with the L1 controller.

**Step 4: Fund Arbitrum Module**

The Arbitrum L2 module requires ETH to pay for retryable ticket fees when sending cross-chain messages:

```bash
# Send ETH to the Arbitrum module (check deployments.json for address)
# Recommended: 0.1 ETH for testing, adjust based on usage
# The module will use this balance to pay L2 gas fees
```

You can check the module's balance and fund it:

```bash
npx hardhat console --network sepolia
> const module = await ethers.getContractAt("PGL2ModuleArbitrum", "<ARB_MODULE_ADDRESS>");
> console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(module.target)));
> // Send ETH to the module
> const tx = await deployer.sendTransaction({ to: module.target, value: ethers.parseEther("0.1") });
```

**Note:** OP Stack modules (Base, Optimism) do not require funding as cross-chain messages are free.

**Step 5: Transfer Test Split Ownership (Testnet Only)**

If you created test splits using `utils-create-split.js`, you need to transfer ownership to the controllers:

```bash
# Transfer L1 splits wallet ownership
npx hardhat run scripts/utils-transfer-test-split-ownership.js --network sepolia

# Transfer L2 splits wallet ownership
npx hardhat run scripts/utils-transfer-test-split-ownership.js --network baseSepolia
npx hardhat run scripts/utils-transfer-test-split-ownership.js --network opSepolia
npx hardhat run scripts/utils-transfer-test-split-ownership.js --network arbSepolia
```

If the splits wallet uses two-step ownership transfer, you'll also need to accept ownership:

```bash
# Accept ownership on L1
npx hardhat run scripts/utils-accept-ownership.js --network sepolia

# Accept ownership on L2 (if needed)
npx hardhat run scripts/utils-accept-ownership.js --network baseSepolia
```

**Note:** For mainnet, you should already have production splits wallets owned by the appropriate addresses.

### Optional: Deploy Registry Later

If you set `registry: 'skip'` in `deploy-plan.js`, you can deploy the member registry later:

**Step 1b: Deploy Member Registry**

```bash
npx hardhat run scripts/1b-deploy-registry.js --network sepolia
```

This will:
- ✅ Deploy `PGMemberRegistry`
- ✅ Call `setMemberRegistry()` on L1 controller
- ✅ Update `deployments.json`

**Why skip the registry?**
- You want to use the simplified `updateSplitFromList()` method initially
- You're not ready to implement full member tracking yet
- You want to test the splits system without the registry overhead

## Post-Deployment

### Verify Deployment State

Check `deployments.json` to see all deployed addresses:

```json
{
  "sepolia": {
    "registry": "0x...",
    "l1Controller": "0x...",
    "l2Module_base": "0x...",
    "l2Module_optimism": "0x...",
    "l2Module_arbitrum": "0x...",
    "l2Controller_base": "0x...",
    "l2Controller_optimism": "0x...",
    "l2Controller_arbitrum": "0x..."
  }
}
```

### Verify Contract Configuration

Run verification scripts to ensure everything is configured correctly:

```bash
npx hardhat console --network sepolia
```

```javascript
const state = require('./deployments.json');
const addresses = state.sepolia;

// Check L1 Controller
const controller = await ethers.getContractAt("PGL1SplitController", addresses.l1Controller);
console.log("Registry:", await controller.memberRegistry());
console.log("Splits:", await controller.splitsWallet());
console.log("Base Module:", await controller.l2Modules(84532));
console.log("OP Module:", await controller.l2Modules(11155420));
console.log("Arb Module:", await controller.l2Modules(421614));

// Check L2 Modules
const baseModule = await ethers.getContractAt("PGL2ModuleOPStack", addresses.l2Module_base);
console.log("Base Module - L1 Controller:", await baseModule.l1Controller());
console.log("Base Module - L2 Controller:", await baseModule.l2Controller());
```

### Initialize Member Data

Once deployment is complete, import members to the registry:

```bash
# Import from hex file
IMPORT_FILE=path/to/members.hex npx hardhat run scripts/4-import-members.js --network sepolia

# Or use test data
npx hardhat run scripts/4-import-members.js --network sepolia
```

See `scripts/README_OPERATIONS.md` for complete member import documentation.

## Ongoing Operations

After deployment and initial setup, use these scripts for day-to-day operations:

### Update Split Shares (Monthly)

Calculate member weights and update split configuration:

```bash
# Update for current month
CUTOFF=2025-11 npx hardhat run scripts/5-update-splits.js --network sepolia

# With distribution incentive
CUTOFF=2025-11 INCENTIVE=500 npx hardhat run scripts/5-update-splits.js --network sepolia
```

This automatically:
- Calculates weights based on member tenure
- Updates L1 splits wallet
- Notifies all registered L2 modules

### Distribute Funds

Distribute accumulated funds to members:

```bash
# Distribute ETH on L1
TOKEN=0x0000000000000000000000000000000000000000 DISTRIBUTOR=0x... \
npx hardhat run scripts/6-distribute.js --network sepolia

# Distribute USDC on Base
TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e DISTRIBUTOR=0x... L2_CHAIN=84532 \
npx hardhat run scripts/6-distribute.js --network sepolia
```

**See `scripts/README_OPERATIONS.md` for complete operational documentation.**

## Network-Specific Notes

### Sepolia → L2 Testnets

When deploying with `--network sepolia`, the system automatically uses:
- **Base Sepolia** (Chain ID: 84532)
- **OP Sepolia** (Chain ID: 11155420)
- **Arbitrum Sepolia** (Chain ID: 421614)

### Mainnet → L2 Mainnets

When deploying with `--network mainnet`, the system automatically uses:
- **Base** (Chain ID: 8453)
- **Optimism** (Chain ID: 10)
- **Arbitrum One** (Chain ID: 42161)

## Troubleshooting

### "Member Registry not set"

**Solution:** Configure L1 controller:
```bash
npx hardhat console --network sepolia
const controller = await ethers.getContractAt("PGL1SplitController", "<ADDRESS>");
await controller.setMemberRegistry("<REGISTRY_ADDRESS>");
```

### "L1 module address not found in deployment state"

**Solution:** Run the full L1 deployment first:
```bash
npx hardhat run scripts/1-deploy.js --network sepolia
```

### "L2 Controller already deployed but not in state"

**Solution:** Manually add to `deployments.json`:
```json
{
  "sepolia": {
    "l2Controller_base": "0x..."
  }
}
```

### Gas Issues

For L1 deployments on mainnet, ensure you have sufficient ETH:
- Registry deployment: ~3-4M gas
- Controller deployment: ~2-3M gas
- Module deployment: ~2-3M gas each

### Cross-chain Message Delays

When testing cross-chain splits updates:
- **OP Stack (Base, Optimism)**: 1-5 minutes
- **Arbitrum**: 10-30 minutes

## Security Checklist

Before going to production:

- [ ] Verify all contract addresses in `deployments.json`
- [ ] Confirm ownership of all contracts
- [ ] Test splits distribution on testnet
- [ ] Verify cross-chain messaging works
- [ ] Review and test emergency pause functionality
- [ ] Ensure splits wallets are correctly configured
- [ ] Test member registry updates and weight calculations
- [ ] Verify gas estimates for all operations

## Splits Wallet Ownership Management

After deployment, you need to transfer ownership of your splits wallet to the controller.

### Accept Ownership (Two-Step Transfer)

If ownership was already initiated to the controller:

```bash
npx hardhat run scripts/utils-accept-ownership.js --network sepolia
```

### Transfer Ownership from Controller

To transfer ownership from the controller to another address:

```bash
NEW_OWNER=0x... npx hardhat run scripts/utils-transfer-ownership.js --network sepolia
```

### Execute Custom Calls

For advanced operations, use the interactive execCalls script:

```bash
node scripts/utils-exec-calls.js
```

This provides options for:
- Accept ownership
- Transfer ownership
- Set paused state
- Custom contract calls

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review contract documentation in `contracts/`
3. Check existing deployment logs in `deployments.json`
4. Review transaction history on block explorers

## Mainnet Deployment

⚠️ **CRITICAL**: Before mainnet deployment:

1. Test entire flow on Sepolia
2. Verify all splits calculations
3. Review and audit all contracts
4. Ensure sufficient gas budget
5. Prepare incident response plan
6. Set up monitoring and alerts

Then follow the same process with `--network mainnet`.
