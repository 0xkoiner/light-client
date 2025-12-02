/**
 * Main Light Client implementation
 *
 * This client uses Lodestar's light client library to provide
 * trust-minimized access to Ethereum blockchain data.
 */

import { Lightclient, LightclientEvent } from '@lodestar/light-client';
import { LightClientRestTransport } from '@lodestar/light-client/transport';
import {
  getFinalizedSyncCheckpoint,
  getGenesisData,
  getConsoleLogger,
  getApiFromUrl,
  getChainForkConfigFromNetwork,
} from '@lodestar/light-client/utils';
import { EventEmitter } from 'events';
import { LightClientConfig, SyncStatus, AccountState } from '../types/index.js';
import { ExecutionClient } from '../utils/execution.js';
import { verifyAccountProof, verifyStorageProof } from '../utils/merkle.js';

export class LightClient extends EventEmitter {
  private config: LightClientConfig;
  private lodestarClient?: Lightclient;
  private isInitialized = false;

  constructor(config: LightClientConfig) {
    super();
    this.config = config;
  }

  /**
   * Initialize the light client from a trusted checkpoint
   */
  async initialize(checkpointRoot?: string): Promise<void> {
    // 1. Get chain fork config for network
    const config = getChainForkConfigFromNetwork(this.config.network);

    // 2. Setup logger
    const logger = getConsoleLogger({
      logDebug: Boolean(process.env.DEBUG),
    });

    // 3. Create API client for beacon node
    const api = getApiFromUrl(this.config.beaconNodeUrl, this.config.network);

    // 4. Get genesis data
    const genesisData = await getGenesisData(api);

    // 5. Get checkpoint if not provided
    let finalizedCheckpoint: Uint8Array | string | undefined = checkpointRoot;
    if (!finalizedCheckpoint) {
      finalizedCheckpoint = await getFinalizedSyncCheckpoint(api);
    }

    // Convert checkpoint to Uint8Array if it's a hex string
    let checkpointBytes: Uint8Array;
    if (typeof finalizedCheckpoint === 'string') {
      // Remove 0x prefix if present
      const hex = finalizedCheckpoint.startsWith('0x')
        ? finalizedCheckpoint.slice(2)
        : finalizedCheckpoint;
      checkpointBytes = new Uint8Array(Buffer.from(hex, 'hex'));
    } else {
      checkpointBytes = finalizedCheckpoint as Uint8Array;
    }

    // 6. Create transport
    const transport = new LightClientRestTransport(api);

    // 7. Initialize Lodestar light client
    this.lodestarClient = await Lightclient.initializeFromCheckpointRoot({
      config,
      logger,
      transport,
      genesisData,
      checkpointRoot: checkpointBytes,
      opts: {
        allowForcedUpdates: true,
        updateHeadersOnForcedUpdate: true,
      },
    });

    // 8. Setup event listeners
    this.setupEventListeners();

    this.isInitialized = true;
  }

  /**
   * Start syncing with the network
   */
  async start(): Promise<void> {
    if (!this.isInitialized || !this.lodestarClient) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    await this.lodestarClient.start();
  }

  /**
   * Stop the light client
   */
  async stop(): Promise<void> {
    if (this.lodestarClient) {
      await this.lodestarClient.stop();
    }
  }

