import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildVectors } from './vectors';

describe('fake-node vectors', () => {
  it('vectors.json is up to date with the generator', () => {
    const saved = JSON.parse(readFileSync(resolve(__dirname, '../../src/ble/__tests__/vectors.json'), 'utf8'));
    expect(buildVectors()).toEqual(saved);
  });

  it('PROTOCOL.md contains the valid alert vector', () => {
    const md = readFileSync(resolve(__dirname, '../../PROTOCOL.md'), 'utf8').replace(/\s+/g, '');
    expect(md).toContain(buildVectors().validHex);
  });
});
