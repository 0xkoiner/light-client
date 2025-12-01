/**
 * Get Balance Example
 *
 * This example demonstrates how to query account balances
 * using the light client with state proof verification.
 */

import { LightClient } from '../src/client/LightClient';
import networks from '../config/networks.json';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('💰 Get Balance Example\n');

  const network = process.env.NETWORK || 'sepolia';
  const networkConfig = networks[network as keyof typeof networks];

  if (!networkConfig) {
    console.error(`Unknown network: ${network}`);
    process.exit(1);
  }

  // Initialize light client
  const client = new LightClient({
    network: network as 'mainnet' | 'sepolia' | 'holesky',
    beaconNodeUrl: process.env.BEACON_NODE_URL || networkConfig.beaconNodeUrl,
    executionRpcUrl: process.env.EXECUTION_RPC_URL || networkConfig.executionRpcUrl,
  });

  try {
    // Fetch checkpoint and initialize
    console.log('🔧 Initializing light client...');
    const checkpointResponse = await fetch(networkConfig.checkpointSyncUrl);
    const checkpointData = await checkpointResponse.json();
    const checkpointRoot = checkpointData.data?.root || checkpointData.root;

    await client.initialize(checkpointRoot);
    await client.start();

    console.log('✓ Light client synced\n');

    // Example addresses to query (Vitalik's address on all networks)
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

    console.log(`📍 Querying balance for: ${address}`);

    // Get balance with proof verification
    const balance = await client.getBalance(address);

    console.log(`\n💰 Balance: ${balance.toString()} wei`);
    console.log(`💰 Balance: ${Number(balance) / 1e18} ETH\n`);

    // Get full account state
    console.log('📊 Getting full account state...');
    const accountState = await client.getAccountState(address);

    console.log('\n📊 Account State:');
    console.log(`  Balance: ${accountState.balance.toString()} wei`);
    console.log(`  Nonce: ${accountState.nonce}`);
    console.log(`  Code Hash: ${accountState.codeHash}`);
    console.log(`  Storage Root: ${accountState.storageRoot}\n`);

    await client.stop();
    console.log('✓ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
