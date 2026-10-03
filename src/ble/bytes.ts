// The only conversion layer between ble-plx / munim string values and bytes.
// Pure TS: no Buffer, no atob (not guaranteed in Hermes on every RN version).

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export class ByteFormatError extends Error {}

export function base64ToBytes(input: string): Uint8Array {
  if (typeof input !== 'string') throw new ByteFormatError('base64: not a string');
  const s = input.replace(/=+$/, '');
  if (s.length % 4 === 1) throw new ByteFormatError('base64: bad length');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? B64_LOOKUP[c] : -1;
    if (v < 0) throw new ByteFormatError('base64: bad character');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const s = hex.replace(/\s+/g, '');
  if (s.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(s)) throw new ByteFormatError('hex: bad format');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function readU16(b: Uint8Array, off: number): number {
  return (b[off] << 8) | b[off + 1];
}

export function readU32(b: Uint8Array, off: number): number {
  return ((b[off] << 24) >>> 0) + ((b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]);
}

export function writeU16(b: Uint8Array, off: number, v: number): void {
  b[off] = (v >>> 8) & 0xff;
  b[off + 1] = v & 0xff;
}

export function writeU32(b: Uint8Array, off: number, v: number): void {
  b[off] = (v >>> 24) & 0xff;
  b[off + 1] = (v >>> 16) & 0xff;
  b[off + 2] = (v >>> 8) & 0xff;
  b[off + 3] = v & 0xff;
}

export function isU32(v: number): boolean {
  return Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
}

const utf8Encoder = new TextEncoder();

export function utf8Encode(s: string): Uint8Array {
  return utf8Encoder.encode(s);
}

/** Strict UTF-8 decode; returns null on malformed input (overlongs, surrogates, truncation). */
export function utf8DecodeStrict(b: Uint8Array): string | null {
  let out = '';
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    let cp: number;
    let need: number;
    let min: number;
    if (c < 0x80) {
      cp = c;
      need = 0;
      min = 0;
    } else if (c >= 0xc2 && c <= 0xdf) {
      cp = c & 0x1f;
      need = 1;
      min = 0x80;
    } else if (c >= 0xe0 && c <= 0xef) {
      cp = c & 0x0f;
      need = 2;
      min = 0x800;
    } else if (c >= 0xf0 && c <= 0xf4) {
      cp = c & 0x07;
      need = 3;
      min = 0x10000;
    } else {
      return null;
    }
    for (let k = 1; k <= need; k++) {
      const cc = b[i + k];
      if (cc === undefined || (cc & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (cc & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    out += String.fromCodePoint(cp);
    i += need + 1;
  }
  return out;
}
