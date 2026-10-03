// =====================================================================
//  TEST-ONLY ISSUER KEY. PUBLICLY KNOWN. NEVER USE FOR REAL ALERTS.
//  Seed = bytes 0x01..0x20. Anyone can forge alerts signed with it.
//  Imported only by tools/fake-node and src/ble/sender (phone sender mode).
//  The receiver code must never import this file (enforced by ESLint).
// =====================================================================

export const TEST_ONLY_KEY_ID = 1;

export const TEST_ONLY_SECRET_KEY_HEX = '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';

export const TEST_ONLY_PUBLIC_KEY_HEX = '79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664';
