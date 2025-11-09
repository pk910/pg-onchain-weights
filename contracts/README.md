# Protocol Guild Weights Contract - Architecture Design

## System Overview

The Protocol Guild Weights Contract system is a multi-chain protocol for managing member allocation weights and coordinating fund distribution across Ethereum L1 and multiple L2 networks (Base, Optimism, Arbitrum). The system uses 0xSplits V2 for distribution and native bridge messaging for cross-chain coordination.

### Key Features
- **On-chain Weight Calculation**: Calculates member weights based on tenure using `sqrt(activeMonths × partTimeFactor / 100)`
- **Multi-chain Coordination**: Synchronizes splits across L1 and L2 networks via native bridges
- **Gas Optimization**: Lookup tables for sqrt calculations, batch member imports
- **DAO-Controlled**: All mainnet contracts owned by the Protocol Guild DAO for maximum security
- **Immutable L2 Controllers**: L2 controllers are immutable and can only be controlled via L1 cross-chain messages

---

## Network Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ETHEREUM L1 (Chain ID: 1)                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                                                                                 │
│                          ┌──────────────────────┐                               │
│                          │    DAO Contract      │                               │
│                          │ (Owns all L1 assets) │                               │
│                          └──────────┬───────────┘                               │
│                                     │ owns / updates                            │
│            ┌────────────────────────┼                                           │
│            │                        │                                           │
│            |      ┌─────────────────▼────┐        ┌─────────────────┐           │
│            |      │  PGMemberRegistry    │        │ SplitsV2 Wallet │           │
│            |      │      (optional)      │        │ (Mainnet funds) │           │
│            |      │  - Member storage    │        │                 │           │
│            |      │  - Weight calc       │        └─────▲───────────┘           │
│            |      │  - Tenure tracking   │              |                       |
│            │      └───────────▲──────────┘              | controls              |
│            │                  | reads                   |                       │
│   ┌────────▼──────────────────┴─────────────────────────┴─────┐                 │
│   │           PGL1SplitController (L1 Controller)             │                 │
│   │  ┌────────────────────────────────────────────────────┐   │                 │
│   │  │ - Manages L1 SplitsV2 wallet                       │   │                 │
│   │  │ - Coordinates L2 module registry                   │   │                 │
│   │  │ - Triggers cross-chain updates                     │   │                 │
│   │  │ - Reads weights from PGMemberRegistry              │   │                 │
│   │  └────────────────────────────────────────────────────┘   │                 │
│   └───────────────┬────────────────┬─────────────┬────────────┘                 │
│                   │                │             │                              │
│   ┌───────────────▼───┐  ┌─────────▼────────┐  ┌─▼──────────────┐               │
│   │ PGL2ModuleOPStack │  │ PGL2ModuleOPStack│  │PGL2ModuleArb   │               │
│   │    (for Base)     │  │  (for Optimism)  │  │ (for Arbitrum) │               │
│   │                   │  │                  │  │                │               │
│   │ - Bridge adapter  │  │ - Bridge adapter │  │ - Bridge adapt │               │
│   │ - Free messaging  │  │ - Free messaging │  │ - Paid tickets │               │
│   └─────────┬─────────┘  └─────────┬────────┘  └────────┬───────┘               │
│             │                      │                    │                       │
│             │ L1CrossDomain        │ L1CrossDomain      │ Arbitrum Inbox        │
│             │ Messenger            │ Messenger          │ (Retryable Tickets)   │
│             │ (Free)               │ (Free)             │ (Requires ETH fees)   │
└─────────────┼──────────────────────┼────────────────────┼───────────────────────┘
              │                      │                    │
              │                      │                    │
