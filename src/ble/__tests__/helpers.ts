import { signAlert } from '../sender/signAlert';
import type { AlertFields } from '../protocol/alertCodec';
import { hexToBytes } from '../bytes';
import { TEST_ONLY_SECRET_KEY_HEX } from '../../../tools/fake-node/keys/TEST_ONLY_private_key';
import type { TrustedKey } from '../config';
import vectors from './vectors.json';

export { vectors };
export const NOW = 1767225600 + 60; // one minute after vector issue time
export const SK = hexToBytes(TEST_ONLY_SECRET_KEY_HEX);
export const KEYS: TrustedKey[] = [{ keyId: 1, publicKeyHex: vectors.publicKeyHex, providerId: 'test-rcb', label: 'test' }];

export function makeAlert(over: Partial<AlertFields> = {}, sk: Uint8Array = SK): Uint8Array {
  return signAlert(
    {
      keyId: 1,
      alertId: 2000,
      issuedAt: NOW - 10,
      expiresAt: NOW + 3600,
      severity: 'warning',
      category: 'other',
      areaCode: 0,
      text: 'Test alert',
      ...over,
    },
    sk,
  );
}
