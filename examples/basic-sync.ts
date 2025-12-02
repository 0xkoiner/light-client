/**
 * Basic Light Client Sync Example
 *
 * This example demonstrates how to:
 * 1. Initialize a light client
 * 2. Connect to the Ethereum network
 * 3. Sync to the latest finalized block
 * 4. Monitor ongoing updates
 */

import { LightClient } from '../src/client/LightClient';
import { LightClientEvent } from '../src/types';
import networks from '../config/networks.json';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🚀 Starting Light Client Sync Example\n');

  // Get network configuration
  const network = process.env.NETWORK || 'sepolia';
  const networkConfig = networks[network as keyof typeof networks];

  if (!networkConfig) {
    console.error(`Unknown network: ${network}`);
    process.exit(1);
  }

  console.log(`Network: ${networkConfig.name}`);
  console.log(`Beacon Node: ${networkConfig.beaconNodeUrl}\n`);

  // Initialize light client
  const client = new LightClient({
    network: network as 'mainnet' | 'sepolia' | 'holesky',
    beaconNodeUrl: process.env.BEACON_NODE_URL || networkConfig.beaconNodeUrl,
    executionRpcUrl: process.env.EXECUTION_RPC_URL || networkConfig.executionRpcUrl,
    checkpointRoot: process.env.CHECKPOINT_ROOT,
  });

  // Listen for events
  client.on(LightClientEvent.FINALIZED, (slot: number) => {
    console.log(`✅ New finalized block: slot ${slot}`);
  });

  client.on(LightClientEvent.OPTIMISTIC, (slot: number) => {
    console.log(`⚡ New optimistic block: slot ${slot}`);
  });

  client.on(LightClientEvent.SYNC_PROGRESS, (progress: number) => {
    console.log(`📊 Sync progress: ${progress.toFixed(2)}%`);
  });

  client.on(LightClientEvent.ERROR, (error: Error) => {
    console.error(`❌ Error: ${error.message}`);
  });

  try {
    // Initialize light client (will fetch checkpoint automatically if not provided)
    console.log('🔧 Initializing light client...');
    console.log('   (Fetching finalized checkpoint from beacon node...)');
    await client.initialize();

    // Start syncing
    console.log('🔄 Starting sync...');
    await client.start();

    // Display sync status
    const status = client.getSyncStatus();
    console.log('\n📊 Sync Status:');
    console.log(`  Finalized Slot: ${status.finalizedSlot}`);
    console.log(`  Optimistic Slot: ${status.optimisticSlot}`);
    console.log(`  Progress: ${status.progress.toFixed(2)}%`);
    console.log(`  Synced: ${status.isSynced ? 'Yes' : 'No'}`);
    console.log(`  Current Period: ${status.currentPeriod}\n`);

    console.log('👂 Listening for updates... (Press Ctrl+C to stop)\n');

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  process.exit(0);
});

main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
