/**
 * Merkle Patricia Trie proof verification
 * Used to verify execution layer state proofs against consensus layer state root
 */

import { keccak256 } from 'ethereum-cryptography/keccak.js';
import { RLP } from '@ethereumjs/rlp';
import { Trie } from '@ethereumjs/trie';
import { bytesToHex, hexToBytes } from '@ethereumjs/util';

/**
 * Verify Merkle Patricia Trie proof
 *
 * @param rootHash - Root hash of the trie
 * @param key - Key to verify (keccak256 hash of address)
 * @param proof - Merkle proof nodes
 * @param expectedValue - Expected RLP-encoded value
 * @returns True if proof is valid
 */
export function verifyMerkleProof(
  rootHash: Uint8Array,
  key: Uint8Array,
  proof: Uint8Array[],
  expectedValue: Uint8Array
): boolean {
  try {
    // Start from root
    let currentHash = rootHash;
    const keyNibbles = bytesToNibbles(key);
    let nibblesIndex = 0;

    // Walk through proof nodes
    for (let i = 0; i < proof.length; i++) {
      const node = proof[i];

      // Verify current node hash matches
      const nodeHash = keccak256(node);
      if (!arraysEqual(currentHash, nodeHash)) {
        return false;
      }

      // Decode RLP node
      const decoded = RLP.decode(node) as Uint8Array[];

      // Branch node (17 items)
      if (decoded.length === 17) {
        if (nibblesIndex >= keyNibbles.length) {
          // Value stored in branch node
          if (i === proof.length - 1) {
            return arraysEqual(decoded[16], expectedValue);
          }
          return false;
        }
        // Navigate to next node
        const nextIndex = keyNibbles[nibblesIndex];
        nibblesIndex++;
        currentHash = decoded[nextIndex] as Uint8Array;
      }
      // Leaf or extension node (2 items)
      else if (decoded.length === 2) {
        const [encodedPath, value] = decoded;
        const { prefix, nibbles } = decodeNibbles(encodedPath as Uint8Array);

        // Check if nibbles match
        const matchingNibbles = nibbles.slice(
          0,
          Math.min(nibbles.length, keyNibbles.length - nibblesIndex)
        );
        const keyMatchingNibbles = keyNibbles.slice(
          nibblesIndex,
          nibblesIndex + matchingNibbles.length
        );

        if (!arraysEqual(matchingNibbles, keyMatchingNibbles)) {
          return false;
        }

        nibblesIndex += nibbles.length;

        // Leaf node
        if (prefix === 2 || prefix === 3) {
          if (i === proof.length - 1 && nibblesIndex === keyNibbles.length) {
            return arraysEqual(value as Uint8Array, expectedValue);
          }
          return false;
        }
        // Extension node
        else if (prefix === 0 || prefix === 1) {
          currentHash = value as Uint8Array;
        } else {
          return false;
        }
      } else {
        return false;
      }
    }

    return false;
  } catch (error) {
    console.error('Merkle proof verification error:', error);
    return false;
  }
}

/**
 * Verify account proof against state root using @ethereumjs/trie
 *
 * @param stateRoot - State root from consensus layer
 * @param address - Account address
 * @param accountProof - Merkle proof for account
 * @param balance - Expected balance
 * @param nonce - Expected nonce
 * @param codeHash - Expected code hash
 * @param storageHash - Expected storage hash
 * @returns True if proof is valid
 */
