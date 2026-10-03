import { ALERT_MAX_LEN, FRAME_HEADER_LEN, MAX_FRAGMENTS, MAX_REASSEMBLY_BUFFERS, RESEND_ALL } from './constants';
import { readU32, writeU32 } from '../bytes';

export interface FrameHeader {
  alertId: number;
  index: number;
  count: number;
}

/** Split encoded alert into ALERT notification frames. Sender side. */
export function fragmentAlert(alertId: number, alert: Uint8Array, chunk: number): Uint8Array[] {
  if (chunk < 1) throw new RangeError('chunk too small');
  const count = Math.ceil(alert.length / chunk);
  if (count < 1 || count > MAX_FRAGMENTS) throw new RangeError(`alert needs ${count} fragments, max ${MAX_FRAGMENTS}`);
  const frames: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const part = alert.subarray(i * chunk, Math.min((i + 1) * chunk, alert.length));
    const f = new Uint8Array(FRAME_HEADER_LEN + part.length);
    writeU32(f, 0, alertId);
    f[4] = i;
    f[5] = count;
    f.set(part, FRAME_HEADER_LEN);
    frames.push(f);
  }
  return frames;
}

export function parseFrameHeader(frame: Uint8Array): FrameHeader | null {
  if (frame.length <= FRAME_HEADER_LEN) return null;
  const alertId = readU32(frame, 0);
  const index = frame[4];
  const count = frame[5];
  if (alertId === 0 || count < 1 || count > MAX_FRAGMENTS || index >= count) return null;
  return { alertId, index, count };
}

export type ReassemblyEvent =
  | { type: 'complete'; alertId: number; bytes: Uint8Array }
  | { type: 'rejected'; alertId: number | null; reason: 'bad_frame' | 'count_mismatch' | 'too_large' | 'size_mismatch' };

interface Buffer {
  alertId: number;
  count: number;
  parts: (Uint8Array | undefined)[];
  received: number;
  total: number;
  lastSeen: number;
}

/**
 * Collects fragments per alert ID. Bounded: max buffers, max total size.
 * Fragments may arrive in any order; duplicates are ignored.
 */
export class Reassembler {
  private buffers = new Map<number, Buffer>();

  constructor(private readonly now: () => number = Date.now) {}

  push(frame: Uint8Array): ReassemblyEvent | null {
    const h = parseFrameHeader(frame);
    if (!h) return { type: 'rejected', alertId: null, reason: 'bad_frame' };
    const payload = frame.slice(FRAME_HEADER_LEN);

    let buf = this.buffers.get(h.alertId);
    if (buf && buf.count !== h.count) {
      this.buffers.delete(h.alertId);
      return { type: 'rejected', alertId: h.alertId, reason: 'count_mismatch' };
    }
    if (!buf) {
      if (this.buffers.size >= MAX_REASSEMBLY_BUFFERS) this.evictOldest();
      buf = { alertId: h.alertId, count: h.count, parts: new Array(h.count), received: 0, total: 0, lastSeen: 0 };
      this.buffers.set(h.alertId, buf);
    }
    buf.lastSeen = this.now();
    if (buf.parts[h.index]) return null;

    buf.parts[h.index] = payload;
    buf.received++;
    buf.total += payload.length;
    if (buf.total > ALERT_MAX_LEN) {
      this.buffers.delete(h.alertId);
      return { type: 'rejected', alertId: h.alertId, reason: 'too_large' };
    }
    if (buf.received < buf.count) return null;

    this.buffers.delete(h.alertId);
    // All non-final fragments must be the same size (sender uses a fixed chunk).
    const chunk = buf.parts[0]!.length;
    for (let i = 0; i < buf.count - 1; i++) {
      if (buf.parts[i]!.length !== chunk) return { type: 'rejected', alertId: h.alertId, reason: 'size_mismatch' };
    }
    if (buf.parts[buf.count - 1]!.length > chunk) {
      return { type: 'rejected', alertId: h.alertId, reason: 'size_mismatch' };
    }
    const out = new Uint8Array(buf.total);
    let o = 0;
    for (const p of buf.parts) {
      out.set(p!, o);
      o += p!.length;
    }
    return { type: 'complete', alertId: h.alertId, bytes: out };
  }

  /** Buffers idle for at least `timeoutMs`, with RESEND bitmap of missing fragments. */
  stale(timeoutMs: number): { alertId: number; missing: number }[] {
    const t = this.now();
    const out: { alertId: number; missing: number }[] = [];
    for (const b of this.buffers.values()) {
      if (t - b.lastSeen >= timeoutMs) out.push({ alertId: b.alertId, missing: missingBitmap(b) });
    }
    return out;
  }

  touch(alertId: number): void {
    const b = this.buffers.get(alertId);
    if (b) b.lastSeen = this.now();
  }

  drop(alertId: number): void {
    this.buffers.delete(alertId);
  }

  clear(): void {
    this.buffers.clear();
  }

  get size(): number {
    return this.buffers.size;
  }

  private evictOldest(): void {
    let oldest: Buffer | undefined;
    for (const b of this.buffers.values()) if (!oldest || b.lastSeen < oldest.lastSeen) oldest = b;
    if (oldest) this.buffers.delete(oldest.alertId);
  }
}

function missingBitmap(b: Buffer): number {
  let m = 0;
  for (let i = 0; i < b.count; i++) if (!b.parts[i]) m |= 1 << i;
  return m === 0 ? RESEND_ALL : m;
}
