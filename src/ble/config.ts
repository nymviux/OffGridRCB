// Issuer public keys trusted by the receiver, embedded in the app bundle.
// The receiver never holds a private key. key_id in the alert selects the key.

export interface TrustedKey {
  keyId: number;
  publicKeyHex: string;
  label: string;
}

export const TRUSTED_KEYS: readonly TrustedKey[] = [
  {
    keyId: 1,
    // TEST key: derived from the TEST-ONLY seed in tools/fake-node/keys. Replace before any real use.
    publicKeyHex: '79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664',
    label: 'TEST key 1 (fake-node)',
  },
];
