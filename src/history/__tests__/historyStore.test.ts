import { describe, expect, it } from 'vitest';
import type { Alert } from '../../ble/types';
import { createHistoryStore, GENESIS_HASH, type KeyValue } from '../historyStore';

function memoryKv(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getString: (k) => data.get(k), set: (k, v) => void data.set(k, v) };
}

function alert(id: number, text = `alert ${id}`): Alert {
  return {
    id,
    keyId: 1,
    issuedAt: new Date(1_759_500_000_000 + id * 1000),
    expiresAt: new Date(1_759_600_000_000),
    severity: 'warning',
    category: 'flood',
    areaCode: 12,
    text,
    nodeId: 7,
    receivedAt: new Date(1_759_500_100_000),
  };
}

function tamper(kv: ReturnType<typeof memoryKv>, edit: (records: { alert: { text: string } }[]) => void) {
  const records = JSON.parse(kv.data.get('history.v1')!);
  edit(records);
  kv.set('history.v1', JSON.stringify(records));
}

describe('history hash chain', () => {
  it('links each record to the previous one', () => {
    const s = createHistoryStore(memoryKv());
    const a = s.append(alert(1))!;
    const b = s.append(alert(2))!;
    expect(a.prevHash).toBe(GENESIS_HASH);
    expect(b.prevHash).toBe(a.hash);
    expect(b.seq).toBe(1);
    expect(s.records().map((r) => r.alert.id)).toEqual([2, 1]);
    expect(s.verify()).toEqual({ ok: true });
  });

  it('ignores the same alert twice', () => {
    const s = createHistoryStore(memoryKv());
    s.append(alert(1));
    expect(s.append(alert(1))).toBeNull();
    expect(s.records()).toHaveLength(1);
  });

  it('persists and verifies after reload', () => {
    const kv = memoryKv();
    const s = createHistoryStore(kv);
    for (let i = 1; i <= 5; i++) s.append(alert(i));
    const reloaded = createHistoryStore(kv);
    expect(reloaded.records()).toEqual(s.records());
    expect(reloaded.verify()).toEqual({ ok: true });
  });

  it('detects an edited record', () => {
    const kv = memoryKv();
    const s = createHistoryStore(kv);
    for (let i = 1; i <= 3; i++) s.append(alert(i));
    tamper(kv, (r) => (r[1].alert.text = 'fake'));
    expect(createHistoryStore(kv).verify()).toEqual({ ok: false, brokenAt: 1 });
  });

  it('detects a removed record', () => {
    const kv = memoryKv();
    const s = createHistoryStore(kv);
    for (let i = 1; i <= 3; i++) s.append(alert(i));
    tamper(kv, (r) => r.splice(1, 1));
    expect(createHistoryStore(kv).verify()).toEqual({ ok: false, brokenAt: 2 });
  });

  it('stays verifiable after trimming to max', () => {
    const s = createHistoryStore(memoryKv(), 3);
    for (let i = 1; i <= 5; i++) s.append(alert(i));
    expect(s.records().map((r) => r.seq)).toEqual([4, 3, 2]);
    expect(s.verify()).toEqual({ ok: true });
  });

  it('clear restarts at genesis and notifies', () => {
    const s = createHistoryStore(memoryKv());
    let calls = 0;
    s.subscribe(() => calls++);
    s.append(alert(1));
    s.clear();
    expect(s.records()).toEqual([]);
    expect(s.append(alert(2))!.prevHash).toBe(GENESIS_HASH);
    expect(calls).toBe(3);
  });

  it('survives corrupt storage', () => {
    const kv = memoryKv();
    kv.set('history.v1', '{nope');
    expect(createHistoryStore(kv).records()).toEqual([]);
  });
});
