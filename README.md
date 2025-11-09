# Protocol Guild Weight Tracking System

On-chain weight calculation and multi-chain splits distribution for Protocol Guild members.

## Overview

This system calculates member allocation weights based on tenure and distributes funds across Ethereum L1 and multiple L2 networks (Base, Optimism, Arbitrum) using 0xSplits V2.

**Key Features:**
- ✅ On-chain weight calculation based on member tenure
- ✅ Gas-optimized sqrt calculation with lookup tables
- ✅ Multi-chain splits coordination (L1 → L2 messaging)
- ✅ Automated cross-chain sync via native bridges
- ✅ Support for part-time members and org allocations
- ✅ Batch member import (27 bytes per member)

## Quick Start

### Installation

```bash
npm install
cp .env.example .env
# Edit .env with your PRIVATE_KEY and splits wallet addresses
```

### Create Test Splits (Testnet Only)

If you don't have a SplitsV2 wallet yet, create one for testing:

```bash
# Set the 0xSplits V2 factory address for your network
SPLIT_FACTORY=0x... npx hardhat run scripts/utils-create-split.js --network sepolia

# Or add it to .env and run:
npx hardhat run scripts/utils-create-split.js --network baseSepolia
```

This creates a split with:
- Owner (you): 99%
- Dead address: 1%
- Controlled by your deployer address

**After deployment**, transfer ownership to the controllers:
```bash
npx hardhat run scripts/utils-transfer-test-split-ownership.js --network sepolia
npx hardhat run scripts/utils-transfer-test-split-ownership.js --network baseSepolia
```

### Deployment

```bash
# 1. Deploy L1 + L2 modules
npx hardhat run scripts/1-deploy.js --network sepolia

# 1b. (Optional) Deploy registry later if skipped in deploy-plan.js
npx hardhat run scripts/1b-deploy-registry.js --network sepolia

# 2. Deploy L2 controllers
npx hardhat run scripts/2-deploy-l2-controller.js --network baseSepolia

# 3. Configure L2 modules
L2_TYPE=base npx hardhat run scripts/3-configure-l2-module.js --network sepolia
```

### Operations

```bash
# Import members
IMPORT_FILE=members.hex npx hardhat run scripts/4-import-members.js --network sepolia

# Update splits (monthly, using member registry)
CUTOFF=2025-11 npx hardhat run scripts/5-update-splits.js --network sepolia

# Or update splits from simple list (without member registry)
SPLITS="0xAddr1:100,0xAddr2:200,0xAddr3:150" \
npx hardhat run scripts/5b-update-splits-from-list.js --network sepolia

# Distribute funds
TOKEN=0x0000000000000000000000000000000000000000 DISTRIBUTOR=0x... \
npx hardhat run scripts/6-distribute.js --network sepolia
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    L1 (Ethereum)                            │
├─────────────────────────────────────────────────────────────┤
│  PGMemberRegistry                                           │
│  └─ Stores member data & calculates weights                 │
│                                                             │
│  PGL1SplitController                                        │
│  ├─ Manages L1 splits wallet                                │
│  ├─ Coordinates L2 modules                                  │
│  └─ Triggers cross-chain updates                            │
│                                                             │
│  PGL2Module* (Base, Optimism, Arbitrum)                     │
│  └─ Bridge modules for each L2                              │
└─────────────────────────────────────────────────────────────┘
                          ↓ Cross-chain messages
┌─────────────────────────────────────────────────────────────┐
│                    L2 Networks                              │
├─────────────────────────────────────────────────────────────┤
│  PGL2Controller* (on each L2)                               │
│  └─ Manages L2 splits wallet                                │
│  └─ Receives updates from L1 module                         │
└─────────────────────────────────────────────────────────────┘
```

## Weight Calculation

Member weights are calculated using square root of weighted tenure:

```
weight = √(activeMonths × partTimeFactor / 100)
```

Where:
- `activeMonths` = months since join - months on break
- `partTimeFactor` = 0-100 (100 = full-time, 50 = half-time)

This ensures veteran members have higher but not overwhelming weight compared to newer members.

## Contracts

