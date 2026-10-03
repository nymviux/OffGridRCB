import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, bytesToHex, hexToBytes, utf8DecodeStrict } from '../bytes';
import { decodeAlert, encodeAlertBody } from '../protocol/alertCodec';
import { ALERT_MAX_LEN, ALERT_MAX_TEXT_LEN, CATEGORIES, chunkSizeForMtu } from '../protocol/constants';
import { decodeControl, decodeInfo, encodeHello, encodeResend } from '../protocol/control';
import { makeAlert, vectors } from './helpers';

describe('bytes', () => {
  it('base64 round-trips all lengths', () => {
    for (let n = 0; n < 40; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
      expect(base64ToBytes(bytesToBase64(b))).toEqual(b);
    }
  });

  it('matches Node base64', () => {
    const b = hexToBytes(vectors.validHex);
    expect(bytesToBase64(b)).toBe(Buffer.from(b).toString('base64'));
    expect(base64ToBytes(Buffer.from(b).toString('base64'))).toEqual(b);
  });

  it('rejects malformed base64 and hex', () => {
    expect(() => base64ToBytes('ab$d')).toThrow();
    expect(() => base64ToBytes('abcde')).toThrow();
    expect(() => hexToBytes('abc')).toThrow();
    expect(() => hexToBytes('zz')).toThrow();
  });

  it('strict UTF-8 decoding', () => {
    expect(utf8DecodeStrict(new Uint8Array([0xc5, 0xbc]))).toBe('ż');
    expect(utf8DecodeStrict(new Uint8Array([0xc5]))).toBeNull(); // truncated
    expect(utf8DecodeStrict(new Uint8Array([0xc0, 0xaf]))).toBeNull(); // overlong
    expect(utf8DecodeStrict(new Uint8Array([0xed, 0xa0, 0x80]))).toBeNull(); // surrogate
    expect(utf8DecodeStrict(new Uint8Array([0xff]))).toBeNull();
  });
});

