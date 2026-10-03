import { decodeAlert, signedMessage, type DecodeError, type DecodedAlert } from './protocol/alertCodec';
import { CLOCK_SKEW_SEC } from './protocol/constants';
import { verifySignature } from './crypto/ed25519';
import { hexToBytes } from './bytes';
import type { TrustedKey } from './config';

/** Persistent record of accepted alerts. In-memory and MMKV implementations exist. */
export interface SeenStore {
  has(alertId: number): boolean;
  /** Remember until expiresAt (Unix s); entries past expiry may be pruned. */
  add(alertId: number, expiresAt: number): void;
  /** Highest accepted alert ID, sent in HELLO. 0 if none. */
  lastKnownId(): number;
  prune(nowSec: number): void;
}

export class MemorySeenStore implements SeenStore {
  protected seen = new Map<number, number>();
  protected last = 0;

  has(alertId: number): boolean {
    return this.seen.has(alertId);
  }
  add(alertId: number, expiresAt: number): void {
    this.seen.set(alertId, expiresAt);
    if (alertId > this.last) this.last = alertId;
  }
  lastKnownId(): number {
    return this.last;
  }
  prune(nowSec: number): void {
    // Keep entries a little past expiry so a late replay with skewed clock is still a duplicate.
    for (const [id, exp] of this.seen) if (exp + CLOCK_SKEW_SEC < nowSec) this.seen.delete(id);
  }
}

export type RejectReason = DecodeError | 'unknown_key' | 'bad_signature' | 'expired' | 'issued_in_future' | 'duplicate';

export type FilterResult = { ok: true; alert: DecodedAlert } | { ok: false; reason: RejectReason; alertId?: number };

export class AlertFilter {
  private keys: Map<number, Uint8Array>;

  constructor(
    trustedKeys: readonly TrustedKey[],
    private readonly store: SeenStore,
    private readonly nowSec: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    this.keys = new Map(trustedKeys.map((k) => [k.keyId, hexToBytes(k.publicKeyHex)]));
  }

  lastKnownId(): number {
    return this.store.lastKnownId();
  }

  /** Full acceptance pipeline. Only a signature-valid alert is ever recorded as seen. */
  check(raw: Uint8Array): FilterResult {
    const decoded = decodeAlert(raw);
    if (!decoded.ok) return { ok: false, reason: decoded.error };
    const a = decoded.alert;

    // Cheap checks first, but nothing is persisted before the signature passes.
    if (this.store.has(a.alertId)) return { ok: false, reason: 'duplicate', alertId: a.alertId };
    const key = this.keys.get(a.keyId);
    if (!key) return { ok: false, reason: 'unknown_key', alertId: a.alertId };

    const now = this.nowSec();
    if (a.expiresAt <= now) return { ok: false, reason: 'expired', alertId: a.alertId };
    if (a.issuedAt > now + CLOCK_SKEW_SEC) return { ok: false, reason: 'issued_in_future', alertId: a.alertId };

    if (!verifySignature(a.signature, signedMessage(a.body), key)) {
      return { ok: false, reason: 'bad_signature', alertId: a.alertId };
    }

    this.store.add(a.alertId, a.expiresAt);
    this.store.prune(now);
    return { ok: true, alert: a };
  }
}
