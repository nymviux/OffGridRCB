// Wire constants. Keep in sync with PROTOCOL.md (single source of truth for firmware).

export const PROTOCOL_VERSION = 1;

export const SERVICE_UUID = 'ea02c142-1975-4fa3-b208-4b6639140b6a';
export const INFO_CHAR_UUID = 'ea02c143-1975-4fa3-b208-4b6639140b6a';
export const ALERT_CHAR_UUID = 'ea02c144-1975-4fa3-b208-4b6639140b6a';
export const CONTROL_CHAR_UUID = 'ea02c145-1975-4fa3-b208-4b6639140b6a';

/** Alert binary layout. */
export const ALERT_VERSION = 1;
export const ALERT_HEADER_LEN = 21;
export const SIGNATURE_LEN = 64;
export const ALERT_MAX_LEN = 200;
export const ALERT_MIN_TEXT_LEN = 1;
export const ALERT_MAX_TEXT_LEN = ALERT_MAX_LEN - ALERT_HEADER_LEN - SIGNATURE_LEN; // 115
export const ALERT_MIN_LEN = ALERT_HEADER_LEN + ALERT_MIN_TEXT_LEN + SIGNATURE_LEN; // 86

/** Signed message = SIGNATURE_DOMAIN || alert bytes without signature. Not transmitted. */
export const SIGNATURE_DOMAIN = 'OGRCB-ALERT-v1';

export const SEVERITIES = ['test', 'info', 'warning', 'severe', 'extreme'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * Event category, index = wire value. Append only: receivers show unknown values as 'other'
 * (a newer issuer must never make an older app drop a genuine alert).
 */
export const CATEGORIES = ['other', 'fire', 'flood', 'accident', 'medical'] as const;
export type Category = (typeof CATEGORIES)[number];

/** ALERT characteristic frame layout. */
export const FRAME_HEADER_LEN = 6;
export const MIN_ATT_MTU = 23;
export const MAX_ATT_PAYLOAD = 244;
export const REQUESTED_MTU = 247;
export const MAX_FRAGMENTS = 15;

/** INFO characteristic. */
export const INFO_LEN = 10;

/** CONTROL characteristic opcodes. */
export const OP_HELLO = 0x01;
export const OP_RESEND = 0x02;
export const HELLO_LEN = 6;
export const RESEND_LEN = 7;
export const RESEND_ALL = 0xffff;

/** ATT application error codes returned by the node on CONTROL writes. */
export const ATT_ERR_UNSUPPORTED_VERSION = 0x80;
export const ATT_ERR_BAD_REQUEST = 0x81;
export const ATT_ERR_UNKNOWN_ALERT = 0x82;

/** Receiver policy. */
export const CLOCK_SKEW_SEC = 300;
export const REASSEMBLY_TIMEOUT_MS = 5000;
export const MAX_REASSEMBLY_BUFFERS = 4;
export const MAX_RESEND_ATTEMPTS = 2;

/** Bytes of ALERT payload per notification for a given ATT MTU. */
export function chunkSizeForMtu(mtu: number): number {
  const att = Math.min(Math.max(mtu, MIN_ATT_MTU) - 3, MAX_ATT_PAYLOAD);
  return att - FRAME_HEADER_LEN;
}