describe('alert codec', () => {
  it('decodes the test vector', () => {
    const r = decodeAlert(hexToBytes(vectors.validHex));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { keyId, alertId, issuedAt, expiresAt, severity, category, areaCode, text } = r.alert;
    expect({ keyId, alertId, issuedAt, expiresAt, severity, category, areaCode, text }).toEqual(vectors.fields);
    expect(r.alert.categoryCode).toBe(2);
  });

  it('max-size alert is exactly 200 bytes', () => {
    expect(hexToBytes(vectors.maxTextHex).length).toBe(ALERT_MAX_LEN);
    expect(decodeAlert(hexToBytes(vectors.maxTextHex)).ok).toBe(true);
  });

  it('refuses to encode too long or empty text', () => {
    const base = { keyId: 1, alertId: 1, issuedAt: 1, expiresAt: 2, severity: 'info' as const, category: 'other' as const, areaCode: 0 };
    expect(() => encodeAlertBody({ ...base, text: 'x'.repeat(ALERT_MAX_TEXT_LEN + 1) })).toThrow();
    expect(() => encodeAlertBody({ ...base, text: 'ż'.repeat(58) })).toThrow(); // 116 bytes
    expect(() => encodeAlertBody({ ...base, text: 'ż'.repeat(57) + 'a' })).not.toThrow(); // 115 bytes
    expect(() => encodeAlertBody({ ...base, text: '' })).toThrow();
    expect(() => encodeAlertBody({ ...base, alertId: 0, text: 'a' })).toThrow();
  });

  it('refuses to encode bad category or area', () => {
    const base = { keyId: 1, alertId: 1, issuedAt: 1, expiresAt: 2, severity: 'info' as const, category: 'fire' as const, text: 'a' };
    expect(() => encodeAlertBody({ ...base, areaCode: 13 })).toThrow();
    expect(() => encodeAlertBody({ ...base, areaCode: 1465016 })).toThrow();
    expect(() => encodeAlertBody({ ...base, areaCode: 12 })).not.toThrow();
    expect(() => encodeAlertBody({ ...base, areaCode: 0, category: 'tornado' as never })).toThrow();
  });

  it('header layout: category at 15, area at 16..19, text_len at 20', () => {
    const b = makeAlert({ category: 'medical', areaCode: 18, text: 'abc' });
    expect(b[15]).toBe(4);
    expect(Array.from(b.subarray(16, 20))).toEqual([0, 0, 0, 18]);
    expect(b[20]).toBe(3);
    expect(b.length).toBe(21 + 3 + 64);
  });

  it('categories appended in v1 round-trip by wire value', () => {
    for (const [code, category] of CATEGORIES.entries()) {
      const b = makeAlert({ category });
      expect(b[15]).toBe(code);
      const r = decodeAlert(b);
      expect(r.ok && r.alert.category).toBe(category);
    }
    expect(CATEGORIES.indexOf('water_rescue')).toBe(17);
  });

  it('unknown category byte decodes as other (forward compatible)', () => {
    const b = makeAlert({ category: 'fire' });
    b[15] = 200;
    const r = decodeAlert(b);
    expect(r.ok && r.alert.category).toBe('other');
    expect(r.ok && r.alert.categoryCode).toBe(200);
  });

  const valid = () => hexToBytes(vectors.validHex);

  it.each([
    ['empty', () => new Uint8Array(0), 'bad_length'],
    ['truncated', () => valid().subarray(0, 100), 'bad_text_length'],
    ['too long', () => new Uint8Array(201), 'bad_length'],
    ['extra byte', () => Uint8Array.from([...valid(), 0]), 'bad_text_length'],
    ['version 2', () => { const b = valid(); b[0] = 2; return b; }, 'bad_version'],
    ['alert id 0', () => { const b = valid(); b.fill(0, 2, 6); return b; }, 'bad_alert_id'],
    ['expires before issue', () => { const b = valid(); b.fill(0, 10, 14); return b; }, 'bad_times'],
    ['severity 5', () => { const b = valid(); b[14] = 5; return b; }, 'bad_severity'],
    ['area 13', () => { const b = valid(); b.fill(0, 16, 20); b[19] = 13; return b; }, 'bad_area'],
    ['area 99999999', () => { const b = valid(); b.fill(0xff, 16, 20); return b; }, 'bad_area'],
    ['text_len 0', () => { const b = valid(); b[20] = 0; return b; }, 'bad_text_length'],
    ['invalid utf-8', () => { const b = valid(); b[21] = 0xff; return b; }, 'bad_text_encoding'],
    ['control char', () => { const b = valid(); b[21] = 0x07; return b; }, 'bad_text_encoding'],
  ])('rejects %s', (_name, make, error) => {
    const r = decodeAlert(make());
    expect(r).toEqual({ ok: false, error });
  });

  it('allows newline in text', () => {
    expect(decodeAlert(makeAlert({ text: 'line1\nline2' })).ok).toBe(true);
  });
});

describe('control and info', () => {
  it('matches vectors', () => {
    expect(bytesToHex(encodeHello(1000))).toBe(vectors.helloHex);
    expect(bytesToHex(encodeResend(1001, 5))).toBe(vectors.resendHex);
    expect(decodeInfo(hexToBytes(vectors.infoHex))).toEqual({
      protocolVersion: 1,
      nodeId: 0x5e1d0001,
      latestAlertId: 1001,
      storedCount: 1,
    });
  });

  it('decodes and validates CONTROL', () => {
    expect(decodeControl(hexToBytes(vectors.helloHex))).toEqual({ op: 'hello', protocolVersion: 1, lastKnownId: 1000 });
    expect(decodeControl(hexToBytes(vectors.resendHex))).toEqual({ op: 'resend', alertId: 1001, missing: 5 });
    expect(decodeControl(new Uint8Array([0x01, 1, 0]))).toBeNull();
    expect(decodeControl(new Uint8Array([0x09, 0, 0, 0, 0, 0]))).toBeNull();
    expect(decodeInfo(new Uint8Array(9))).toBeNull();
  });

  it('chunk size', () => {
    expect(chunkSizeForMtu(23)).toBe(14);
    expect(chunkSizeForMtu(10)).toBe(14);
    expect(chunkSizeForMtu(247)).toBe(238);
    expect(chunkSizeForMtu(517)).toBe(238);
  });
});
