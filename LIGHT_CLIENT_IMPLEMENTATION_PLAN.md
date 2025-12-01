# Light Client Implementation Plan

## Overview
This document outlines the step-by-step process to implement an Ethereum light client that can run locally and retrieve blockchain data with minimal resource requirements.

## What is a Light Client?

A light client is a resource-efficient blockchain node that:
- Downloads only block headers (not full blocks)
- Verifies data using cryptographic proofs
- Uses sync committees (512 randomly selected validators every ~27 hours)
- Requires minimal storage, memory, and computing power
- Provides trust-minimized verification without relying on centralized RPC providers

## Architecture Components

### 1. Core Components
- **Sync Committee Tracker**: Monitors the rotating set of 512 validators
- **Header Verifier**: Validates block headers using aggregated signatures
- **Proof Verifier**: Verifies Merkle proofs for state and transaction data
- **Checkpoint Manager**: Maintains sync state and handles bootstrap
- **Transport Layer**: Communicates with beacon nodes via REST API

### 2. Data Structures

#### LightClientBootstrap
```
{
  header: BeaconBlockHeader,
  current_sync_committee: SyncCommittee,
  current_sync_committee_branch: Merkle proof
}
```

#### LightClientUpdate
```
{
  attested_header: BeaconBlockHeader,
  next_sync_committee: SyncCommittee,
  next_sync_committee_branch: Merkle proof,
  finalized_header: BeaconBlockHeader,
  finality_branch: Merkle proof,
  sync_aggregate: BLS signatures,
  signature_slot: uint64
}
```

#### LightClientOptimisticUpdate
```
{
  attested_header: BeaconBlockHeader,
  sync_aggregate: BLS signatures,
  signature_slot: uint64
}
```

#### LightClientFinalityUpdate
```
{
  attested_header: BeaconBlockHeader,
  finalized_header: BeaconBlockHeader,
  finality_branch: Merkle proof,
  sync_aggregate: BLS signatures,
  signature_slot: uint64
}
```

## Implementation Steps

### Phase 1: Project Setup

#### Step 1.1: Initialize Node.js Project
```bash
npm init -y
npm install typescript @types/node ts-node --save-dev
npx tsc --init
```

#### Step 1.2: Install Dependencies
```bash
# Core dependencies
npm install @lodestar/light-client @lodestar/types @lodestar/params

# Alternative: Use ethers.js for simpler integration
npm install ethers

# For custom implementation
npm install @chainsafe/bls @noble/hashes axios
```

#### Step 1.3: Project Structure
```
light-client/
├── src/
│   ├── client/
│   │   ├── LightClient.ts          # Main client class
│   │   ├── SyncCommitteeTracker.ts # Sync committee management
│   │   ├── HeaderVerifier.ts       # Signature verification
│   │   └── ProofVerifier.ts        # Merkle proof verification
│   ├── transport/
│   │   └── BeaconNodeAPI.ts        # REST API client
│   ├── types/
│   │   └── index.ts                # Type definitions
│   ├── utils/
│   │   ├── merkle.ts               # Merkle tree utilities
│   │   └── crypto.ts               # BLS signature utilities
│   └── index.ts                    # Entry point
├── config/
│   └── networks.json               # Network configurations
├── examples/
│   ├── basic-sync.ts               # Basic synchronization
│   ├── get-balance.ts              # Query account balance
│   └── verify-transaction.ts      # Verify transaction inclusion
├── package.json
├── tsconfig.json
└── README.md
```

### Phase 2: Core Implementation

#### Step 2.1: Beacon Node API Client
Implement REST API communication with beacon nodes:

**Required Endpoints:**
- `GET /eth/v1/beacon/light_client/bootstrap/{block_root}`
- `GET /eth/v1/beacon/light_client/updates?start_period={period}&count={count}`
- `GET /eth/v1/beacon/light_client/finality_update`
- `GET /eth/v1/beacon/light_client/optimistic_update`

