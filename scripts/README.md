# Protocol Guild Scripts

Organized scripts for deployment and operation of the Protocol Guild Weight Tracking System.

## Script Organization

Scripts are numbered by typical execution order:

### Deployment Scripts (1-3)

1. **`1-deploy.js`** - Master deployment script
   - Deploys L1 components (Registry, Controller)
   - Deploys L2 modules on L1
   - Configures L1 controller
   - **Note:** Set `registry: 'skip'` in deploy-plan.js to deploy registry later
   ```bash
   npx hardhat run scripts/1-deploy.js --network sepolia
   ```

1b. **`1b-deploy-registry.js`** - Deploy registry later (optional)
   - Deploys PGMemberRegistry if skipped during initial deployment
   - Automatically calls setMemberRegistry() on L1 controller
   - Updates deployments.json
   ```bash
   npx hardhat run scripts/1b-deploy-registry.js --network sepolia
   ```

1c. **`1c-deploy-l2-module.js`** - Deploy single L2 module (optional)
   - Deploys a single L2 module on L1 for cross-chain communication
   - Use when adding a new L2 after initial deployment
   - Optionally sets L1 controller on the module
   ```bash
   # Deploy Arbitrum module
   L2_TYPE=arbitrum npx hardhat run scripts/1c-deploy-l2-module.js --network sepolia

   # Deploy Base module
   L2_TYPE=base npx hardhat run scripts/1c-deploy-l2-module.js --network sepolia

   # Deploy and auto-configure with L1 controller
   L2_TYPE=optimism SET_CONTROLLER=true npx hardhat run scripts/1c-deploy-l2-module.js --network sepolia
   ```

2. **`2-deploy-l2-controller.js`** - Deploy L2 controller
   - Deploys controller on L2 network
   - Auto-reads L1 module address from `deployments.json`
   ```bash
   npx hardhat run scripts/2-deploy-l2-controller.js --network baseSepolia
   npx hardhat run scripts/2-deploy-l2-controller.js --network opSepolia
   npx hardhat run scripts/2-deploy-l2-controller.js --network arbSepolia
   ```

3. **`3-configure-l2-module.js`** - Configure L2 module
   - Reads L2 controller address from `deployments.json`
   - Links L2 controller to L2 module
   - Registers module with L1 controller
   ```bash
   L2_TYPE=base npx hardhat run scripts/3-configure-l2-module.js --network sepolia
   ```

### Operational Scripts (4-6)

4. **`4-import-members.js`** - Import member data
   - Import members from hex-encoded file
   - Each member: 27 bytes (address, join date, part-time factor, etc.)
   ```bash
   IMPORT_FILE=members.hex npx hardhat run scripts/4-import-members.js --network sepolia
   ```

5. **`5-update-splits.js`** - Update split configuration
   - Calculate member weights based on cutoff date
   - Update L1 splits wallet
   - Notify all L2 modules via cross-chain messages
   ```bash
   CUTOFF=2025-11 npx hardhat run scripts/5-update-splits.js --network sepolia

   # With distribution incentive (in basis points, max 650 = 6.5%)
   CUTOFF=2025-11 INCENTIVE=500 npx hardhat run scripts/5-update-splits.js --network sepolia

   # Update single chain only (reduces gas costs when too many members)
   CUTOFF=2025-11 L2_CHAIN=1 npx hardhat run scripts/5-update-splits.js --network sepolia  # L1 only
   CUTOFF=2025-11 L2_CHAIN=42161 npx hardhat run scripts/5-update-splits.js --network sepolia  # Arbitrum only
   ```

5b. **`5b-update-splits-from-list.js`** - Update splits from simple list
   - Update splits without member registry
   - Takes address:allocation pairs
   - Simplified method for initial deployment or testing
   - Better for DAO transaction previews
   ```bash
   # From environment variables (address:allocation format)
   SPLITS="0xAddr1:100,0xAddr2:200,0xAddr3:150" \
   INCENTIVE=500 \
   npx hardhat run scripts/5b-update-splits-from-list.js --network sepolia

   # With test data (no env vars needed)
   npx hardhat run scripts/5b-update-splits-from-list.js --network sepolia
   ```

