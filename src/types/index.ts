/**
 * Core type definitions for Ethereum Light Client
 * Based on Altair Light Client specification
 */

// Types are available from @lodestar/types but not exported at top level
// import type { altair, bellatrix, capella, deneb } from '@lodestar/types';

/**
 * Configuration for light client initialization
 */
export interface LightClientConfig {
  /** Beacon node REST API URL */
  beaconNodeUrl: string;

  /** Execution layer RPC URL (for balance queries, state access) */
  executionRpcUrl: string;

  /** Network name (mainnet, sepolia, holesky) */
  network: 'mainnet' | 'sepolia' | 'holesky';

  /** Optional trusted checkpoint root */
  checkpointRoot?: string;
}

/**
 * Sync status information
 */
export interface SyncStatus {
  /** Current finalized slot */
  finalizedSlot: number;

  /** Current optimistic slot */
  optimisticSlot: number;

  /** Sync progress percentage */
  progress: number;

  /** Whether client is synced */
  isSynced: boolean;

  /** Current sync committee period */
  currentPeriod: number;
}

/**
 * Account state information
 */
export interface AccountState {
  /** Account balance in wei */
  balance: bigint;

  /** Account nonce */
  nonce: number;

  /** Code hash (for contracts) */
  codeHash: string;

  /** Storage root */
  storageRoot: string;
}

/**
 * Transaction verification result
 */
export interface TransactionProof {
  /** Transaction hash */
  txHash: string;

  /** Block number */
  blockNumber: number;

  /** Whether transaction is finalized */
  isFinalized: boolean;

  /** Transaction index in block */
  transactionIndex: number;
}

/**
 * Network configuration
 */
export interface NetworkConfig {
  name: string;
  beaconNodeUrl: string;
  executionRpcUrl: string;
  checkpointSyncUrl: string;
  genesisTime: number;
  genesisValidatorsRoot: string;
}

/**
 * Event types emitted by light client
 */
export enum LightClientEvent {
  FINALIZED = 'finalized',
  OPTIMISTIC = 'optimistic',
  SYNC_PROGRESS = 'sync_progress',
  ERROR = 'error',
}