**Implementation:**
```typescript
class BeaconNodeAPI {
  constructor(baseUrl: string);

  async getBootstrap(blockRoot: string): Promise<LightClientBootstrap>;
  async getUpdates(startPeriod: number, count: number): Promise<LightClientUpdate[]>;
  async getFinalityUpdate(): Promise<LightClientFinalityUpdate>;
  async getOptimisticUpdate(): Promise<LightClientOptimisticUpdate>;
}
```

#### Step 2.2: Sync Committee Tracker
Track the current and next sync committees:

```typescript
class SyncCommitteeTracker {
  currentCommittee: SyncCommittee;
  nextCommittee: SyncCommittee | null;
  currentPeriod: number;

  updateCommittee(update: LightClientUpdate): void;
  isValidSignature(header: BeaconBlockHeader, aggregate: SyncAggregate): boolean;
  getCurrentCommittee(): SyncCommittee;
}
```

#### Step 2.3: Header Verifier
Verify block headers using BLS signatures:

```typescript
class HeaderVerifier {
  verifyHeader(
    header: BeaconBlockHeader,
    syncAggregate: SyncAggregate,
    syncCommittee: SyncCommittee
  ): boolean;

  checkParticipationThreshold(syncAggregate: SyncAggregate): boolean;
  verifyBLSSignature(
    pubkeys: PublicKey[],
    message: Uint8Array,
    signature: Signature
  ): boolean;
}
```

#### Step 2.4: Proof Verifier
Verify Merkle proofs for state access:

```typescript
class ProofVerifier {
  verifyMerkleProof(
    leaf: Uint8Array,
    branch: Uint8Array[],
    index: number,
    root: Uint8Array
  ): boolean;

  verifyAccountProof(
    address: string,
    stateRoot: Uint8Array,
    proof: Uint8Array[]
  ): AccountState;

  verifyStorageProof(
    storageKey: string,
    storageRoot: Uint8Array,
    proof: Uint8Array[]
  ): Uint8Array;
}
```

#### Step 2.5: Main Light Client
Orchestrate all components:

```typescript
class LightClient {
  private api: BeaconNodeAPI;
  private syncTracker: SyncCommitteeTracker;
  private headerVerifier: HeaderVerifier;
  private proofVerifier: ProofVerifier;
  private latestFinalizedHeader: BeaconBlockHeader;
  private latestOptimisticHeader: BeaconBlockHeader;

  async initialize(checkpointRoot: string): Promise<void>;
  async sync(): Promise<void>;
  async getBalance(address: string): Promise<bigint>;
  async getStorageAt(address: string, slot: string): Promise<Uint8Array>;
  async verifyTransaction(txHash: string): Promise<TransactionProof>;

  on(event: 'finalized', callback: (header: BeaconBlockHeader) => void): void;
  on(event: 'optimistic', callback: (header: BeaconBlockHeader) => void): void;
}
```

### Phase 3: Synchronization Logic

#### Step 3.1: Bootstrap Process
1. Obtain trusted checkpoint (block root) from:
   - Ethereum community checkpoints
   - Trusted beacon node
   - Checkpoint sync services

2. Request bootstrap data from beacon node
3. Verify sync committee proof against checkpoint root
4. Initialize sync committee tracker

#### Step 3.2: Historical Sync
1. Calculate current sync committee period
2. Request updates from bootstrap period to current
3. For each update:
   - Verify signatures using current sync committee
   - Update to next sync committee when period changes
   - Track finalized headers
4. Continue until caught up to current period

#### Step 3.3: Ongoing Sync
1. Poll for optimistic updates every 12 seconds (slot time)
2. Poll for finality updates every ~6.4 minutes (epoch time)
3. Verify each update:
   - Check sync aggregate has >2/3 participation
   - Verify BLS signatures
   - Verify Merkle branches
4. Update internal state
5. Emit events for applications

