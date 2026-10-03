import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8Encode } from '../ble/bytes';
import type { Alert, Category, Severity } from '../ble/types';

// Alert history kept as a hash chain: every record commits to the previous one, so editing,
// reordering or removing a record in the middle breaks verify(). Works fully offline.
// It detects corruption and naive edits; someone with access to storage can still rebuild the
// whole chain, so it is tamper-evident, not tamper-proof.

export const MAX_HISTORY = 1000;
export const GENESIS_HASH = '0'.repeat(64);
const KEY = 'history.v1';

/** Alert with dates as epoch milliseconds (JSON friendly). */
export interface StoredAlert {
  id: number;
  keyId: number;
  issuedAt: number;
  expiresAt: number;
  severity: Severity;
  category: Category;
  areaCode: number;
  text: string;
  nodeId: number;
  receivedAt: number;
}

export interface HistoryRecord {
  seq: number;
  alert: StoredAlert;
  prevHash: string;
  hash: string;
}

export type VerifyResult = { ok: true } | { ok: false; brokenAt: number };

/** Minimal synchronous key-value surface (MMKV in the app, a Map in tests). */
export interface KeyValue {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

export interface HistoryStore {
  /** Records, newest first. */
  records(): readonly HistoryRecord[];
  /** Appends a verified alert. Returns null if this alert is already stored. */
  append(alert: Alert): HistoryRecord | null;
  clear(): void;
  verify(): VerifyResult;
  subscribe(cb: (records: readonly HistoryRecord[]) => void): () => void;
}

export function toStoredAlert(a: Alert): StoredAlert {
  return {
    id: a.id,
    keyId: a.keyId,
    issuedAt: a.issuedAt.getTime(),
    expiresAt: a.expiresAt.getTime(),
    severity: a.severity,
    category: a.category,
    areaCode: a.areaCode,
    text: a.text,
    nodeId: a.nodeId,
    receivedAt: a.receivedAt.getTime(),
  };
}

/** SHA-256 over a fixed-order array, so the hash does not depend on object key order. */
export function recordHash(seq: number, prevHash: string, a: StoredAlert): string {
  const canonical = JSON.stringify([
    seq,
    prevHash,
    a.id,
    a.keyId,
    a.issuedAt,
    a.expiresAt,
    a.severity,
    a.category,
    a.areaCode,
    a.text,
    a.nodeId,
    a.receivedAt,
  ]);
  return bytesToHex(sha256(utf8Encode(canonical)));
}

/** Checks records (newest first). The oldest record's prevHash is the anchor after trimming. */
export function verifyChain(records: readonly HistoryRecord[]): VerifyResult {
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r.hash !== recordHash(r.seq, r.prevHash, r.alert)) return { ok: false, brokenAt: r.seq };
    const older = records[i + 1];
    if (older && (r.prevHash !== older.hash || r.seq !== older.seq + 1)) return { ok: false, brokenAt: r.seq };
  }
  return { ok: true };
}

function isRecord(x: unknown): x is HistoryRecord {
  const r = x as HistoryRecord;
  return (
    typeof r === 'object' &&
    r !== null &&
    Number.isInteger(r.seq) &&
    typeof r.prevHash === 'string' &&
    typeof r.hash === 'string' &&
    typeof r.alert === 'object' &&
    r.alert !== null &&
    Number.isInteger(r.alert.id) &&
    typeof r.alert.text === 'string'
  );
}

export function createHistoryStore(kv: KeyValue, max = MAX_HISTORY): HistoryStore {
  let records: HistoryRecord[] = [];
  const listeners = new Set<(r: readonly HistoryRecord[]) => void>();

  try {
    const parsed: unknown = JSON.parse(kv.getString(KEY) ?? '[]');
    // Records that fail the shape check are dropped; verify() then reports the gap.
    if (Array.isArray(parsed)) records = parsed.filter(isRecord).slice(0, max);
  } catch {
    // Corrupt JSON: start a new chain rather than crash the alert path.
    records = [];
  }

  const save = () => {
    kv.set(KEY, JSON.stringify(records));
    for (const l of listeners) {
      try {
        l(records);
      } catch (e) {
        console.warn('[history] listener threw', e);
      }
    }
  };

  return {
    records: () => records,
    append(alert) {
      const stored = toStoredAlert(alert);
      if (records.some((r) => r.alert.id === stored.id && r.alert.issuedAt === stored.issuedAt)) return null;
      const head = records[0];
      const seq = head ? head.seq + 1 : 0;
      const prevHash = head ? head.hash : GENESIS_HASH;
      const record: HistoryRecord = { seq, alert: stored, prevHash, hash: recordHash(seq, prevHash, stored) };
      records = [record, ...records].slice(0, max);
      save();
      return record;
    },
    clear() {
      records = [];
      save();
    },
    verify: () => verifyChain(records),
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
