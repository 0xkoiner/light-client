/**
 * Execution layer client for fetching state proofs
 * Uses eth_getProof (EIP-1186) to retrieve Merkle proofs
 */

import { ethers } from 'ethers';
import type { AccountProof, StorageProof } from '../types/index.js';

export class ExecutionClient {
  private provider: ethers.JsonRpcProvider;

  constructor(rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Get account proof (balance + Merkle proof)
   * Uses eth_getProof (EIP-1186)
   *
   * @param address - Account address
   * @param blockTag - Block number or 'latest'
   * @returns Account proof with Merkle proof
   */
  async getAccountProof(
    address: string,
    blockTag: string = 'latest'
  ): Promise<AccountProof> {
    const proof = await this.provider.send('eth_getProof', [
      address,
      [], // storage keys (empty for balance only)
      blockTag,
    ]);

    return {
      address: proof.address,
      balance: BigInt(proof.balance),
      nonce: proof.nonce,
      codeHash: proof.codeHash,
      storageHash: proof.storageHash,
      accountProof: proof.accountProof,
      storageProof: proof.storageProof,
    };
  }

  /**
   * Get storage proof for contract storage slot
   *
   * @param address - Contract address
   * @param storageKeys - Storage keys to prove
   * @param blockTag - Block number or 'latest'
   * @returns Storage proof with Merkle proofs
   */
  async getStorageProof(
    address: string,
    storageKeys: string[],
    blockTag: string = 'latest'
  ): Promise<StorageProof> {
    const proof = await this.provider.send('eth_getProof', [
      address,
      storageKeys,
      blockTag,
    ]);

    return {
      address: proof.address,
      storageProof: proof.storageProof,
    };
  }

  /**
   * Get account proof with specific storage keys
   *
   * @param address - Account/contract address
   * @param storageKeys - Storage keys to prove
   * @param blockTag - Block number or 'latest'
   * @returns Full account proof including storage
   */
  async getAccountWithStorageProof(
    address: string,
    storageKeys: string[],
    blockTag: string = 'latest'
  ): Promise<AccountProof> {
    const proof = await this.provider.send('eth_getProof', [
      address,
      storageKeys,
      blockTag,
    ]);

    return {
      address: proof.address,
      balance: BigInt(proof.balance),
      nonce: proof.nonce,
      codeHash: proof.codeHash,
      storageHash: proof.storageHash,
      accountProof: proof.accountProof,
      storageProof: proof.storageProof,
    };
  }

  /**
   * Get block by number to retrieve state root
   *
   * @param blockNumber - Block number or 'latest'
   * @returns Block data including state root
   */
  async getBlock(blockNumber: string | number): Promise<any> {
    const blockTag =
      typeof blockNumber === 'number' ? `0x${blockNumber.toString(16)}` : blockNumber;
    return await this.provider.send('eth_getBlockByNumber', [blockTag, false]);
  }
}