┌─────────────▼───────────┐ ┌────────▼────────────┐ ┌─────▼─────────────────────┐
│   BASE L2 (Chain: 8453) │ │ OPTIMISM (Chain:10) │ │ ARBITRUM ONE (Chain:42161)│
├─────────────────────────┤ ├─────────────────────┤ ├───────────────────────────┤
│                         │ │                     │ │                           │
│  ┌──────────────────┐   │ │  ┌──────────────┐   │ │  ┌─────────────────────┐  │
│  │ L2CrossDomain    │   │ │  │L2CrossDomain │   │ │  │  ArbSys (Predepl)   │  │
│  │ Messenger        │   │ │  │  Messenger   │   │ │  │  Address Aliasing   │  │
│  │ (0x4200...0007)  │   │ │  │(0x4200...007)│   │ │  │  (L1→L2 validation) │  │
│  └────────┬─────────┘   │ │  └──────┬───────┘   │ │  └──────────┬──────────┘  │
│           │             │ │         │           │ │             │             │
│  ┌────────▼──────────┐  │ │  ┌──────▼────────┐  │ │  ┌──────────▼───────────┐ │
│  │PGL2ControllerOPSt │  │ │  │PGL2Controller │  │ │  │PGL2ControllerArbitrum│ │
│  │                   │  │ │  │    OPStack    │  │ │  │                      │ │
│  │ - Immutable       │  │ │  │               │  │ │  │ - Immutable          │ │
│  │ - No owner        │  │ │  │ - Immutable   │  │ │  │ - No owner           │ │
│  │ - L1-only control │  │ │  │ - No owner    │  │ │  │ - L1-only control    │ │
│  │ - Validates msgs  │  │ │  │ - L1-only ctl │  │ │  │ - Validates aliased  │ │
│  │   via xDomain     │  │ │  │ - Validates   │  │ │  │   sender             │ │
│  │   sender check    │  │ │  │   xDomain     │  │ │  │ - Handles refunds    │ │
│  └────────┬──────────┘  │ │  └──────┬────────┘  │ │  └──────────┬───────────┘ │
│           │ controls    │ │         │ controls  │ │             │ controls    │
│  ┌────────▼──────────┐  │ │  ┌──────▼────────┐  │ │  ┌──────────▼───────────┐ │
│  │  SplitsV2 Wallet  │  │ │  │ SplitsV2 Wal  │  │ │  │   SplitsV2 Wallet    │ │
│  │  (Base funds)     │  │ │  │ (OP funds)    │  │ │  │   (Arbitrum funds)   │ │
│  └───────────────────┘  │ │  └───────────────┘  │ │  └──────────────────────┘ │
│                         │ │                     │ │                           │
└─────────────────────────┘ └─────────────────────┘ └───────────────────────────┘
```

---

## Contract Roles and Responsibilities

### L1 Contracts (Ethereum Mainnet)

#### 1. **PGMemberRegistry**
**Location**: Ethereum L1
**Owner**: DAO Contract
**Purpose**: Core member database and weight calculation engine

**Responsibilities**:
- Store member data (address, join date, part-time factor, breaks)
- Store organization member fixed allocations
- Calculate weighted tenure: `sqrt(activeMonths × partTimeFactor / 100)`
- Return member weights as percentages at specified cutoff dates
- Support batch member imports (27 bytes per member)

**Key Functions**:
- `addMember()` / `importMembers()` - Add/import members
- `addOrgMember()` - Add org with fixed percentage
- `updateMember()` / `updateOrgMember()` - Update member status
- `getAllWeights()` - Calculate all weights at cutoff date
- `getMemberBreakdown()` - Detailed weight calculation breakdown

**Security**:
- Only owner (DAO) can modify member data
- Immutable member join dates after import
- Fixed percentage orgs validated not to exceed 100%

#### 2. **PGL1SplitController**
**Location**: Ethereum L1
**Owner**: DAO Contract
**Purpose**: Master coordinator for all splits (L1 + L2s)

**Responsibilities**:
- Manage the L1 SplitsV2 wallet
- Maintain L2 module registry (Base, Optimism, Arbitrum)
- Query member weights from PGMemberRegistry
- Update L1 split configuration
- Broadcast split updates to all registered L2 modules
- Forward distribution and admin calls to L2s
- Execute arbitrary calls through splits wallets

**Key Functions**:
- `updateSplitShares()` - Update all splits from registry
- `updateSplitFromList()` - Update splits from simple list
- `updateSplitSharesSingleChain()` - Update single chain (gas optimization)
- `addL2Module()` / `removeL2Module()` - Manage L2 modules
- `distribute()` / `distributeL2()` - Distribute funds
- `execCalls()` / `execCallsL2()` - Execute arbitrary calls
- `transferSplitOwnership()` - Transfer split ownership

**Security**:
- Only owner (DAO) can call all functions
- Validates L2 modules before registration
- Immutable after deployment (owner-controlled operations only)

#### 3. **PGL2ModuleOPStack** (Base, Optimism)
**Location**: Ethereum L1
**Owner**: DAO Contract (can transfer ownership)
**Purpose**: Bridge adapter for OP Stack L2s (Base, Optimism)

**Responsibilities**:
- Receive commands from PGL1SplitController
- Forward messages to L2 via L1CrossDomainMessenger
- Encode function calls for cross-chain execution
- No fee payment required (OP Stack messaging is free)

**Key Functions**:
- `updateSplit()` - Forward split update to L2
- `distribute()` - Forward distribution call to L2
- `execCalls()` - Forward arbitrary calls to L2
- `setPaused()` - Pause/unpause L2 wallet
- `setL2Controller()` - Configure L2 controller address

**Bridge Details**:
- Uses OP Stack native bridge (L1CrossDomainMessenger)
- Free messaging (no ETH fees)
- Default gas limit: 1,000,000
- Messages are asynchronous

#### 4. **PGL2ModuleArbitrum**
**Location**: Ethereum L1
**Owner**: DAO Contract (can transfer ownership)
**Purpose**: Bridge adapter for Arbitrum L2

**Responsibilities**:
- Receive commands from PGL1SplitController
- Create retryable tickets via Arbitrum Inbox
- Pay L2 execution fees from internal balance
- Configure gas parameters (gasLimit, maxFeePerGas, maxSubmissionCost)

**Key Functions**:
- `updateSplit()` - Forward split update to L2
- `distribute()` - Forward distribution call to L2
- `execCalls()` - Forward arbitrary calls to L2
- `setGasParameters()` - Configure gas settings
- `forwardRefunds()` - Trigger refund forwarding on L2

**Bridge Details**:
- Uses Arbitrum retryable tickets
- Requires ETH fees (paid from module balance)
- Default: 1M gas limit, 10 gwei max fee, 0.001 ETH submission cost
- Refunds sent to L2 controller
- Module balance can be topped up via `receive()`

---

### L2 Contracts (Base, Optimism, Arbitrum)

#### 5. **PGL2ControllerOPStack** (Base, Optimism)
**Location**: Base L2, Optimism L2
**Owner**: None (Immutable)
**Purpose**: Execute L1 commands on OP Stack L2s

**Responsibilities**:
- Receive cross-chain messages from L1 module
- Validate sender via L2CrossDomainMessenger.xDomainMessageSender()
- Execute split updates on L2 SplitsV2 wallet
- Proxy distribution and admin calls to L2 wallet

**Key Functions**:
- `updateSplit()` - Update split (L1-only)
- `distribute()` - Distribute funds (L1-only)
- `execCalls()` - Execute arbitrary calls (L1-only)
- `setPaused()` - Pause wallet (L1-only)
- `transferOwnership()` - Transfer wallet ownership (L1-only)

**Security**:
- **No owner** - Cannot be called directly
- All functions require cross-chain message from L1 module
- Validates: `msg.sender == L2CrossDomainMessenger && xDomainMessageSender == l1Module`
- Immutable L1 module address set at deployment

#### 6. **PGL2ControllerArbitrum**
**Location**: Arbitrum One L2
**Owner**: None (Immutable)
**Purpose**: Execute L1 commands on Arbitrum

**Responsibilities**:
- Receive retryable ticket messages from L1 module
- Validate sender via Arbitrum address aliasing
- Execute split updates on L2 SplitsV2 wallet
- Handle and forward ETH refunds from retryable tickets

**Key Functions**:
- `updateSplit()` - Update split (L1-only)
- `distribute()` - Distribute funds (L1-only)
- `execCalls()` - Execute arbitrary calls (L1-only)
- `forwardRefunds()` - Manually forward refunds to splits wallet
- `getRefundBalance()` - Check accumulated refunds

**Security**:
- **No owner** - Cannot be called directly
- All functions require retryable ticket from L1 module
- Validates: `msg.sender == aliasedL1Module` (L1 address + 0x1111...1111 offset)
- Immutable L1 module address set at deployment
- Auto-forwards refunds when balance ≥ 0.5 ETH

**Refund Handling**:
- Receives refunds from unused retryable ticket fees
- Automatically forwards to splits wallet when ≥ 0.5 ETH
- Manual forwarding available via L1 trigger

#### 7. **PGL2SplitController** (Abstract Base)
**Location**: Inherited by all L2 controllers
**Purpose**: Common L2 controller logic

**Responsibilities**:
- Define common interface for L2 controllers
- Implement split wallet proxy functions
- Enforce L1-only access control via abstract `_isL1Module()`

**Pattern**:
```solidity
abstract contract PGL2SplitController {
    address public immutable l1Module;
    ISplitWalletV2 public immutable splitsWallet;

    function _isL1Module() internal view virtual returns (bool);

    modifier onlyL1Module() {
        require(_isL1Module(), "Not authorized L1 module");
        _;
    }
}
```

---

## Data Flow Diagrams

### 1. Split Update Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. DAO initiates monthly split update (YYYY-MM cutoff)                   │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. DAO calls PGL1SplitController.updateSplitShares(2025, 11, 0)          │
│    - cutoffYear: 2025                                                    │
│    - cutoffMonth: 11                                                     │
│    - distributionIncentive: 0 (0%)                                       │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. PGL1SplitController queries PGMemberRegistry.getAllWeights(2025, 11)  │
│    Returns: WeightResult[] = [                                           │
│      {addr: 0xAlice, percentage: 50000},  // 5.0000%                     │
│      {addr: 0xBob, percentage: 75000},    // 7.5000%                     │
│      {addr: 0xOrg1, percentage: 100000},  // 10.0000% (fixed)            │
│      ...                                                                 │
│    ]                                                                     │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. PGL1SplitController updates L1 SplitsV2 wallet                        │
│    splitsWallet.updateSplit({                                            │
│      recipients: [0xAlice, 0xBob, 0xOrg1, ...],                          │
│      allocations: [50000, 75000, 100000, ...],                           │
│      totalAllocation: 1000000,                                           │
│      distributionIncentive: 650                                          │
│    })                                                                    │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                ┌────────────────┼─────────────────┐
                │                │                 │
                ▼                ▼                 ▼
┌──────────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ 5a. Base L2 Module   │ │ 5b. OP Module│ │ 5c. Arb Module   │
│ PGL2ModuleOPStack    │ │ PGL2Module   │ │ PGL2ModuleArb    │
│                      │ │   OPStack    │ │                  │
│ - Encodes message    │ │ - Encodes    │ │ - Creates        │
│ - Sends via          │ │   message    │ │   retryable      │
│   L1CrossDomain      │ │ - Sends via  │ │   ticket         │
│   Messenger (free)   │ │   L1CrossDom │ │ - Pays fees from │
│                      │ │   (free)     │ │   module balance │
└──────────┬───────────┘ └──────┬───────┘ └────────┬─────────┘
           │                    │                  │
           │ Cross-chain msg    │ Cross-chain msg  │ Retryable ticket
           ▼                    ▼                  ▼
┌──────────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ 6a. Base L2          │ │ 6b. OP L2    │ │ 6c. Arbitrum L2  │
│ L2CrossDomainMsg     │ │ L2CrossDom   │ │ ArbSys           │
│ receives & routes    │ │ receives &   │ │ executes ticket  │
│                      │ │ routes       │ │                  │
└──────────┬───────────┘ └──────┬───────┘ └────────┬─────────┘
           │                    │                  │
           ▼                    ▼                  ▼
┌──────────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ 7a. PGL2Controller   │ │ 7b. PGL2Ctrl │ │ 7c. PGL2Ctrl     │
│     OPStack (Base)   │ │   OPStack(OP)│ │     Arbitrum     │
│                      │ │              │ │                  │
│ - Validates sender   │ │ - Validates  │ │ - Validates      │
│ - Calls updateSplit()│ │   sender     │ │   aliased sender │
│                      │ │ - Calls      │ │ - Calls update   │
│                      │ │   updateSplit│ │ - Checks refunds │
└──────────┬───────────┘ └──────┬───────┘ └────────┬─────────┘
           │                    │                  │
           ▼                    ▼                  ▼
┌──────────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ 8a. SplitsV2 Wallet  │ │ 8b. SplitsV2 │ │ 8c. SplitsV2     │
│     (Base)           │ │     (OP)     │ │     (Arbitrum)   │
│                      │ │              │ │                  │
│ Split updated!       │ │ Split        │ │ Split updated!   │
│                      │ │ updated!     │ │                  │
└──────────────────────┘ └──────────────┘ └──────────────────┘
```

