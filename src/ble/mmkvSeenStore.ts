import { createMMKV, type MMKV } from 'react-native-mmkv';
import { MemorySeenStore } from './alertFilter';

const KEY = 'seen.v1';

/** SeenStore persisted in MMKV so duplicates stay rejected across app restarts. */
export class MmkvSeenStore extends MemorySeenStore {
  private kv: MMKV;

  constructor(kv: MMKV = createMMKV({ id: 'offgrid-rcb-ble' })) {
    super();
    this.kv = kv;
    try {
      const saved = JSON.parse(kv.getString(KEY) ?? 'null') as { last: number; seen: [number, number][] } | null;
      if (saved && Array.isArray(saved.seen)) {
        for (const [id, exp] of saved.seen) if (Number.isInteger(id) && Number.isInteger(exp)) this.seen.set(id, exp);
        this.last = Number.isInteger(saved.last) ? saved.last : 0;
      }
    } catch {
      // Corrupt state: start empty. Worst case one re-notification of a still-valid alert.
    }
  }

  add(alertId: number, expiresAt: number): void {
    super.add(alertId, expiresAt);
    this.save();
  }

  prune(nowSec: number): void {
    const before = this.seen.size;
    super.prune(nowSec);
    if (this.seen.size !== before) this.save();
  }

  private save(): void {
    this.kv.set(KEY, JSON.stringify({ last: this.last, seen: [...this.seen] }));
  }
}
