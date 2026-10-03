import { AlertFilter, type RejectReason } from './alertFilter';
import { encodeResend } from './protocol/control';
import { MAX_RESEND_ATTEMPTS, REASSEMBLY_TIMEOUT_MS } from './protocol/constants';
import { Reassembler } from './protocol/fragments';
import type { Alert } from './types';
import type { LinkState, Transport } from './transport/types';

export interface SessionCallbacks {
  onAlert(alert: Alert): void;
  onLink(state: LinkState): void;
  onReject?(reason: RejectReason | 'reassembly', alertId?: number): void;
}

export interface Clock {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const realClock: Clock = {
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

/** Glues a transport to reassembly, verification and RESEND. No React Native imports. */
export class AlertSession {
  private reassembler: Reassembler;
  private resendAttempts = new Map<number, number>();
  private timer: unknown = null;
  private nodeId = 0;
  private running = false;

  constructor(
    private readonly transport: Transport,
    private readonly filter: AlertFilter,
    private readonly cb: SessionCallbacks,
    private readonly clock: Clock = realClock,
  ) {
    this.reassembler = new Reassembler(clock.now);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.timer = this.clock.setInterval(() => this.checkStale(), 1000);
    await this.transport.start({
      onFrame: (f) => this.onFrame(f),
      onLink: (s) => this.onLink(s),
      getLastKnownId: () => this.filter.lastKnownId(),
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.timer !== null) this.clock.clearInterval(this.timer);
    this.timer = null;
    this.reassembler.clear();
    this.resendAttempts.clear();
    await this.transport.stop();
  }

  private onLink(s: LinkState): void {
    if (s.state === 'connected') this.nodeId = s.nodeId ?? 0;
    // Partial buffers survive a reconnect: HELLO makes the node resend whole alerts anyway,
    // and stale ones time out.
    this.cb.onLink(s);
  }

  private onFrame(frame: Uint8Array): void {
    const ev = this.reassembler.push(frame);
    if (!ev) return;
    if (ev.type === 'rejected') {
      if (ev.alertId !== null) this.resendAttempts.delete(ev.alertId);
      this.cb.onReject?.('reassembly', ev.alertId ?? undefined);
      return;
    }
    this.resendAttempts.delete(ev.alertId);
    const res = this.filter.check(ev.bytes);
    if (!res.ok) {
      this.cb.onReject?.(res.reason, res.alertId);
      return;
    }
    const a = res.alert;
    this.cb.onAlert({
      id: a.alertId,
      keyId: a.keyId,
      issuedAt: new Date(a.issuedAt * 1000),
      expiresAt: new Date(a.expiresAt * 1000),
      severity: a.severity,
      category: a.category,
      areaCode: a.areaCode,
      text: a.text,
      nodeId: this.nodeId,
      receivedAt: new Date(this.clock.now()),
    });
  }

  private checkStale(): void {
    for (const { alertId, missing } of this.reassembler.stale(REASSEMBLY_TIMEOUT_MS)) {
      const n = this.resendAttempts.get(alertId) ?? 0;
      if (n >= MAX_RESEND_ATTEMPTS) {
        this.reassembler.drop(alertId);
        this.resendAttempts.delete(alertId);
        this.cb.onReject?.('reassembly', alertId);
        continue;
      }
      this.resendAttempts.set(alertId, n + 1);
      this.reassembler.touch(alertId);
      this.transport.sendControl(encodeResend(alertId, missing)).catch(() => {
        // Not connected: reconnect + HELLO will deliver it again.
      });
    }
  }
}