### 2. Weight Calculation Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Member: Alice                                                           │
│ Join Date: 2022-03 (March 2022)                                         │
│ Part-time Factor: 100 (full-time)                                       │
│ Months on Break: 6                                                      │
│ Cutoff: 2025-11 (November 2025)                                         │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 1: Calculate months since join                                     │
│ monthsSinceJoin = (2025 - 2022) × 12 + (11 - 3) = 44 months             │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 2: Subtract breaks                                                 │
│ activeMonths = 44 - 6 = 38 months                                       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 3: Apply part-time factor                                          │
│ weightedMonths = 38 × 100 / 100 = 38 months                             │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 4: Calculate sqrt weight (using lookup table if ≤100)              │
│ sqrtWeight = sqrt(38 × 1e12) = 6,164,414,002                            │
│ (Uses SqrtLookup.getSqrt(38) for gas efficiency)                        │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 5: Normalize to percentage                                         │
│ percentage = sqrtWeight / totalWeight × remainingPercentage             │
│                                                                         │
│ If totalWeight (all members) = 100,000,000,000                          │
│ And remainingPercentage = 900,000 (90% after org allocations)           │
│                                                                         │
│ percentage = 6,164,414,002 / 100,000,000,000 × 900,000                  │
│            = 55,479 (5.5479% of total split)                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Security Model

