import {
  ALERT_HEADER_LEN,
  ALERT_MAX_LEN,
  ALERT_MAX_TEXT_LEN,
  ALERT_MIN_LEN,
  ALERT_MIN_TEXT_LEN,
  ALERT_VERSION,
  CATEGORIES,
  SEVERITIES,
  SIGNATURE_DOMAIN,
  SIGNATURE_LEN,
  type Category,
  type Severity,
} from './constants';
import { isValidAreaCode } from '../regions';
import { concatBytes, isU32, readU32, utf8DecodeStrict, utf8Encode, writeU32 } from '../bytes';

/** Alert fields as carried on the wire (times in Unix seconds). */
export interface AlertFields {
  keyId: number;
  alertId: number;
  issuedAt: number;
  expiresAt: number;
  severity: Severity;
  category: Category;
  /** See regions.ts: 0 = country, 2..32 = voivodeship, WWPPGGR = gmina. */
  areaCode: number;
  text: string;
}

export interface DecodedAlert extends AlertFields {
  /** Raw category byte; differs from CATEGORIES.indexOf(category) for values unknown to this app. */
  categoryCode: number;
  /** Bytes covered by the signature (header + text), without the domain prefix. */
  body: Uint8Array;
  signature: Uint8Array;
  raw: Uint8Array;
}

export type DecodeError =
  | 'bad_length'
  | 'bad_version'
  | 'bad_alert_id'
  | 'bad_times'
  | 'bad_severity'
  | 'bad_area'
  | 'bad_text_length'
  | 'bad_text_encoding';

export type DecodeResult = { ok: true; alert: DecodedAlert } | { ok: false; error: DecodeError };

// Control characters other than \n are rejected so text cannot spoof notification layout.
const FORBIDDEN_CHARS = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028-\u2029\u202a-\u202e\u2066-\u2069]/;

export function validateText(text: string): boolean {
  return !FORBIDDEN_CHARS.test(text);
}

/** Header + text, i.e. everything the signature covers. Throws on invalid fields (sender side). */
export function encodeAlertBody(f: AlertFields): Uint8Array {
  const text = utf8Encode(f.text);
  if (text.length < ALERT_MIN_TEXT_LEN || text.length > ALERT_MAX_TEXT_LEN) {
    throw new RangeError(`text must be ${ALERT_MIN_TEXT_LEN}..${ALERT_MAX_TEXT_LEN} UTF-8 bytes, got ${text.length}`);
  }
  if (!validateText(f.text)) throw new RangeError('text contains forbidden control characters');
  if (!Number.isInteger(f.keyId) || f.keyId < 0 || f.keyId > 255) throw new RangeError('keyId must be u8');
  for (const [name, v] of [
    ['alertId', f.alertId],
    ['issuedAt', f.issuedAt],
    ['expiresAt', f.expiresAt],
    ['areaCode', f.areaCode],
  ] as const) {
    if (!isU32(v)) throw new RangeError(`${name} must be u32`);
  }
  if (f.alertId === 0) throw new RangeError('alertId must be non-zero');
  const sev = SEVERITIES.indexOf(f.severity);
  if (sev < 0) throw new RangeError('unknown severity');
  const cat = CATEGORIES.indexOf(f.category);
  if (cat < 0) throw new RangeError('unknown category');
  if (!isValidAreaCode(f.areaCode)) throw new RangeError('areaCode does not follow the TERYT convention');

  const h = new Uint8Array(ALERT_HEADER_LEN);
  h[0] = ALERT_VERSION;
  h[1] = f.keyId;
  writeU32(h, 2, f.alertId);
  writeU32(h, 6, f.issuedAt);
  writeU32(h, 10, f.expiresAt);
  h[14] = sev;
  h[15] = cat;
  writeU32(h, 16, f.areaCode);
  h[20] = text.length;
  return concatBytes(h, text);
}

/** Message actually passed to Ed25519 sign/verify. */
export function signedMessage(body: Uint8Array): Uint8Array {
  return concatBytes(utf8Encode(SIGNATURE_DOMAIN), body);
}

export function assembleAlert(body: Uint8Array, signature: Uint8Array): Uint8Array {
  if (signature.length !== SIGNATURE_LEN) throw new RangeError('signature must be 64 bytes');
  return concatBytes(body, signature);
}

/**
 * Structural decode of untrusted bytes. Does not check signature, expiry or duplicates;
 * see alertFilter.ts for that.
 */
export function decodeAlert(raw: Uint8Array): DecodeResult {
  if (!(raw instanceof Uint8Array) || raw.length < ALERT_MIN_LEN || raw.length > ALERT_MAX_LEN) {
    return { ok: false, error: 'bad_length' };
  }
  if (raw[0] !== ALERT_VERSION) return { ok: false, error: 'bad_version' };
  const textLen = raw[20];
  if (textLen < ALERT_MIN_TEXT_LEN || textLen > ALERT_MAX_TEXT_LEN) return { ok: false, error: 'bad_text_length' };
  if (raw.length !== ALERT_HEADER_LEN + textLen + SIGNATURE_LEN) return { ok: false, error: 'bad_text_length' };

  const alertId = readU32(raw, 2);
  if (alertId === 0) return { ok: false, error: 'bad_alert_id' };
  const issuedAt = readU32(raw, 6);
  const expiresAt = readU32(raw, 10);
  if (expiresAt <= issuedAt) return { ok: false, error: 'bad_times' };
  const severity = SEVERITIES[raw[14]];
  if (severity === undefined) return { ok: false, error: 'bad_severity' };
  const categoryCode = raw[15];
  const areaCode = readU32(raw, 16);
  if (!isValidAreaCode(areaCode)) return { ok: false, error: 'bad_area' };

  const bodyLen = ALERT_HEADER_LEN + textLen;
  const text = utf8DecodeStrict(raw.subarray(ALERT_HEADER_LEN, bodyLen));
  if (text === null || !validateText(text)) return { ok: false, error: 'bad_text_encoding' };

  const copy = raw.slice();
  return {
    ok: true,
    alert: {
      keyId: raw[1],
      alertId,
      issuedAt,
      expiresAt,
      severity,
      category: CATEGORIES[categoryCode] ?? 'other',
      categoryCode,
      areaCode,
      text,
      body: copy.subarray(0, bodyLen),
      signature: copy.subarray(bodyLen),
      raw: copy,
    },
  };
}
