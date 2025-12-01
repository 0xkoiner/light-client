/**
 * Merkle Patricia Trie proof verification
 * Used to verify execution layer state proofs against consensus layer state root
 */

import { keccak256 } from 'ethereum-cryptography/keccak.js';
import { RLP } from '@ethereumjs/rlp';

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
 * Verify account proof against state root
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
export function verifyAccountProof(
  stateRoot: string,
  address: string,
  accountProof: string[],
  balance: bigint,
  nonce: number,
  codeHash: string,
  storageHash: string
): boolean {
  try {
    // Convert state root to bytes
    const rootBytes = hexToBytes(stateRoot);

    // Hash address to get key
    const addressBytes = hexToBytes(address);
    const keyBytes = keccak256(addressBytes);

    // Convert proof to bytes
    const proofBytes = accountProof.map((p) => hexToBytes(p));

    // RLP encode account data [nonce, balance, storageHash, codeHash]
    const accountData = [
      nonce === 0 ? new Uint8Array() : bigintToBytes(BigInt(nonce)),
      balance === BigInt(0) ? new Uint8Array() : bigintToBytes(balance),
      hexToBytes(storageHash),
      hexToBytes(codeHash),
    ];
    const accountRlp = RLP.encode(accountData);

    // Verify proof
    return verifyMerkleProof(rootBytes, keyBytes, proofBytes, accountRlp);
  } catch (error) {
    console.error('Account proof verification error:', error);
    return false;
  }
}

/**
 * Verify storage proof against storage root
 *
 * @param storageRoot - Storage root from account proof
 * @param storageKey - Storage key
 * @param storageProof - Merkle proof for storage
 * @param expectedValue - Expected storage value
 * @returns True if proof is valid
 */
export function verifyStorageProof(
  storageRoot: string,
  storageKey: string,
  storageProof: string[],
  expectedValue: string
): boolean {
  try {
    // Convert storage root to bytes
    const rootBytes = hexToBytes(storageRoot);

    // Hash storage key
    const keyBytes = keccak256(hexToBytes(storageKey));

    // Convert proof to bytes
    const proofBytes = storageProof.map((p) => hexToBytes(p));

    // RLP encode storage value
    const valueBytes = hexToBytes(expectedValue);
    const valueRlp = RLP.encode(valueBytes);

    // Verify proof
    return verifyMerkleProof(rootBytes, keyBytes, proofBytes, valueRlp);
  } catch (error) {
    console.error('Storage proof verification error:', error);
    return false;
  }
}

// Helper functions

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (cleaned.length === 0) return new Uint8Array();
  return Uint8Array.from(Buffer.from(cleaned, 'hex'));
}

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