### Ownership Hierarchy

```
┌────────────────────────────────────────────────────────────┐
│                    DAO Contract (Mainnet)                  │
│                                                            │
│  - High-security governance contract                       │
│  - Multi-sig or on-chain voting mechanism                  │
│  - Controls all Protocol Guild mainnet infrastructure      │
└──────────────────────────┬─────────────────────────────────┘
                           │ owns
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌────────────────┐  ┌──────────────┐  ┌──────────────────┐
│PGMemberRegistry│  │PGL1Split     │  │L2 Modules        │
│                │  │Controller    │  │ - PGL2ModuleBase │
│- Only DAO can  │  │              │  │ - PGL2ModuleOP   │
│  add/update    │  │- Only DAO can│  │ - PGL2ModuleArb  │
│  members       │  │  update      │  │                  │
│                │  │  splits      │  │- Only DAO can    │
│- Immutable     │  │              │  │  configure       │
│  join dates    │  │- Only DAO can│  │                  │
│                │  │  add/remove  │  │- Can transfer    │
│- Calculation   │  │  L2 modules  │  │  ownership if    │
│  logic is      │  │              │  │  needed          │
│  deterministic │  │              │  │                  │
└────────────────┘  └──────────────┘  └──────────────────┘
```

### L2 Immutability Model

