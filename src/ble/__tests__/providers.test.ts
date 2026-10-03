import { describe, expect, it } from 'vitest';
import { TEST_ONLY_KEYS } from '../../../tools/fake-node/keys/TEST_ONLY_private_key';
import { AlertFilter, MemorySeenStore } from '../alertFilter';
import { bytesToHex, hexToBytes } from '../bytes';
import { PROVIDERS, TRUSTED_KEYS, providerForKey } from '../config';
import { ed } from '../crypto/ed25519';
import { makeAlert, NOW } from './helpers';

describe('providers', () => {
  it('key ids are unique across all providers (key_id is one byte on the wire)', () => {
    const ids = TRUSTED_KEYS.map((k) => k.keyId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id >= 0 && id <= 255).toBe(true);
  });

  it('provider ids are unique and every key belongs to a known provider', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of TRUSTED_KEYS) expect(ids).toContain(k.providerId);
  });

  it('maps key ids to providers', () => {
    expect(providerForKey(1)?.id).toBe('test-rcb');
    expect(providerForKey(2)?.id).toBe('test-wczk');
    expect(providerForKey(99)).toBeUndefined();
  });

  it('every TEST secret matches the trusted public key with the same key id', () => {
    for (const t of TEST_ONLY_KEYS) {
      const pub = bytesToHex(ed.getPublicKey(hexToBytes(t.secretKeyHex)));
      expect(pub).toBe(t.publicKeyHex);
      expect(TRUSTED_KEYS.find((k) => k.keyId === t.keyId)?.publicKeyHex).toBe(pub);
    }
  });

  it('accepts an alert signed by the second TEST provider', () => {
    const k2 = TEST_ONLY_KEYS.find((k) => k.keyId === 2)!;
    const raw = makeAlert({ keyId: 2 }, hexToBytes(k2.secretKeyHex));
    const res = new AlertFilter(TRUSTED_KEYS, new MemorySeenStore(), () => NOW).check(raw);
    expect(res.ok).toBe(true);
  });
});
