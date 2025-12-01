/**
 * Ethereum Light Client - Main Entry Point
 *
 * This library provides a lightweight Ethereum client that verifies blockchain data
 * using sync committees and Merkle proofs without downloading full blocks.
 */

export { LightClient } from './client/LightClient.js';
export * from './types/index.js';
