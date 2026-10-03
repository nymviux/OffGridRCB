import { describe, expect, it } from 'vitest';
import type { KeyValue } from '../../history/historyStore';
import { shouldNotify } from '../notifyPolicy';
import { createSettingsStore } from '../settingsStore';

function memoryKv(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getString: (k) => data.get(k), set: (k, v) => void data.set(k, v) };
}

describe('settings store', () => {
  it('starts with no muted providers', () => {
    expect([...createSettingsStore(memoryKv()).mutedProviders()]).toEqual([]);
  });

  it('persists muting across instances', () => {
    const kv = memoryKv();
    const s = createSettingsStore(kv);
    s.setProviderMuted('test-wczk', true);
    s.setProviderMuted('test-rcb', true);
    s.setProviderMuted('test-rcb', false);
    expect([...createSettingsStore(kv).mutedProviders()]).toEqual(['test-wczk']);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const s = createSettingsStore(memoryKv());
    const seen: string[][] = [];
    const unsub = s.subscribe((m) => seen.push([...m]));
    s.setProviderMuted('test-rcb', true);
    unsub();
    s.setProviderMuted('test-wczk', true);
    expect(seen).toEqual([['test-rcb']]);
  });

  it('treats corrupt storage as nothing muted', () => {
    const kv = memoryKv();
    kv.set('settings.v1', '{not json');
    expect([...createSettingsStore(kv).mutedProviders()]).toEqual([]);
    kv.set('settings.v1', JSON.stringify({ mutedProviders: [1, 'test-rcb', null] }));
    expect([...createSettingsStore(kv).mutedProviders()]).toEqual(['test-rcb']);
  });
});

describe('shouldNotify', () => {
  const muted = new Set(['test-wczk']);

  it('notifies for providers that are not muted', () => {
    expect(shouldNotify({ keyId: 1, severity: 'warning' }, muted)).toBe(true);
  });

  it('stays silent for muted providers', () => {
    expect(shouldNotify({ keyId: 2, severity: 'severe' }, muted)).toBe(false);
  });

  it('always notifies extreme alerts, even from a muted provider', () => {
    expect(shouldNotify({ keyId: 2, severity: 'extreme' }, muted)).toBe(true);
  });

  it('notifies when the key has no known provider (never silence a verified alert by accident)', () => {
    expect(shouldNotify({ keyId: 99, severity: 'info' }, muted)).toBe(true);
  });
});
