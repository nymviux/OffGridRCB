import { describe, expect, it } from 'vitest';
import { AlertFilter, MemorySeenStore } from '../alertFilter';
import { hexToBytes } from '../bytes';
import { TRUSTED_KEYS } from '../config';
import { KEYS, makeAlert, NOW, vectors } from './helpers';

const filter = (now = NOW) => new AlertFilter(KEYS, new MemorySeenStore(), () => now);

describe('signature', () => {
  it('accepts the test vector', () => {
    expect(filter().check(hexToBytes(vectors.validHex)).ok).toBe(true);
  });

  it('rejects flipped signature bit', () => {
    expect(filter().check(hexToBytes(vectors.badSignatureHex))).toMatchObject({ ok: false, reason: 'bad_signature' });
  });

  it('rejects any modified signed byte', () => {
    for (const i of [1, 5, 9, 13, 14, 18, 25]) {
      const b = hexToBytes(vectors.validHex);
      b[i] ^= 0x01;
      const r = filter().check(b);
      expect(r.ok, `byte ${i}`).toBe(false);
    }
  });

  it('rejects unknown key id', () => {
    expect(filter().check(makeAlert({ keyId: 7 }))).toMatchObject({ ok: false, reason: 'unknown_key' });
  });

  it('rejects alert signed by another key', () => {
    const other = new AlertFilter(
      [{ keyId: 1, publicKeyHex: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c', label: 'x' }],
      new MemorySeenStore(),
      () => NOW,
    );
    expect(other.check(makeAlert())).toMatchObject({ ok: false, reason: 'bad_signature' });
  });

  it('app config trusts the test public key', () => {
    expect(TRUSTED_KEYS.map((k) => k.publicKeyHex)).toContain(vectors.publicKeyHex);
  });
});

describe('duplicates', () => {
  it('second copy is rejected, lastKnownId advances', () => {
    const f = filter();
    const a = makeAlert({ alertId: 42 });
    expect(f.check(a).ok).toBe(true);
    expect(f.check(a)).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(f.lastKnownId()).toBe(42);
  });

  it('forged copy with seen ID does not change state', () => {
    const f = filter();
    const forged = makeAlert({ alertId: 43 });
    forged[forged.length - 1] ^= 1;
    expect(f.check(forged)).toMatchObject({ reason: 'bad_signature' });
    // The bad one must not poison the ID: the genuine alert still passes.
    expect(f.check(makeAlert({ alertId: 43 })).ok).toBe(true);
    expect(f.lastKnownId()).toBe(43);
  });

  it('lastKnownId is the max, not the latest', () => {
    const f = filter();
    f.check(makeAlert({ alertId: 50 }));
    f.check(makeAlert({ alertId: 45 }));
    expect(f.lastKnownId()).toBe(50);
  });
});

describe('expiry and clock', () => {
  it('rejects expired alert', () => {
    expect(filter().check(hexToBytes(vectors.expiredHex))).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('expires_at == now is expired', () => {
    expect(filter().check(makeAlert({ expiresAt: NOW }))).toMatchObject({ reason: 'expired' });
    expect(filter().check(makeAlert({ expiresAt: NOW + 1 })).ok).toBe(true);
  });

  it('allows 5 min clock skew for issued_at', () => {
    expect(filter().check(makeAlert({ issuedAt: NOW + 300 })).ok).toBe(true);
    expect(filter().check(makeAlert({ issuedAt: NOW + 301 }))).toMatchObject({ reason: 'issued_in_future' });
  });

  it('prunes old entries after expiry plus skew', () => {
    const store = new MemorySeenStore();
    let now = NOW;
    const f = new AlertFilter(KEYS, store, () => now);
    f.check(makeAlert({ alertId: 1, expiresAt: NOW + 10 }));
    now = NOW + 10 + 301;
    f.check(makeAlert({ alertId: 2, issuedAt: now, expiresAt: now + 100 }));
    expect(store.has(1)).toBe(false);
    expect(store.has(2)).toBe(true);
    expect(f.lastKnownId()).toBe(2);
  });
});
