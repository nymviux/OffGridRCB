// =====================================================================
//  TEST-ONLY ISSUER KEYS. PUBLICLY KNOWN. NEVER USE FOR REAL ALERTS.
//  Key 1 seed = bytes 0x01..0x20, key 2 seed = bytes 0x21..0x40.
//  Anyone can forge alerts signed with them.
//  Imported only by tools/fake-node, src/ble/sender (phone sender mode) and the sender screen.
//  The receiver code must never import this file (enforced by ESLint).
// =====================================================================

export const TEST_ONLY_KEY_ID = 1;

export const TEST_ONLY_SECRET_KEY_HEX = '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';

export const TEST_ONLY_PUBLIC_KEY_HEX = '79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664';

export interface TestOnlyKey {
  keyId: number;
  secretKeyHex: string;
  publicKeyHex: string;
}

/** One key per TEST provider in src/ble/config.ts, so provider muting can be tested end to end. */
export const TEST_ONLY_KEYS: readonly TestOnlyKey[] = [
  { keyId: TEST_ONLY_KEY_ID, secretKeyHex: TEST_ONLY_SECRET_KEY_HEX, publicKeyHex: TEST_ONLY_PUBLIC_KEY_HEX },
  {
    keyId: 2,
    secretKeyHex: '2122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f40',
    publicKeyHex: 'e7f162a10bec559afea195e4dce84b69568d5d2cb0963eb446c0685e2b17f2f0',
  },
];