### Phase 4: Data Retrieval

#### Step 4.1: Account Balance
1. Get latest finalized execution block hash from header
2. Request account proof from execution layer endpoint
3. Verify proof against state root
4. Extract balance from account state

#### Step 4.2: Storage Access
1. Get execution block hash
2. Request storage proof for contract address and slot
3. Verify account proof
4. Verify storage proof against storage root
5. Return storage value

#### Step 4.3: Transaction Verification
1. Get transaction receipt with proof
2. Verify transaction inclusion in block
3. Verify block header is finalized
4. Return verification result

### Phase 5: Local Deployment

#### Step 5.1: Configuration
Create `config/networks.json`:
```json
{
  "mainnet": {
    "name": "Ethereum Mainnet",
    "beaconNodeUrl": "https://lodestar-mainnet.chainsafe.io",
    "executionRpcUrl": "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY",
    "checkpointSyncUrl": "https://beaconstate.info/eth/v2/debug/beacon/states/finalized",
    "genesisTime": 1606824023,
    "genesisValidatorsRoot": "0x4b363db94e286120d76eb905340fdd4e54bfe9f06bf33ff6cf5ad27f511bfe95"
  },
  "sepolia": {
    "name": "Sepolia Testnet",
    "beaconNodeUrl": "https://lodestar-sepolia.chainsafe.io",
    "executionRpcUrl": "https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY",
    "checkpointSyncUrl": "https://beaconstate.sepolia.dev/eth/v2/debug/beacon/states/finalized",
    "genesisTime": 1655733600,
    "genesisValidatorsRoot": "0xd8ea171f3c94aea21ebc42a1ed61052acf3f9209c00e4efbaaddac09ed9b8078"
  }
}
```

#### Step 5.2: Example Usage
Create `examples/basic-sync.ts`:
```typescript
import { LightClient } from '../src/client/LightClient';
import networks from '../config/networks.json';

async function main() {
  const network = networks.sepolia;

  console.log('Initializing light client...');
  const client = new LightClient({
    beaconNodeUrl: network.beaconNodeUrl,
    executionRpcUrl: network.executionRpcUrl,
    network: 'sepolia'
  });

  // Get trusted checkpoint
  console.log('Fetching checkpoint...');
  const checkpoint = await fetch(network.checkpointSyncUrl)
    .then(r => r.json())
    .then(data => data.data.root);

  // Initialize from checkpoint
  console.log('Bootstrapping from checkpoint:', checkpoint);
  await client.initialize(checkpoint);

  // Sync to latest
  console.log('Syncing to latest finalized block...');
  await client.sync();

  console.log('Light client synced!');
  console.log('Latest finalized slot:', client.getFinalizedSlot());
  console.log('Latest optimistic slot:', client.getOptimisticSlot());

  // Subscribe to updates
  client.on('finalized', (header) => {
    console.log('New finalized block:', header.slot);
  });

  client.on('optimistic', (header) => {
    console.log('New optimistic block:', header.slot);
  });

  // Keep running
  console.log('Listening for updates...');
  await new Promise(() => {}); // Run forever
}

main().catch(console.error);
```

Create `examples/get-balance.ts`:
```typescript
import { LightClient } from '../src/client/LightClient';

async function main() {
  const client = new LightClient({
    beaconNodeUrl: 'https://lodestar-sepolia.chainsafe.io',
    executionRpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY',
    network: 'sepolia'
  });

  await client.initialize(/* checkpoint */);
  await client.sync();

  // Get balance for Vitalik's address
  const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  const balance = await client.getBalance(address);

  console.log(`Balance of ${address}:`, balance.toString(), 'wei');
  console.log(`Balance in ETH:`, Number(balance) / 1e18);
}

main().catch(console.error);
```

#### Step 5.3: Running the Client

**Development mode:**
```bash
npm run dev
```

**Build and run:**
```bash
npm run build
npm start
```