6. **`6-distribute.js`** - Execute distribution
   - Distribute funds to members on L1 or L2
   - Use `0x0000000000000000000000000000000000000000` for ETH
   ```bash
   # L1 distribution
   TOKEN=0x0000000000000000000000000000000000000000 DISTRIBUTOR=0x... \
   npx hardhat run scripts/6-distribute.js --network sepolia

   # L2 distribution (via cross-chain message)
   TOKEN=0xTokenAddress DISTRIBUTOR=0x... L2_CHAIN=84532 \
   npx hardhat run scripts/6-distribute.js --network sepolia
   ```

### Utility Scripts

- **`utils-create-split.js`** - Create new dummy SplitsV2 wallet (testnet only)
  ```bash
  # Create with defaults (owner 99%, dead address 1%)
  npx hardhat run scripts/utils-create-split.js --network sepolia

  # With custom factory address
  SPLIT_FACTORY=0x... npx hardhat run scripts/utils-create-split.js --network baseSepolia
  ```

- **`utils-transfer-test-split-ownership.js`** - Transfer test split ownership to controller (testnet only)
  ```bash
  # Transfer L1 splits ownership
  npx hardhat run scripts/utils-transfer-test-split-ownership.js --network sepolia

  # Transfer L2 splits ownership
  npx hardhat run scripts/utils-transfer-test-split-ownership.js --network baseSepolia
  ```

- **`utils-accept-ownership.js`** - Accept pending ownership transfer (two-step transfers)
  ```bash
  npx hardhat run scripts/utils-accept-ownership.js --network sepolia
  ```

- **`utils-transfer-ownership.js`** - Transfer ownership from controller to new address
  ```bash
  # Transfer L1 splits ownership (via L1 controller)
  NEW_OWNER=0x... npx hardhat run scripts/utils-transfer-ownership.js --network sepolia

  # Transfer L2 splits ownership (calls L2 module directly - requires module ownership)
  NEW_OWNER=0x... L2_CHAIN=42161 npx hardhat run scripts/utils-transfer-ownership.js --network sepolia
  ```
  Note: L2 transfers call the L2 module directly, so you must be the module owner

- **`utils-exec-calls.js`** - Execute custom calls through controller (interactive)
  ```bash
  HARDHAT_NETWORK=sepolia node scripts/utils-exec-calls.js
  ```

- **`utils-set-arbitrum-gas.js`** - Set gas parameters for Arbitrum L2 module
  ```bash
  # Set custom gas parameters (when default limits are insufficient)
  GAS_LIMIT=2000000 MAX_FEE=20 SUBMISSION_COST=0.002 \
  npx hardhat run scripts/utils-set-arbitrum-gas.js --network sepolia

  # Reset to defaults
  RESET=true npx hardhat run scripts/utils-set-arbitrum-gas.js --network sepolia

  # View current settings (run without params)
  npx hardhat run scripts/utils-set-arbitrum-gas.js --network sepolia
  ```

### Other Scripts

- **`demo.js`** - Complete demo: deploy, import, calculate weights
  ```bash
  CUTOFF=2025-11 npm run demo
  ```

- **`generate_sqrt_lookup.js`** - Generate sqrt lookup table for contract
  ```bash
  node scripts/generate_sqrt_lookup.js
  ```

## Quick Start

### Initial Deployment

```bash
# 1. Deploy L1 + L2 modules
npx hardhat run scripts/1-deploy.js --network sepolia

# Alternative: Deploy L1 first, then add L2 modules individually
# npx hardhat run scripts/1-deploy.js --network sepolia  # (with L2s disabled in deploy-plan.js)
# L2_TYPE=arbitrum npx hardhat run scripts/1c-deploy-l2-module.js --network sepolia
# L2_TYPE=base npx hardhat run scripts/1c-deploy-l2-module.js --network sepolia

# 2. Deploy L2 controllers
npx hardhat run scripts/2-deploy-l2-controller.js --network baseSepolia
npx hardhat run scripts/2-deploy-l2-controller.js --network opSepolia
npx hardhat run scripts/2-deploy-l2-controller.js --network arbSepolia

# 3. Configure L2 modules (reads addresses from deployments.json)
L2_TYPE=base npx hardhat run scripts/3-configure-l2-module.js --network sepolia
L2_TYPE=optimism npx hardhat run scripts/3-configure-l2-module.js --network sepolia
L2_TYPE=arbitrum npx hardhat run scripts/3-configure-l2-module.js --network sepolia
```