export async function verifyAccountProof(
  stateRoot: string,
  address: string,
  accountProof: string[],
  balance: bigint,
  nonce: number,
  codeHash: string,
  storageHash: string
): Promise<boolean> {
  try {
    // Convert state root to bytes
    const rootBytes = hexToBytes(stateRoot as `0x${string}`);

    // Hash address to get key (keccak256 of address)
    const addressBytes = hexToBytes(address as `0x${string}`);
    const keyBytes = keccak256(addressBytes);

    // Convert proof to bytes (array of Uint8Arrays)
    const proofBytes = accountProof.map((p) => hexToBytes(p as `0x${string}`));

    // RLP encode expected account data [nonce, balance, storageHash, codeHash]
    const accountData = [
      nonce === 0 ? new Uint8Array() : bigintToBytes(BigInt(nonce)),
      balance === BigInt(0) ? new Uint8Array() : bigintToBytes(balance),
      hexToBytes(storageHash as `0x${string}`),
      hexToBytes(codeHash as `0x${string}`),
    ];
    const expectedAccountRlp = RLP.encode(accountData);

    // Use @ethereumjs/trie to verify the proof
    const verified = await Trie.verifyProof(keyBytes, proofBytes, { root: rootBytes });

    // If verification fails (null), return false
    if (!verified) {
      return false;
    }

    // Compare the verified value with expected account RLP
    return arraysEqual(verified, expectedAccountRlp);
  } catch (error) {
    console.error('Account proof verification error:', error);
    return false;
  }
}

/**
 * Verify storage proof against storage root using @ethereumjs/trie
 *
 * @param storageRoot - Storage root from account proof
 * @param storageKey - Storage key
 * @param storageProof - Merkle proof for storage
 * @param expectedValue - Expected storage value
 * @returns True if proof is valid
 */
export async function verifyStorageProof(
  storageRoot: string,
  storageKey: string,
  storageProof: string[],
  expectedValue: string
): Promise<boolean> {
  try {
    // Convert storage root to bytes
    const rootBytes = hexToBytes(storageRoot as `0x${string}`);

    // Hash storage key (keccak256 of storage slot)
    const keyBytes = keccak256(hexToBytes(storageKey as `0x${string}`));

    // Convert proof to bytes (array of Uint8Arrays)
    const proofBytes = storageProof.map((p) => hexToBytes(p as `0x${string}`));

    // RLP encode expected storage value
    const valueBytes = hexToBytes(expectedValue as `0x${string}`);
    const expectedValueRlp = RLP.encode(valueBytes);

    // Use @ethereumjs/trie to verify the proof
    const verified = await Trie.verifyProof(keyBytes, proofBytes, { root: rootBytes });

    // If verification fails (null), return false
    if (!verified) {
      return false;
    }

    // Compare the verified value with expected value RLP
    return arraysEqual(verified, expectedValueRlp);
  } catch (error) {
    console.error('Storage proof verification error:', error);
    return false;
  }
}

// Helper functions

function bytesToNibbles(bytes: Uint8Array): number[] {
  const nibbles: number[] = [];
  for (const byte of bytes) {
    nibbles.push(byte >> 4);
    nibbles.push(byte & 0x0f);
  }
  return nibbles;
}

function decodeNibbles(encoded: Uint8Array): {
  prefix: number;
  nibbles: number[];
} {
  const prefix = encoded[0] >> 4;
  const nibbles: number[] = [];

  // Odd length (prefix 1 or 3)
  if (prefix === 1 || prefix === 3) {
    nibbles.push(encoded[0] & 0x0f);
    for (let i = 1; i < encoded.length; i++) {
      nibbles.push(encoded[i] >> 4);
      nibbles.push(encoded[i] & 0x0f);
    }
  }
  // Even length (prefix 0 or 2)
  else {
    for (let i = 1; i < encoded.length; i++) {
      nibbles.push(encoded[i] >> 4);
      nibbles.push(encoded[i] & 0x0f);
    }
  }

  return { prefix, nibbles };
}

function bigintToBytes(value: bigint): Uint8Array {
  if (value === BigInt(0)) return new Uint8Array();
  const hex = value.toString(16);
  const padded = hex.length % 2 === 0 ? hex : '0' + hex;
  return Uint8Array.from(Buffer.from(padded, 'hex'));
}

function arraysEqual(a: Uint8Array | number[], b: Uint8Array | number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
