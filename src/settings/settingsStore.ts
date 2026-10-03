import type { KeyValue } from '../history/historyStore';

const KEY = 'settings.v1';

export interface SettingsStore {
  /** Provider ids whose alerts do not ring. Stored as "muted", so providers added later start enabled. */
  mutedProviders(): ReadonlySet<string>;
  setProviderMuted(providerId: string, muted: boolean): void;
  subscribe(cb: (muted: ReadonlySet<string>) => void): () => void;
}

function load(kv: KeyValue): Set<string> {
  try {
    const saved = JSON.parse(kv.getString(KEY) ?? 'null') as { mutedProviders?: unknown } | null;
    const list = Array.isArray(saved?.mutedProviders) ? saved.mutedProviders : [];
    return new Set(list.filter((x): x is string => typeof x === 'string'));
  } catch {
    // Corrupt state: nothing muted, so nothing is silenced by accident.
    return new Set();
  }
}

export function createSettingsStore(kv: KeyValue): SettingsStore {
  let muted: ReadonlySet<string> = load(kv);
  const listeners = new Set<(m: ReadonlySet<string>) => void>();

  return {
    mutedProviders: () => muted,
    setProviderMuted(providerId, on) {
      const next = new Set(muted);
      if (on) next.add(providerId);
      else next.delete(providerId);
      muted = next;
      kv.set(KEY, JSON.stringify({ mutedProviders: [...next] }));
      for (const l of listeners) l(muted);
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
