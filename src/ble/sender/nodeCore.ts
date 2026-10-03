// Node behaviour per PROTOCOL.md, transport-agnostic. Used by the phone "sender" mode and
// meant as the reference for firmware. Not imported by the receiver.
import { ALERT_MAX_LEN, PROTOCOL_VERSION, chunkSizeForMtu } from '../protocol/constants';
import { decodeControl, encodeInfo, type NodeInfo } from '../protocol/control';
import { fragmentAlert } from '../protocol/fragments';
import { readU32 } from '../bytes';

export type ControlOutcome =
  | { ok: true; frames: Uint8Array[] }
  | { ok: false; error: 'unsupported_version' | 'bad_request' | 'unknown_alert' };

export class NodeCore {
  private alerts: Uint8Array[] = [];
  private helloDone = false;

  constructor(
    readonly nodeId: number,
    private mtu = 23,
    private readonly nowSec: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  setMtu(mtu: number): void {
    this.mtu = mtu;
  }

  get handshakeDone(): boolean {
    return this.helloDone;
  }

  /** Call on disconnect: nothing is sent until the next HELLO. */
  resetLink(): void {
    this.helloDone = false;
  }

  info(): Uint8Array {
    const live = this.live();
    const info: NodeInfo = {
      protocolVersion: PROTOCOL_VERSION,
      nodeId: this.nodeId,
      latestAlertId: live.reduce((m, a) => Math.max(m, readU32(a, 2)), 0),
      storedCount: live.length,
    };
    return encodeInfo(info);
  }

  /** Store an alert (as received from the mesh). Returns frames to notify now if a phone is ready. */
  addAlert(alert: Uint8Array, store = true): Uint8Array[] {
    if (alert.length < 7 || alert.length > ALERT_MAX_LEN) throw new RangeError('alert size');
    const id = readU32(alert, 2);
    if (store) {
      this.alerts = this.alerts.filter((a) => readU32(a, 2) !== id);
      this.alerts.push(alert);
    }
    return this.helloDone ? this.frames(alert) : [];
  }

  onControl(bytes: Uint8Array): ControlOutcome {
    const msg = decodeControl(bytes);
    if (!msg) return { ok: false, error: 'bad_request' };
    if (msg.op === 'hello') {
      if (msg.protocolVersion !== PROTOCOL_VERSION) return { ok: false, error: 'unsupported_version' };
      this.helloDone = true;
      const backlog = this.live()
        .filter((a) => readU32(a, 2) > msg.lastKnownId)
        .sort((a, b) => readU32(a, 2) - readU32(b, 2));
      return { ok: true, frames: backlog.flatMap((a) => this.frames(a)) };
    }
    const alert = this.alerts.find((a) => readU32(a, 2) === msg.alertId);
    if (!alert) return { ok: false, error: 'unknown_alert' };
    const frames = this.frames(alert);
    return { ok: true, frames: frames.filter((_, i) => msg.missing & (1 << i)) };
  }

  frames(alert: Uint8Array): Uint8Array[] {
    return fragmentAlert(readU32(alert, 2), alert, chunkSizeForMtu(this.mtu));
  }

  /** Alerts not yet expired (expires_at at offset 10). */
  private live(): Uint8Array[] {
    const now = this.nowSec();
    this.alerts = this.alerts.filter((a) => readU32(a, 10) > now);
    return this.alerts;
  }
}