```
┌─────────────────────────────────────────────────────────────────────┐
│  L2 Controllers (Base, Optimism, Arbitrum)                          │
│                                                                     │
│  ╔═══════════════════════════════════════════════════════════════╗  │
│  ║  IMMUTABLE - NO OWNER - CANNOT BE CALLED DIRECTLY             ║  │
│  ╚═══════════════════════════════════════════════════════════════╝  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │  All functions protected by onlyL1Module modifier         │      │
│  │                                                           │      │
│  │  modifier onlyL1Module() {                                │      │
│  │    require(_isL1Module(), "Not authorized L1 module");    │      │
│  │    _;                                                     │      │
│  │  }                                                        │      │
│  │                                                           │      │
│  │  // OP Stack validation                                   │      │
│  │  function _isL1Module() returns (bool) {                  │      │
│  │    return msg.sender == L2CrossDomainMessenger &&         │      │
│  │           xDomainMessageSender() == l1Module;             │      │
│  │  }                                                        │      │
│  │                                                           │      │
│  │  // Arbitrum validation                                   │      │
│  │  function _isL1Module() returns (bool) {                  │      │
│  │    return msg.sender == aliasedL1Module;                  │      │
│  │  }                                                        │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                     │
│  Security Properties:                                               │
│  ✓ No ownership transfer possible                                   │
│  ✓ No direct function calls allowed                                 │
│  ✓ Only L1 module can send commands via native bridge               │
│  ✓ L1 module address is immutable                                   │
│  ✓ Bridge validation is cryptographically secure                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Trust Model

1. **L1 DAO Control**
   - DAO contract owns all L1 contracts
   - DAO can update member registry
   - DAO can update split configurations
   - DAO can add/remove L2 modules
   - DAO can execute arbitrary calls through splits wallets

2. **L2 Immutability**
   - L2 controllers have no owner
   - Cannot be upgraded or replaced
   - Only respond to L1 cross-chain messages
   - Validate sender via bridge

3. **Bridge Security**
   - OP Stack: Native optimistic rollup bridge (L1↔L2 message verification)
   - Arbitrum: Retryable tickets with address aliasing (prevents L1 impersonation)
   - All bridges are battle-tested, canonical implementations

4. **Recovery Mechanisms**
   - If L2 controller needs replacement: Deploy new controller + new split wallet
   - L1 module can be updated to point to new L2 controller
   - Split control can be updated to point to new L2 controller
   - DAO retains ultimate control over L1 contracts

---

## Gas Optimization Strategies

### 1. **Square Root Lookup Table**
```solidity
// For weightedMonths ≤ 100, use precomputed values
if (wm <= 100) return SqrtLookup.getSqrt(wm);  // ~5k gas
else return sqrt(wm * 1e12);  // ~20k gas (Babylonian method)
```

### 2. **Batch Member Import**
```solidity
// 27 bytes per member: address(20) + joinYear(2) + joinMonth(1) +
//                      partTimeFactor(1) + monthsOnBreak(2) + active(1)
function importMembers(bytes calldata _data) {
    // Direct calldata decoding via assembly
    // Processes entire batch in single transaction
}
```

### 3. **Unchecked Math in Hot Paths**
```solidity
unchecked {
    monthsSinceJoin = (cutoffYear - joinYear) * 12 + cutoffMonth - joinMonth;
    activeMonths = monthsSinceJoin - monthsOnBreak;
    weightedMonths = activeMonths * partTimeFactor / 100;
}
```

### 4. **Single SLOAD per Member**
```solidity
// Load entire member struct into memory once
Member memory m = members[i];
// All subsequent reads from memory, not storage
```

### 5. **Array-based Storage**
```solidity
// Members stored in dynamic array (cheaper than mapping iteration)
Member[] public members;
mapping(address => uint256) public memberIndex;  // index + 1 (0 = not found)
```

---

## Cross-Chain Communication Details

### OP Stack (Base, Optimism)

**L1 → L2 Messaging**:
```solidity
// On L1 (PGL2ModuleOPStack)
L1CrossDomainMessenger.sendMessage(
    l2Controller,              // target on L2
    encodedFunctionCall,       // encoded updateSplit() call
    1_000_000                  // gas limit on L2
);
// FREE - No ETH required
```

**L2 Validation**:
```solidity
// On L2 (PGL2ControllerOPStack)
function _isL1Module() returns (bool) {
    return msg.sender == address(L2CrossDomainMessenger) &&
           L2CrossDomainMessenger.xDomainMessageSender() == l1Module;
}
```

### Arbitrum

**L1 → L2 Messaging**:
```solidity
// On L1 (PGL2ModuleArbitrum)
inbox.createRetryableTicketNoRefundAliasRewrite{value: maxFee}(
    l2Controller,              // target on L2
    0,                         // l2CallValue
    maxSubmissionCost,         // ~0.001 ETH
    l2Controller,              // excess refund recipient
    l2Controller,              // call value refund recipient
    gasLimit,                  // ~1M gas
    maxFeePerGas,              // ~10 gwei
    encodedFunctionCall        // encoded updateSplit() call
);
// REQUIRES ETH: maxSubmissionCost + (gasLimit * maxFeePerGas)
```

**L2 Validation**:
```solidity
// On L2 (PGL2ControllerArbitrum)
function _isL1Module() returns (bool) {
    // Arbitrum applies address aliasing to prevent impersonation
    // aliasedL1Module = l1Module + 0x1111000000000000000000000000000000001111
    return msg.sender == aliasedL1Module;
}
```

**Refund Handling**:
```solidity
// Unused fees are refunded to L2 controller
// Automatically forwarded to splits wallet when balance ≥ 0.5 ETH
receive() external payable {
    emit RefundsReceived(msg.value);
}