**Run examples:**
```bash
npm run example:sync
npm run example:balance
```

### Phase 6: Testing & Verification

#### Step 6.1: Unit Tests
Test individual components:
- Merkle proof verification
- BLS signature verification
- Sync committee updates
- Header validation

#### Step 6.2: Integration Tests
Test end-to-end flows:
- Bootstrap from checkpoint
- Sync multiple periods
- Handle sync committee rotation
- Verify state proofs

#### Step 6.3: Network Tests
Test against live networks:
- Sepolia testnet (recommended)
- Mainnet (production)

### Phase 7: Optimization & Production

#### Step 7.1: Performance
- Cache verified headers
- Batch signature verifications
- Optimize proof verification
- Implement efficient storage

#### Step 7.2: Reliability
- Handle network failures
- Retry failed requests
- Multiple beacon node fallbacks
- Checkpoint caching

#### Step 7.3: Monitoring
- Track sync performance
- Monitor memory usage
- Log verification failures
- Metrics collection

## Quick Start with Lodestar

For rapid prototyping, use the existing Lodestar implementation:

```bash
# Install
npm install @lodestar/light-client

# Basic usage
import { Lightclient } from '@lodestar/light-client';
import { getChainForkConfigFromNetwork } from '@lodestar/light-client/utils';

const config = getChainForkConfigFromNetwork('sepolia');
const transport = new LightClientRestTransport(beaconNodeUrl);
const genesisData = await getGenesisData(transport);

const client = await Lightclient.initializeFromCheckpointRoot({
  config,
  logger: console,
  transport,
  genesisData,
  checkpointRoot: trustedCheckpoint
});

// Listen for updates
client.on(LightclientEvent.finalized, (header) => {
  console.log('Finalized:', header.slot);
});

// Start syncing
await client.start();
```

## Key Considerations

### Security
- Always use trusted checkpoints (< 24 hours old)
- Verify >2/3 sync committee participation
- Validate all Merkle proofs
- Check signature validity

### Resource Requirements
- Storage: ~100MB for headers
- Memory: ~256MB runtime
- Bandwidth: ~10KB/12 seconds
- CPU: Minimal (BLS verification only)

### Limitations
- Cannot validate historical state (pre-checkpoint)
- Depends on honest sync committee majority (>2/3)
- Requires connection to beacon node API
- ~6.4 minute finality delay

### Trade-offs
- Trust: Trust-minimized (not trustless like full nodes)
- Latency: Optimistic updates (12s) vs finalized (6.4m)
- Data: Headers only vs full blocks
- Verification: Proofs required vs direct state access

## Resources

### Specifications
- [Altair Light Client Spec](https://github.com/ethereum/consensus-specs/blob/dev/specs/altair/light-client/sync-protocol.md)
- [Light Client REST API](https://ethereum.github.io/beacon-APIs/#/Beacon/getLightClientBootstrap)
- [Execution API Proofs](https://eips.ethereum.org/EIPS/eip-1186)

### Implementations
- [Lodestar](https://github.com/ChainSafe/lodestar/tree/unstable/packages/light-client) - TypeScript
- [Helios](https://github.com/a16z/helios) - Rust
- [Nimbus](https://github.com/status-im/nimbus-eth1) - Nim

### Tools
- [Checkpoint Sync Services](https://eth-clients.github.io/checkpoint-sync-endpoints/)
- [Beacon Node Endpoints](https://eth-clients.github.io/beacon-API/)

## Next Steps

1. Set up development environment
2. Choose implementation approach (custom vs Lodestar)
3. Implement bootstrap and sync logic
4. Add data retrieval methods
5. Test on Sepolia testnet
6. Deploy to production (mainnet)
7. Build applications on top of light client

---

**Note**: This is a comprehensive plan. Start with Phase 1 and incrementally build toward a working light client. Use Lodestar for quick experimentation, then implement custom logic as needed.
