# PGWeights Contract - Hardhat Setup

Complete Hardhat development environment for the Protocol Guild weights contract.

## Quick Start

### One Command Setup
```bash
./setup.sh
```

This will:
1. Install dependencies
2. Compile contract
3. Generate 185 random test members
4. Create import hex data

### Run Demo
```bash
npm run demo
```

Complete workflow with gas tracking!

## Custom Setup

### Generate Different Size Dataset
```bash
./setup.sh -n 500          # 500 members
./setup.sh -n 1000         # 1000 members (stress test)
```

### Use Real Data (if available)
```bash
./setup.sh --real-data
```

### Help
```bash
./setup.sh --help
```

## Scripts

### Deploy Only
```bash
npm run deploy
```
Deploys the PGWeights contract and outputs the address.

### Full Demo
```bash
npm run demo                    # Use default cutoff: 2025-11
CUTOFF=2024-06 npm run demo     # Custom cutoff: June 2024
CUTOFF=2026-01 npm run demo     # Custom cutoff: January 2026
```
Complete workflow:
1. Deploy contract
2. Import members from `import_data.hex`
3. Add org member with 5% fixed allocation
4. Calculate weights for specified cutoff date
5. Analyze results (top/bottom members)
6. Display all member allocations
7. Save output to `output.txt`

**Environment Variables:**
- `CUTOFF` - Cutoff date in YYYY-MM format, defaults to 2025-11

### Start Local Node
```bash
npm run node
```
Starts a local Hardhat network node.

## Demo Output

The demo script provides:

**Gas Tracking:**
- Import gas usage (total + per member)
- getAllWeights gas usage
- Detailed breakdown (counting, org processing, regular processing)

**Results:**
- Total members
- Total percentage (should be ~100%)
- Top 5 members by allocation
- Bottom 5 members by allocation

**Files Generated:**
- `output.txt` - Raw contract output
- `output.csv` - Readable CSV format

## Configuration

### Hardhat Config (`hardhat.config.js`)

**Solidity:**
- Version: 0.8.20
- Optimizer: Enabled (200 runs)
- viaIR: false (not needed with optimizations)

**Networks:**
- Hardhat (default): 30M gas block limit
- Localhost: For persistent node

**Gas Limit:**
- Block: 30,000,000 gas
- Ensures large transactions (import) succeed

## Development Workflow

### 1. Modify Contract
Edit `contracts/PGWeights.sol`

### 2. Recompile
```bash
npm run compile
```

### 3. Test Changes
```bash
npm run demo
```

### 4. Analyze Gas
Check the demo output for gas breakdown:
- Which phase uses most gas?
- Gas per member
- Total gas consumption

### 5. Iterate
Optimize → Compile → Test → Repeat

## Gas Optimization Tracking

Current gas usage (185 members):
```
Total Gas:           ~2,655,038
Gas per member:      ~14,405

Breakdown:
  Counting:          ~XXX,XXX
  Org processing:    ~XX,XXX
  Regular processing:~X,XXX,XXX (bottleneck)
```

## Utilities

### Convert Output to CSV
```bash
python3 convert_output.py output.txt output.csv
```

### Generate Censored Data
```bash
./censor_addresses.sh pgdata.txt pgdata_censored.txt
```

## Contract Functions

### Management
- `addMember(address, year, month, partTimeFactor)`
- `updateMember(address, partTimeFactor, monthsOnBreak, active)`
- `delMember(address)`
- `importMembers(bytes)` - Bulk import

### Org Members
- `addOrgMember(address, fixedPercentage)`
- `updateOrgMember(address, fixedPercentage, active)`
- `delOrgMember(address)`

### Queries
- `getAllWeights(year, month)` - Returns weights + gas used
- `getAllWeightsWithBreakdown(year, month)` - Returns weights + gas breakdown
- `calculateMemberWeight(address, year, month)` - Single member weight
- `getMember(address)` - Member details
- `getOrgMember(address)` - Org member details

## Troubleshooting

**"import_data.hex not found"**
```bash
./csv_to_hex.sh pgdata.txt > import_data.hex
```

**Compilation errors**
```bash
# Clean and recompile
rm -rf cache artifacts
npm run compile
```

**Out of gas**
- Check `hardhat.config.js` gas limit
- Default: 30M gas (sufficient for 200+ members)

**Stack too deep errors**
- Already handled by splitting functions
- If still occurring, enable viaIR in config

## Next Steps

1. **Add Tests**: Create `test/PGWeights.test.js`
2. **Deploy to Testnet**: Add network config
3. **Verify Contract**: Setup Etherscan verification
4. **Add Frontend**: Build UI for weight visualization
