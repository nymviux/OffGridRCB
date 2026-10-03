import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// Sync API needs a sync SHA-512; Hermes has no crypto.subtle.
ed.hashes.sha512 = sha512;

export { ed };

export function verifySignature(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