### Regular Operations

```bash
# Import members (one-time or when adding new members)
IMPORT_FILE=members.hex npx hardhat run scripts/4-import-members.js --network sepolia

# Update splits (monthly or as needed)
CUTOFF=2025-11 npx hardhat run scripts/5-update-splits.js --network sepolia

# Distribute funds (as needed)
TOKEN=0x0000000000000000000000000000000000000000 DISTRIBUTOR=0x... \
npx hardhat run scripts/6-distribute.js --network sepolia
```

## Environment Variables

Common environment variables used across scripts:

- `CUTOFF` - Cutoff date for weight calculation (YYYY-MM format)
- `INCENTIVE` - Distribution incentive in basis points (0-650)
- `L2_FEE` - ETH for L2 messaging fees (default: 0.01)
- `L2_CHAIN` - Target chain ID (1=L1 only, >1=specific L2, omit=all chains)
- `IMPORT_FILE` - Path to member import file
- `TOKEN` - Token address to distribute
- `DISTRIBUTOR` - Address receiving distribution incentive
- `L2_TYPE` - L2 type (base, optimism, arbitrum)
- `L2_CONTROLLER_ADDRESS` - (Optional) Override L2 controller address from deployments.json
- `NEW_OWNER` - New owner address for transfers
- `GAS_LIMIT` - Custom gas limit for Arbitrum retryable tickets
- `MAX_FEE` - Maximum fee per gas in gwei for Arbitrum
- `SUBMISSION_COST` - Maximum submission cost in ETH for Arbitrum
- `RESET` - Set to 'true' to reset Arbitrum gas parameters to defaults
- `SET_CONTROLLER` - Set to 'true' to automatically configure L1 controller on module

## Chain IDs

Common chain IDs for reference:

### Testnets
- Sepolia: `11155111`
- Base Sepolia: `84532`
- OP Sepolia: `11155420`
- Arbitrum Sepolia: `421614`

### Mainnets
- Ethereum: `1`
- Base: `8453`
- Optimism: `10`
- Arbitrum One: `42161`

## Deployment State

All deployments are tracked in `deployments.json`:

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

## Configuration

Edit `deploy-plan.js` to configure what to deploy:

```javascript
module.exports = {
  sepolia: {
    l1: {
      registry: 'deploy',    // or existing address '0x...'
      controller: 'deploy',  // or existing address '0x...'
      splitsWallet: process.env.SEPOLIA_SPLITS_WALLET,
    },
    l2: {
      base: { enabled: true, module: 'deploy', controller: 'deploy', ... },
      optimism: { enabled: false, ... },
      arbitrum: { enabled: false, ... },
    }
  }
}
```

## Troubleshooting

### Common Issues

**"Registry not found in deployment state"**
- Run `1-deploy.js` first to deploy L1 components

**"L2 Controller not found"**
- Run `2-deploy-l2-controller.js` on the appropriate L2 network

**"No active members"**
- Run `4-import-members.js` to import member data

**"Splits address not set"**
- Configure splits wallet address on controller

**"L2 module not registered"**
- Run `3-configure-l2-module.js` to link and register the module

**"Insufficient balance for L2 fees" or gas limit exceeded on Arbitrum**
- Increase gas parameters: `GAS_LIMIT=2000000 MAX_FEE=20 SUBMISSION_COST=0.002 npx hardhat run scripts/utils-set-arbitrum-gas.js --network sepolia`
- Fund the Arbitrum module with more ETH for retryable ticket fees
- Use single-chain updates when you have many members: `L2_CHAIN=1 npx hardhat run scripts/5-update-splits.js --network sepolia`

## Documentation

- `../DEPLOYMENT.md` - Complete deployment guide
- `../README.md` - Project overview
- `deploy-plan.js` - Deployment configuration
- `deployments.json` - Deployment state (auto-generated)

## Support

For detailed documentation on each script, check the header comments in the script files.
