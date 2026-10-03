import { signedMessage, type AlertFields } from '../../src/ble/protocol/alertCodec';
import { encodeHello, encodeInfo, encodeResend } from '../../src/ble/protocol/control';
import { chunkSizeForMtu } from '../../src/ble/protocol/constants';
import { fragmentAlert } from '../../src/ble/protocol/fragments';
import { signAlert } from '../../src/ble/sender/signAlert';
import { bytesToHex, hexToBytes } from '../../src/ble/bytes';
import { TEST_ONLY_KEY_ID, TEST_ONLY_PUBLIC_KEY_HEX, TEST_ONLY_SECRET_KEY_HEX } from './keys/TEST_ONLY_private_key';

/** Fixed inputs so vectors are reproducible (Ed25519 signatures are deterministic). */
export const VECTOR_FIELDS: AlertFields = {
  keyId: TEST_ONLY_KEY_ID,
  alertId: 1001,
  issuedAt: 1767225600, // 2026-01-01T00:00:00Z
  expiresAt: 4102444800, // 2100-01-01T00:00:00Z
  severity: 'severe',
  category: 'flood',
  areaCode: 1465011,
  text: 'TEST: Ostrzeżenie powodziowe. Zostań w domu.',
};

export function buildVectors() {
  const sk = hexToBytes(TEST_ONLY_SECRET_KEY_HEX);
  const valid = signAlert(VECTOR_FIELDS, sk);
  const badSig = valid.slice();
  badSig[badSig.length - 1] ^= 0x01;
  const expired = signAlert({ ...VECTOR_FIELDS, alertId: 1002, issuedAt: 1735689600, expiresAt: 1735693200 }, sk);
  const maxText = signAlert({ ...VECTOR_FIELDS, alertId: 1003, category: 'fire', areaCode: 12, text: 'A'.repeat(115) }, sk);
  return {
    publicKeyHex: TEST_ONLY_PUBLIC_KEY_HEX,
    keyId: TEST_ONLY_KEY_ID,
    fields: VECTOR_FIELDS,
    validHex: bytesToHex(valid),
    signedMessageHex: bytesToHex(signedMessage(valid.subarray(0, valid.length - 64))),
    framesMtu23Hex: fragmentAlert(VECTOR_FIELDS.alertId, valid, chunkSizeForMtu(23)).map(bytesToHex),
    framesMtu247Hex: fragmentAlert(VECTOR_FIELDS.alertId, valid, chunkSizeForMtu(247)).map(bytesToHex),
    badSignatureHex: bytesToHex(badSig),
    expiredHex: bytesToHex(expired),
    maxTextHex: bytesToHex(maxText),
    infoHex: bytesToHex(encodeInfo({ protocolVersion: 1, nodeId: 0x5e1d0001, latestAlertId: 1001, storedCount: 1 })),
    helloHex: bytesToHex(encodeHello(1000)),
    resendHex: bytesToHex(encodeResend(1001, 0b101)),
  };
}

