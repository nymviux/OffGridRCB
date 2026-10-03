import { BleManager, ScanMode, State, type Device, type Subscription } from 'react-native-ble-plx';
import {
  ALERT_CHAR_UUID,
  CONTROL_CHAR_UUID,
  INFO_CHAR_UUID,
  PROTOCOL_VERSION,
  REQUESTED_MTU,
  SERVICE_UUID,
} from '../protocol/constants';
import { decodeInfo, encodeHello } from '../protocol/control';
import { base64ToBytes, bytesToBase64 } from '../bytes';
import { Backoff } from './backoff';
import type { LinkState, Transport, TransportHandlers } from './types';

const CONNECT_TIMEOUT_MS = 10_000;

/**
 * Central role over react-native-ble-plx. Scan filtered by service UUID, connect without
 * bonding, handshake per PROTOCOL.md, reconnect with backoff. Never throws to the caller.
 */
export class BlePlxTransport implements Transport {
  private manager: BleManager | null = null;
  private handlers: TransportHandlers | null = null;
  private subs: Subscription[] = [];
  private linkSubs: Subscription[] = [];
  private device: Device | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = new Backoff();
  private btState: string = State.Unknown;
  private scanning = false;
  /** Bumped on stop and on each link teardown; stale async callbacks compare against it. */
  private gen = 0;

  async start(handlers: TransportHandlers): Promise<void> {
    this.handlers = handlers;
    const gen = ++this.gen;
    try {
      this.manager ??= new BleManager();
    } catch (e) {
      this.emit({ state: 'unsupported', error: errorText(e) });
      return;
    }
    this.subs.push(
      this.manager.onStateChange((s) => {
        if (gen !== this.gen) return;
        this.btState = s;
        this.onAdapterState(s);
      }, true),
    );
  }

  async stop(): Promise<void> {
    this.gen++;
    this.clearRetry();
    this.subs.forEach((s) => s.remove());
    this.subs = [];
    await this.teardownLink();
    await this.stopScan();
    this.emit({ state: 'idle' });
    this.handlers = null;
  }

  async sendControl(bytes: Uint8Array): Promise<void> {
    const d = this.device;
    if (!d || !this.manager) throw new Error('not connected');
    try {
      await this.manager.writeCharacteristicWithResponseForDevice(d.id, SERVICE_UUID, CONTROL_CHAR_UUID, bytesToBase64(bytes));
    } catch (e) {
      // Link is half-dead (e.g. node dropped its GATT service but kept the connection): start over.
      if (this.device?.id === d.id) {
        await this.teardownLink();
        this.scheduleReconnect(errorText(e));
      }
      throw e;
    }
  }

  private onAdapterState(s: string): void {
    switch (s) {
      case State.PoweredOn:
        if (!this.device && !this.retryTimer) void this.scan();
        return;
      case State.PoweredOff:
      case State.Resetting:
        this.clearRetry();
        void this.stopScan();
        void this.teardownLink();
        this.emit({ state: 'bluetooth_off' });
        return;
      case State.Unauthorized:
        this.clearRetry();
        void this.stopScan();
        this.emit({ state: 'bluetooth_unauthorized' });
        return;
      case State.Unsupported:
        this.emit({ state: 'unsupported' });
        return;
      default:
        return; // Unknown: wait for the next update.
    }
  }

  private async scan(): Promise<void> {
    const m = this.manager;
    if (!m || this.scanning) return;
    const gen = this.gen;
    this.scanning = true;
    this.emit({ state: 'scanning' });
    try {
      await m.startDeviceScan([SERVICE_UUID], { allowDuplicates: false, scanMode: ScanMode.LowLatency }, (err, dev) => {
        if (gen !== this.gen || !this.scanning) return;
        if (err) {
          this.scanning = false;
          this.scheduleReconnect(errorText(err));
          return;
        }
        if (dev) {
          void this.stopScan().then(() => this.connect(dev.id, gen));
        }
      });
    } catch (e) {
      this.scanning = false;
      this.scheduleReconnect(errorText(e));
    }
  }

  private async stopScan(): Promise<void> {
    if (!this.scanning || !this.manager) return;
    this.scanning = false;
    try {
      await this.manager.stopDeviceScan();
    } catch {
      // Adapter off; nothing to stop.
    }
  }

  private async connect(deviceId: string, gen: number): Promise<void> {
    const m = this.manager;
    if (!m || gen !== this.gen || !this.handlers) return;
    this.emit({ state: 'connecting' });
    try {
      // requestMTU here is negotiated by ble-plx right after connecting (Android).
      const d = await m.connectToDevice(deviceId, {
        autoConnect: false,
        requestMTU: REQUESTED_MTU,
        timeout: CONNECT_TIMEOUT_MS,
      });
      if (gen !== this.gen) {
        await m.cancelDeviceConnection(deviceId).catch(() => {});
        return;
      }
      this.device = d;
      this.linkSubs.push(
        m.onDeviceDisconnected(deviceId, (err) => {
          if (gen !== this.gen || this.device?.id !== deviceId) return;
          void this.teardownLink().then(() => this.scheduleReconnect(err ? errorText(err) : 'disconnected'));
        }),
      );
      await m.discoverAllServicesAndCharacteristicsForDevice(deviceId);

      const infoChar = await m.readCharacteristicForDevice(deviceId, SERVICE_UUID, INFO_CHAR_UUID);
      const info = decodeInfo(base64ToBytes(infoChar.value ?? ''));
      if (!info) throw new Error('INFO malformed');
      if (info.protocolVersion !== PROTOCOL_VERSION) throw new Error(`protocol ${info.protocolVersion} unsupported`);

      // Subscribe before HELLO: the node starts sending the backlog right after HELLO.
      // ble-plx queues GATT operations, so the CCCD write precedes the HELLO write.
      this.linkSubs.push(
        m.monitorCharacteristicForDevice(deviceId, SERVICE_UUID, ALERT_CHAR_UUID, (err, ch) => {
          if (gen !== this.gen || err || !ch?.value) return;
          let frame: Uint8Array;
          try {
            frame = base64ToBytes(ch.value);
          } catch {
            return;
          }
          this.handlers?.onFrame(frame);
        }),
      );

      await m.writeCharacteristicWithResponseForDevice(
        deviceId,
        SERVICE_UUID,
        CONTROL_CHAR_UUID,
        bytesToBase64(encodeHello(this.handlers.getLastKnownId())),
      );
      this.backoff.reset();
      this.emit({ state: 'connected', nodeId: info.nodeId });
    } catch (e) {
      if (gen !== this.gen) return;
      await this.teardownLink();
      this.scheduleReconnect(errorText(e));
    }
  }

  private async teardownLink(): Promise<void> {
    this.linkSubs.forEach((s) => s.remove());
    this.linkSubs = [];
    const d = this.device;
    this.device = null;
    if (d && this.manager) await this.manager.cancelDeviceConnection(d.id).catch(() => {});
  }

  private scheduleReconnect(error: string): void {
    if (!this.handlers || this.retryTimer) return;
    if (this.btState !== State.PoweredOn) return; // Adapter callback drives recovery.
    const delay = this.backoff.next();
    const gen = this.gen;
    this.emit({ state: 'reconnecting', retryInMs: delay, error });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (gen === this.gen) void this.scan();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private emit(s: LinkState): void {
    this.handlers?.onLink(s);
  }
}

function errorText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
