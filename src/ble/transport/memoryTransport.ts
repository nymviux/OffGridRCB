import { CONTROL_CHAR_UUID, MIN_ATT_MTU, chunkSizeForMtu } from '../protocol/constants';
import { decodeControl, encodeHello } from '../protocol/control';
import { fragmentAlert } from '../protocol/fragments';
import { readU32 } from '../bytes';
import type { LinkState, Transport, TransportHandlers } from './types';

/**
 * In-memory transport for UI work and tests (BLE does not work on the Android emulator).
 * Behaves like a node: stores alerts, answers HELLO and RESEND, fragments by MTU.
 */
export class MemoryTransport implements Transport {
  private handlers: TransportHandlers | null = null;
  private store: Uint8Array[] = [];
  private connected = false;
  /** Every CONTROL write the "phone" made, for assertions. */
  readonly controlLog: Uint8Array[] = [];

  constructor(
    private readonly opts: { mtu?: number; nodeId?: number; autoConnect?: boolean } = {},
  ) {}

  async start(handlers: TransportHandlers): Promise<void> {
    this.handlers = handlers;
    if (this.opts.autoConnect !== false) this.connect();
  }

  async stop(): Promise<void> {
    this.connected = false;
    this.emitLink({ state: 'idle' });
    this.handlers = null;
  }

  async sendControl(bytes: Uint8Array): Promise<void> {
    if (!this.connected) throw new Error(`not connected (${CONTROL_CHAR_UUID})`);
    this.controlLog.push(bytes);
    const msg = decodeControl(bytes);
    if (msg?.op === 'resend') {
      const a = this.store.find((x) => readU32(x, 2) === msg.alertId);
      if (a) this.sendFrames(a, msg.missing);
    }
  }

  /** Simulate a successful connect + handshake: HELLO, then backlog newer than lastKnownId. */
  connect(opts: { sendBacklog?: boolean } = {}): void {
    if (!this.handlers) return;
    this.connected = true;
    this.emitLink({ state: 'connected', nodeId: this.opts.nodeId ?? 0x00c0ffee });
    const last = this.handlers.getLastKnownId();
    this.controlLog.push(encodeHello(last));
    if (opts.sendBacklog === false) return;
    for (const a of this.sorted()) if (readU32(a, 2) > last) this.sendFrames(a);
  }

  simulateDisconnect(retryInMs = 1000): void {
    this.connected = false;
    this.emitLink({ state: 'reconnecting', retryInMs });
  }

  setLink(state: LinkState): void {
    this.emitLink(state);
  }

  /** Store an encoded alert and, if connected, push it now (like a fresh alert from the mesh). */
  inject(alert: Uint8Array, opts: { store?: boolean; dropAfter?: number } = {}): void {
    if (opts.store !== false && !this.store.some((x) => equal(x, alert))) this.store.push(alert);
    if (this.connected) this.sendFrames(alert, 0xffff, opts.dropAfter);
  }

  /** Raw frame, bypassing fragmentation (malformed-input tests). */
  injectFrame(frame: Uint8Array): void {
    this.handlers?.onFrame(frame);
  }

  private sendFrames(alert: Uint8Array, mask = 0xffff, dropAfter?: number): void {
    const frames = fragmentAlert(readU32(alert, 2), alert, chunkSizeForMtu(this.opts.mtu ?? MIN_ATT_MTU));
    let sent = 0;
    for (let i = 0; i < frames.length; i++) {
      if (!(mask & (1 << i))) continue;
      if (dropAfter !== undefined && sent >= dropAfter) {
        this.simulateDisconnect();
        return;
      }
      if (!this.connected) return;
      this.handlers?.onFrame(frames[i]);
      sent++;
    }
  }

  private sorted(): Uint8Array[] {
    return [...this.store].sort((a, b) => readU32(a, 2) - readU32(b, 2));
  }

  private emitLink(s: LinkState): void {
    this.handlers?.onLink(s);
  }
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