### L1 Contracts
- **PGMemberRegistry** - Member data storage and weight calculation
- **PGL1SplitController** - L1 splits coordinator
- **PGL2ModuleOPStack** - OP Stack bridge module (Base, Optimism)
- **PGL2ModuleArbitrum** - Arbitrum bridge module

### L2 Contracts
- **PGL2ControllerOPStack** - OP Stack L2 controller (Base, Optimism)
- **PGL2ControllerArbitrum** - Arbitrum L2 controller

### Libraries
- **SqrtLookup** - Gas-optimized sqrt lookup table (1-100)
- **SplitV2** - 0xSplits V2 split struct definitions

## Scripts

See [`scripts/README.md`](scripts/README.md) for complete script documentation.

**Deployment:**
1. `1-deploy.js` - Master deployment
2. `2-deploy-l2-controller.js` - L2 controller deployment
3. `3-configure-l2-module.js` - L2 module configuration

**Operations:**
4. `4-import-members.js` - Import member data
5. `5-update-splits.js` - Update split weights
6. `6-distribute.js` - Distribute funds

**Utilities:**
- `utils-accept-ownership.js` - Accept ownership transfer
- `utils-transfer-ownership.js` - Transfer ownership
- `utils-exec-calls.js` - Execute custom calls

**Other:**
- `demo.js` - Complete demo workflow
- `generate_sqrt_lookup.js` - Generate sqrt lookup table

## Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide
- **[scripts/README.md](scripts/README.md)** - Script documentation
- **[deploy-plan.js](deploy-plan.js)** - Deployment configuration

## Configuration

### Deployment Configuration (`deploy-plan.js`)

```javascript
module.exports = {
  sepolia: {
    l1: {
      registry: 'deploy',    // 'deploy', 'skip', or address
      controller: 'deploy',  // 'deploy' or address
      splitsWallet: process.env.SEPOLIA_SPLITS_WALLET,
    },
    l2: {
      base: {
        enabled: true,
        module: 'deploy',
        controller: 'deploy',
        splitsWallet: process.env.BASE_SEPOLIA_SPLITS_WALLET,
      },
      // ... optimism, arbitrum
    }
  }
}
```

### Environment Variables

Required:
- `PRIVATE_KEY` - Deployment private key
- `SEPOLIA_SPLITS_WALLET` - L1 splits wallet address
- `BASE_SEPOLIA_SPLITS_WALLET` - Base L2 splits wallet
- `OP_SEPOLIA_SPLITS_WALLET` - Optimism L2 splits wallet
- `ARB_SEPOLIA_SPLITS_WALLET` - Arbitrum L2 splits wallet

Optional:
- `SEPOLIA_RPC_URL`, `BASE_SEPOLIA_RPC_URL`, etc. - Custom RPC URLs
- `ETHERSCAN_API_KEY`, `BASESCAN_API_KEY`, etc. - For verification

## Testing

```bash
# Run tests
npx hardhat test

# Run demo
CUTOFF=2025-11 npm run demo

# Deploy and test on local network
npx hardhat node
npx hardhat run scripts/demo.js --network localhost
```

## Gas Optimization

- **Sqrt lookup table**: 1-100 months use precomputed values (~5k gas vs ~20k)
- **Batch imports**: Import members in batches (~50k gas per member)
- **Array-based storage**: Members stored in array with mapping index
- **Unchecked math**: Safe unchecked math in hot paths
- **Memory optimization**: Single SLOAD per member in weight calculation

## Supported Networks

### Testnets
- Sepolia (L1)
- Base Sepolia
- OP Sepolia
- Arbitrum Sepolia

### Mainnets
- Ethereum (L1)
- Base
- Optimism
- Arbitrum One

## Security

- All controllers use OpenZeppelin `Ownable`
- Two-step ownership transfers supported via 0xSplits
- Cross-chain messages validated by native bridges
- Member data immutable after import (except status updates)

## License

MIT

## Contributing

This is an internal Protocol Guild project. For issues or improvements, please coordinate with the Protocol Guild team.

## Resources

- [Protocol Guild Documentation](https://protocol-guild.readthedocs.io/)
- [0xSplits Documentation](https://docs.splits.org/)
- [Deployment State](deployments.json)
