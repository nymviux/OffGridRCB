// Alert issuers ("providers") and their public keys trusted by the receiver, embedded in the app bundle.
// The receiver never holds a private key. key_id in the alert selects the key; key_id is one byte shared
// by all providers, so it must be unique across them. A provider can own several keys (key rotation).

export interface Provider {
  id: string;
  name: string;
}

export interface TrustedKey {
  keyId: number;
  publicKeyHex: string;
  providerId: string;
  label: string;
}

export const PROVIDERS: readonly Provider[] = [
  { id: 'test-rcb', name: 'TEST RCB' },
  { id: 'test-wczk', name: 'TEST WCZK' },
];

export const TRUSTED_KEYS: readonly TrustedKey[] = [
  {
    keyId: 1,
    // TEST keys: derived from the TEST-ONLY seeds in tools/fake-node/keys. Replace before any real use.
    publicKeyHex: '79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664',
    providerId: 'test-rcb',
    label: 'TEST key 1 (fake-node)',
  },
  {
    keyId: 2,
    publicKeyHex: 'e7f162a10bec559afea195e4dce84b69568d5d2cb0963eb446c0685e2b17f2f0',
    providerId: 'test-wczk',
    label: 'TEST key 2 (fake-node)',
  },
];

export function providerForKey(keyId: number): Provider | undefined {
  const providerId = TRUSTED_KEYS.find((k) => k.keyId === keyId)?.providerId;
  return PROVIDERS.find((p) => p.id === providerId);
}