  /**
   * Setup event listeners for Lodestar light client
   */
  private setupEventListeners(): void {
    if (!this.lodestarClient) return;

    // Listen for finality updates
    this.lodestarClient.emitter.on(
      LightclientEvent.lightClientFinalityHeader,
      (update: any) => {
        this.emit('finalized', update.beacon.slot);
      }
    );

    // Listen for optimistic updates
    this.lodestarClient.emitter.on(
      LightclientEvent.lightClientOptimisticHeader,
      (update: any) => {
        this.emit('optimistic', update.beacon.slot);
      }
    );
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncStatus {
    if (!this.lodestarClient) {
      return {
        finalizedSlot: 0,
        optimisticSlot: 0,
        progress: 0,
        isSynced: false,
        currentPeriod: 0,
      };
    }

    const head = this.lodestarClient.getHead();
    const finalized = this.lodestarClient.getFinalized();

    return {
      finalizedSlot: finalized.beacon.slot,
      optimisticSlot: head.beacon.slot,
      progress: 100, // TODO: Calculate actual progress
      isSynced: true, // TODO: Determine sync status
      currentPeriod: Math.floor(finalized.beacon.slot / 8192),
    };
  }

  /**
   * Get account balance for an address with proof verification
   *
   * @param address - Account address
   * @returns Verified balance in wei
   * @throws Error if proof verification fails (RPC may be compromised)
   */
  async getBalance(address: string): Promise<bigint> {
    if (!this.lodestarClient) {
      throw new Error('Client not initialized');
    }

    // 1. Get verified state root from light client (consensus layer)
    const stateRoot = this.getStateRoot();
    if (stateRoot === '0x') {
      throw new Error('State root not available');
    }

    // 2. Create execution client
    const executionClient = new ExecutionClient(this.config.executionRpcUrl);

    // 3. Get execution block number from light client
    const executionBlockNumber = this.getExecutionBlockNumber();
    if (!executionBlockNumber) {
      throw new Error('Execution block number not available from light client');
    }

    // 4. Get the block from execution RPC to verify state root
    const executionBlock = await executionClient.getBlock(executionBlockNumber);
    const executionStateRoot = executionBlock.stateRoot;

    console.log('\n🔍 State Root Comparison:');
    console.log(`  Light Client (consensus): ${stateRoot}`);
    console.log(`  Execution RPC (block #${executionBlockNumber}): ${executionStateRoot}`);
    console.log(`  Match: ${stateRoot === executionStateRoot ? '✅ YES' : '❌ NO'}`);

    if (stateRoot !== executionStateRoot) {
      console.log(`\n  Light client slot: ${this.getOptimisticSlot()}`);
      console.log(`  Execution block number: ${executionBlockNumber}`);
      console.log(
        '\n  ⚠️  State roots STILL do not match! This suggests an MPT implementation bug.'
      );
    }

    // 5. Get account proof from RPC at the specific block number
    const blockTag = `0x${executionBlockNumber.toString(16)}`;
    const proof = await executionClient.getAccountProof(address, blockTag);

    // Debug: Log proof details
    if (process.env.DEBUG === 'true') {
      console.log('\nDebug - Proof Details:');
      console.log('  Account Proof length:', proof.accountProof.length);
      console.log('  Balance:', proof.balance.toString());
      console.log('  Nonce:', proof.nonce);
      console.log('  Code Hash:', proof.codeHash);
      console.log('  Storage Hash:', proof.storageHash);
    }

    // 6. Verify the account proof against the state root
    const isValid = await verifyAccountProof(
      stateRoot,
      address,
      proof.accountProof,
      proof.balance,
      proof.nonce,
      proof.codeHash,
      proof.storageHash
    );

    if (!isValid) {
      throw new Error(
        'Invalid proof - RPC may be compromised! Balance proof does not match state root.'
      );
    }

    console.log('✅ Proof verified! Balance is cryptographically verified.\n');

    // 7. Return verified balance
    return proof.balance;
  }

  /**
   * Get full account state with proof verification
   *
   * @param address - Account address
   * @returns Verified account state
   * @throws Error if proof verification fails
   */
  async getAccountState(address: string): Promise<AccountState> {
    if (!this.lodestarClient) {
      throw new Error('Client not initialized');
    }

    // 1. Get verified state root from light client
    const stateRoot = this.getStateRoot();
    if (stateRoot === '0x') {
      throw new Error('State root not available');
    }

    // 2. Create execution client
    const executionClient = new ExecutionClient(this.config.executionRpcUrl);

    // 3. Get execution block number and query proof at that block
    const executionBlockNumber = this.getExecutionBlockNumber();
    if (!executionBlockNumber) {
      throw new Error('Execution block number not available from light client');
    }

    const blockTag = `0x${executionBlockNumber.toString(16)}`;
    const proof = await executionClient.getAccountProof(address, blockTag);

    // 4. Verify account proof against state root
    const isValid = await verifyAccountProof(
      stateRoot,
      address,
      proof.accountProof,
      proof.balance,
      proof.nonce,
      proof.codeHash,
      proof.storageHash
    );

    if (!isValid) {
      throw new Error(
        'Invalid proof - RPC may be compromised! Account proof does not match state root.'
      );
    }

    // 5. Return verified account state
    return {
      balance: proof.balance,
      nonce: proof.nonce,
      codeHash: proof.codeHash,
      storageRoot: proof.storageHash,
    };
  }

  /**
   * Get storage value at a specific slot for a contract with proof verification
   *
   * @param address - Contract address
   * @param slot - Storage slot
   * @returns Verified storage value
   * @throws Error if proof verification fails
   */
  async getStorageAt(address: string, slot: string): Promise<string> {
    if (!this.lodestarClient) {
      throw new Error('Client not initialized');
    }

    // 1. Get verified state root
    const stateRoot = this.getStateRoot();
    if (stateRoot === '0x') {
      throw new Error('State root not available');
    }

    // 2. Create execution client
    const executionClient = new ExecutionClient(this.config.executionRpcUrl);

    // 3. Get execution block number and query proof at that block
    const executionBlockNumber = this.getExecutionBlockNumber();
    if (!executionBlockNumber) {
      throw new Error('Execution block number not available from light client');
    }

    const blockTag = `0x${executionBlockNumber.toString(16)}`;
    const proof = await executionClient.getAccountWithStorageProof(
      address,
      [slot],
      blockTag
    );

    // 4. Verify account proof first
    const accountValid = await verifyAccountProof(
      stateRoot,
      address,
      proof.accountProof,
      proof.balance,
      proof.nonce,
      proof.codeHash,
      proof.storageHash
    );

    if (!accountValid) {
      throw new Error(
        'Invalid account proof - RPC may be compromised! Account does not match state root.'
      );
    }

    // 5. Verify storage proof against storage root
    const storageEntry = proof.storageProof[0];
    if (!storageEntry) {
      return '0x0'; // Empty storage
    }

    const storageValid = await verifyStorageProof(
      proof.storageHash,
      slot,
      storageEntry.proof,
      storageEntry.value
    );

    if (!storageValid) {
      throw new Error(
        'Invalid storage proof - RPC may be compromised! Storage does not match storage root.'
      );
    }

    // 6. Return verified storage value
    return storageEntry.value;
  }

  /**
   * Get the current finalized slot
   */
  getFinalizedSlot(): number {
    return this.lodestarClient?.getFinalized().beacon.slot ?? 0;
  }

  /**
   * Get the current optimistic slot
   */
  getOptimisticSlot(): number {
    return this.lodestarClient?.getHead().beacon.slot ?? 0;
  }

  /**
   * Get the state root from the current head
   * Used for verifying execution layer proofs
   *
   * IMPORTANT: Returns the EXECUTION payload state root, not beacon chain state root
   */
  getStateRoot(): string {
    const head = this.lodestarClient?.getHead();
    if (!head) return '0x';

    // Get state root from execution payload, not beacon chain state
    const execution = (head as any).execution;
    if (!execution || !execution.stateRoot) {
      // Fallback to beacon state root if execution not available
      const stateRoot = head.beacon.stateRoot;
      return '0x' + Buffer.from(stateRoot).toString('hex');
    }

    // Convert Uint8Array to hex string
    return '0x' + Buffer.from(execution.stateRoot).toString('hex');
  }

  /**
   * Get the execution payload block number from current head
   * This is the execution layer block number, not beacon chain slot
   */
  getExecutionBlockNumber(): number | null {
    const head = this.lodestarClient?.getHead();
    if (!head) return null;

    // The execution payload contains the block number
    const execution = (head as any).execution;
    if (!execution || !execution.blockNumber) {
      return null;
    }

    return Number(execution.blockNumber);
  }
}
