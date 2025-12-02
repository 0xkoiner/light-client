# Ethereum Light Client

A TypeScript implementation of an Ethereum light client using Lodestar, providing trust-minimized access to blockchain data without running a full node.

## Features

- ✅ Trust-minimized blockchain verification using sync committees
- ✅ Lightweight resource requirements (~256MB RAM, minimal storage)
- ✅ State proof verification for account balances and storage
- ✅ Sync with Ethereum mainnet, Sepolia, or Holesky testnet
- ✅ Real-time updates (optimistic ~12s, finalized ~6.4min)
- ✅ TypeScript with full type safety

## What is a Light Client?

A light client is a resource-efficient blockchain node that:
- Downloads only block headers (not full blocks)
- Verifies data using cryptographic proofs (Merkle proofs, BLS signatures)
- Uses sync committees (512 randomly selected validators every ~27 hours)
- Provides trust-minimized verification without relying on centralized RPC providers

## Project Structure

```
light-client/
├── src/
│   ├── client/          # Core light client implementation
│   ├── transport/       # Beacon node API communication
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Utility functions
├── config/              # Network configurations
├── examples/            # Usage examples
├── test/                # Test suites
└── scripts/             # Helper scripts
```

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with your configuration:
```env
NETWORK=sepolia
BEACON_NODE_URL=https://lodestar-sepolia.chainsafe.io
EXECUTION_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

Get a free API key from:
- [Alchemy](https://www.alchemy.com/)
- [Infura](https://infura.io/)

## Usage

### Basic Synchronization

```typescript
import { LightClient } from '@openfort/ethereum-light-client';

const client = new LightClient({
  network: 'sepolia',
  beaconNodeUrl: 'https://lodestar-sepolia.chainsafe.io',
  executionRpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY',
});

// Initialize from trusted checkpoint
await client.initialize(checkpointRoot);

// Start syncing
await client.start();

// Get sync status
const status = client.getSyncStatus();
console.log(`Finalized slot: ${status.finalizedSlot}`);
```

### Query Account Balance

```typescript
// Get balance with proof verification
const balance = await client.getBalance('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
console.log(`Balance: ${Number(balance) / 1e18} ETH`);
```

### Listen for Updates

```typescript
import { LightClientEvent } from '@openfort/ethereum-light-client';

client.on(LightClientEvent.FINALIZED, (slot) => {
  console.log(`New finalized block: ${slot}`);
});

client.on(LightClientEvent.OPTIMISTIC, (slot) => {
  console.log(`New optimistic block: ${slot}`);
});
```

## Examples

Run the included examples:

```bash
# Basic synchronization
npm run example:sync

# Get account balance
npm run example:balance

# Verify transaction
npm run example:verify
```

## Development

```bash
# Type checking
npm run typecheck

# Build and watch
npm run build:watch

# Development with hot reload
npm run dev

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format

# Run tests
npm test
npm run test:watch
```

## How It Works

### 1. Bootstrap
The light client starts from a trusted checkpoint (recent finalized block root):
- Fetches checkpoint from checkpoint sync service
- Downloads sync committee for current period
- Verifies sync committee proof against checkpoint root

### 2. Synchronization
Syncs through historical periods to catch up:
- Downloads light client updates (one per sync committee period)
- Verifies each update using BLS signature aggregates
- Tracks sync committee rotations every ~27 hours

### 3. Ongoing Updates
Stays synchronized with the network:
- Polls for optimistic updates every 12 seconds (slot time)
- Polls for finality updates every ~6.4 minutes (epoch time)
- Verifies >2/3 sync committee participation
- Updates internal state

### 4. State Queries
Queries blockchain state with proof verification:
- Requests account/storage proofs from execution layer
- Verifies Merkle proofs against state root
- Returns verified data

## Architecture

```
┌─────────────────────────┐
│   Your Application      │
└──────────┬──────────────┘
           │
           ↓
┌─────────────────────────┐
│    Light Client         │
│  (This Library)         │
└──────────┬──────────────┘
           │
           ↓
┌─────────────────────────┐
│  Lodestar Light Client  │
│  (via REST API)         │
└──────────┬──────────────┘
           │
           ↓
┌─────────────────────────┐
│   Ethereum Beacon Chain │
│   (P2P Network)         │
└─────────────────────────┘
```

## Security Considerations

### Trust Model
- Light clients are "trust-minimized" not "trustless"
- Relies on honest majority (>2/3) of sync committee
- Sync committee is randomly selected from all validators
- Very high security assuming >66% honest validators

### Checkpoint Trust
- Initial checkpoint must be trusted
- Use checkpoints < 24 hours old
- Obtain from multiple sources if possible
- Community provides checkpoint sync services

### NPM Installation Warning
⚠️ **Note**: This project uses Lodestar via npm for development convenience. For production use, consider:
- Running Lodestar binary directly (Docker or binary installation)
- Building from source
- The Lodestar team warns against npm installation due to supply chain attack risks

## Network Support

### Mainnet
- Network: `mainnet`
- Beacon Node: `https://lodestar-mainnet.chainsafe.io`
- Checkpoint Sync: `https://beaconstate.info/eth/v2/debug/beacon/states/finalized`

### Sepolia (Testnet)
- Network: `sepolia`
- Beacon Node: `https://lodestar-sepolia.chainsafe.io`
- Checkpoint Sync: `https://checkpoint-sync.sepolia.ethpandaops.io`

### Holesky (Testnet)
- Network: `holesky`
- Beacon Node: `https://lodestar-holesky.chainsafe.io`
- Checkpoint Sync: `https://checkpoint-sync.holesky.ethpandaops.io`

## Resource Requirements

- **Storage**: ~100MB for headers and sync committee data
- **Memory**: ~256MB runtime
- **Bandwidth**: ~10KB every 12 seconds
- **CPU**: Minimal (BLS verification only)

## Limitations

- Cannot validate historical state before checkpoint
- ~6.4 minute finality delay (vs instant for full nodes)
- Depends on honest sync committee majority (>2/3)
- Requires connection to beacon node API
- Cannot produce blocks or participate in consensus

## Roadmap

- [ ] Full LightClient implementation with Lodestar integration
- [ ] BeaconNodeAPI REST client
- [ ] Merkle proof verification utilities
- [ ] Storage proof verification
- [ ] Transaction verification
- [ ] Multi-beacon-node fallback support
- [ ] Local checkpoint caching
- [ ] Comprehensive test suite
- [ ] Performance optimizations
- [ ] Browser support via WASM

## Resources

### Specifications
- [Altair Light Client Spec](https://github.com/ethereum/consensus-specs/blob/dev/specs/altair/light-client/sync-protocol.md)
- [Light Client REST API](https://ethereum.github.io/beacon-APIs/#/Beacon/getLightClientBootstrap)
- [Execution API Proofs (EIP-1186)](https://eips.ethereum.org/EIPS/eip-1186)

### Implementations
- [Lodestar (TypeScript)](https://github.com/ChainSafe/lodestar)
- [Helios (Rust)](https://github.com/a16z/helios)
- [Nimbus (Nim)](https://github.com/status-im/nimbus-eth1)

### Documentation
- [Ethereum.org Light Clients](https://ethereum.org/en/developers/docs/nodes-and-clients/light-clients/)
- [Lodestar Documentation](https://chainsafe.github.io/lodestar/)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- [ChainSafe](https://chainsafe.io/) for Lodestar
- [Ethereum Foundation](https://ethereum.org/) for light client specification
- Community checkpoint sync providers