function _checkAndForwardRefunds() internal {
    if (address(this).balance >= 0.5 ether) {
        splitsWallet.call{value: balance}("");
    }
}
```

---

## Operational Workflows

### Monthly Split Update

**Executed by**: DAO Contract
**Frequency**: Monthly

```
1. DAO initiates: PGL1SplitController.updateSplitShares(YYYY, MM, 650)
   ↓
2. L1 Controller queries: PGMemberRegistry.getAllWeights(YYYY, MM)
   ↓
3. L1 Controller updates L1 splits wallet
   ↓
4. L1 Controller broadcasts to all L2 modules:
   - PGL2ModuleOPStack (Base)
   - PGL2ModuleOPStack (Optimism)
   - PGL2ModuleArbitrum
   ↓
5. L2 modules send cross-chain messages
   ↓
6. L2 controllers receive and validate messages
   ↓
7. L2 controllers update L2 splits wallets
   ↓
8. All splits updated across all chains ✓
```

### Add New Member

**Executed by**: DAO Contract

```
1. DAO calls: PGMemberRegistry.addMember(address, joinYear, joinMonth, partTimeFactor)
   ↓
2. Member added to registry
   ↓
3. Next monthly update will include new member automatically
```

### Fund Distribution

**Executed by**: DAO Contract or Distributor

```
1. DAO calls: PGL1SplitController.distribute(split, token, distributor)
   - OR -
   PGL1SplitController.distributeL2(chainId, split, token, distributor)
   ↓
2. Funds distributed to members according to current split
   ↓
3. Distributor receives incentive (default 0%)
```

---

## Summary

This architecture provides:

✅ **Decentralized Control**: DAO owns all L1 contracts
✅ **Multi-chain Coordination**: Automated sync across 4 chains
✅ **Immutable L2s**: L2 controllers cannot be manipulated directly
✅ **Gas Efficiency**: Lookup tables, batch imports, optimized calculations
✅ **Transparent Weights**: On-chain calculation based on tenure
✅ **Secure Bridges**: Uses canonical, battle-tested cross-chain messaging
✅ **Flexible Updates**: Monthly weight recalculation with configurable cutoffs
✅ **Org Support**: Fixed percentage allocations for organizations

The system ensures that member weights are calculated fairly based on tenure, and funds are distributed consistently across all supported networks, with ultimate control resting with the Protocol Guild DAO.
