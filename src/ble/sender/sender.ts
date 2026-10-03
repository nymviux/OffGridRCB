// Phone "sender" mode: emulates a node in the BLE peripheral role (munim-bluetooth).
// TEST ONLY. Signs with the publicly known test key. The receiver never imports this file.
import {
  addEventListener,
  isBluetoothEnabled,
  requestBluetoothPermission,
  respondToPeripheralReadRequest,
  respondToPeripheralWriteRequest,
  setServices,
  startAdvertising,
  stopAdvertising,
  updateCharacteristicValue,
} from 'munim-bluetooth';
import {
  TEST_ONLY_KEY_ID,
  TEST_ONLY_SECRET_KEY_HEX,
} from '../../../tools/fake-node/keys/TEST_ONLY_private_key';
import { ALERT_CHAR_UUID, CONTROL_CHAR_UUID, INFO_CHAR_UUID, SERVICE_UUID, SIGNATURE_LEN } from '../protocol/constants';
import type { AlertFields } from '../protocol/alertCodec';
import { bytesToHex, hexToBytes, readU32 } from '../bytes';
import { NodeCore } from './nodeCore';
import { signAlert } from './signAlert';

// munim exposes neither the server-side MTU nor onNotificationSent, so the sender assumes the
// worst case (MTU 23, 14 B per frame) and paces notifications. Lost frames are recovered by RESEND.
const NOTIFY_GAP_MS = 30;
const DROP_PAUSE_MS = 4000;

export type SenderLog = (line: string) => void;

const secretKey = hexToBytes(TEST_ONLY_SECRET_KEY_HEX);
const node = new NodeCore(0x5e1d0001);
let running = false;
let unsubs: (() => void)[] = [];
let queue: Promise<void> = Promise.resolve();
let lastAlert: Uint8Array | null = null;
let lastId = 0;
let log: SenderLog = (l) => console.info('[sender]', l);

export function onSenderLog(cb: SenderLog): void {
  log = cb;
}

function nextAlertId(): number {
  lastId = Math.max(lastId + 1, Math.floor(Date.now() / 1000));
  return lastId;
}

function fields(overrides: Partial<AlertFields> = {}): AlertFields {
  const now = Math.floor(Date.now() / 1000);
  return {
    keyId: TEST_ONLY_KEY_ID,
    alertId: nextAlertId(),
    issuedAt: now,
    expiresAt: now + 3600,
    severity: 'severe',
    category: 'other',
    areaCode: 1465011, // gmina Warszawa (TERYT 1465011)
    text: 'TEST: Ostrzeżenie przed silnym wiatrem. Zostań w domu.',
    ...overrides,
  };
}

const GATT = [
  {
    uuid: SERVICE_UUID,
    characteristics: [
      { uuid: INFO_CHAR_UUID, properties: ['read'] },
      { uuid: ALERT_CHAR_UUID, properties: ['notify'] },
      { uuid: CONTROL_CHAR_UUID, properties: ['write'] },
    ],
  },
];

function advertise(): void {
  setServices(GATT, { mode: 'manual', timeoutMs: 2000 });
  startAdvertising({ serviceUUIDs: [SERVICE_UUID], localName: `RCB-${(node.nodeId & 0xffff).toString(16).padStart(4, '0')}` });
}

function enqueueFrames(frames: Uint8Array[], stopAfter?: number): Promise<void> {
  queue = queue.then(async () => {
    for (let i = 0; i < frames.length; i++) {
      if (!running) return;
      if (stopAfter !== undefined && i >= stopAfter) return;
      await updateCharacteristicValue(SERVICE_UUID, ALERT_CHAR_UUID, bytesToHex(frames[i]), true).catch((e) =>
        log(`notify failed: ${String(e)}`),
      );
      await sleep(NOTIFY_GAP_MS);
    }
  });
  return queue;
}

export async function startSender(): Promise<boolean> {
  if (running) return true;
  const ok = await requestBluetoothPermission(['advertise', 'connect']).catch(() => false);
  if (!ok) {
    log('brak uprawnień BLUETOOTH_ADVERTISE/CONNECT');
    return false;
  }
  if (!(await isBluetoothEnabled().catch(() => false))) {
    log('Bluetooth wyłączony');
    return false;
  }
  running = true;
  unsubs = [
    addEventListener('peripheralReadRequest', (r) => {
      if (r.characteristicUUID.toLowerCase() !== INFO_CHAR_UUID) {
        void respondToPeripheralReadRequest(r.requestId, undefined, 'readNotPermitted');
        return;
      }
      void respondToPeripheralReadRequest(r.requestId, bytesToHex(node.info().subarray(r.offset)), 'success');
    }),
    addEventListener('peripheralWriteRequest', (w) => {
      if (w.characteristicUUID.toLowerCase() !== CONTROL_CHAR_UUID) {
        void respondToPeripheralWriteRequest(w.requestId, false, 'writeNotPermitted');
        return;
      }
      const res = node.onControl(hexToBytes(w.value));
      // munim cannot return custom ATT codes (0x80..0x82); a generic error is close enough here.
      void respondToPeripheralWriteRequest(w.requestId, res.ok, res.ok ? 'success' : 'requestNotSupported');
      if (res.ok) {
        log(`CONTROL ok, wysyłam ${res.frames.length} ramek`);
        void enqueueFrames(res.frames);
      } else {
        log(`CONTROL odrzucony: ${res.error}`);
      }
    }),
    addEventListener('peripheralSubscribed', (s) => log(`subskrypcja: ${s.centralId}`)),
    addEventListener('peripheralUnsubscribed', () => {
      node.resetLink();
      log('telefon się odłączył');
    }),
  ];
  advertise();
  log('rozgłaszam serwis');
  return true;
}

export function stopSender(): void {
  running = false;
  unsubs.forEach((u) => u());
  unsubs = [];
  stopAdvertising();
  setServices([]);
  node.resetLink();
}

function publish(alert: Uint8Array, label: string, opts: { store?: boolean; stopAfter?: number } = {}): void {
  const frames = node.addAlert(alert, opts.store !== false);
  log(`${label}: id=${readU32(alert, 2)}, ${frames.length} ramek`);
  void enqueueFrames(frames, opts.stopAfter);
}

/** What the sender UI can choose. areaCode: use voivodeshipCode('Małopolskie') etc. from regions.ts. */
export type SendOptions = Partial<Pick<AlertFields, 'text' | 'severity' | 'category' | 'areaCode'>>;

export function sendValid(opts: SendOptions = {}): void {
  const a = signAlert(fields(opts), secretKey);
  lastAlert = a;
  publish(a, 'poprawny');
}

export function sendBadSignature(opts: SendOptions = {}): void {
  const a = signAlert(fields(opts), secretKey);
  a[a.length - SIGNATURE_LEN + 5] ^= 0x01;
  // Not stored: a real node would relay it, but keeping it out keeps the backlog clean.
  publish(a, 'zły podpis', { store: false });
}

export function sendExpired(opts: SendOptions = {}): void {
  const now = Math.floor(Date.now() / 1000);
  publish(signAlert(fields({ ...opts, issuedAt: now - 7200, expiresAt: now - 3600 }), secretKey), 'wygasły', { store: false });
}

export function sendDuplicate(): void {
  if (!lastAlert) {
    log('najpierw wyślij poprawny alert');
    return;
  }
  publish(lastAlert, 'duplikat');
}

/** Sends a fresh valid alert, stops halfway, drops the link, then comes back after a pause. */
export async function dropMidTransfer(opts: SendOptions = {}): Promise<void> {
  const a = signAlert(fields({ text: 'TEST: alert po zerwaniu połączenia.', ...opts }), secretKey);
  lastAlert = a;
  const half = Math.max(1, Math.floor(node.frames(a).length / 2));
  publish(a, 'zerwanie w połowie', { stopAfter: half });
  await queue;
  // munim has no API to disconnect a central. Removing the GATT service and advertising is
  // expected to break the link; if the central stays connected, its RESEND write fails and the
  // receiver reconnects on its own. NOT YET VERIFIED on hardware (2-phone spike).
  stopAdvertising();
  setServices([]);
  node.resetLink();
  log(`wysłano ${half} ramek, połączenie zerwane, wracam za ${DROP_PAUSE_MS / 1000} s`);
  await sleep(DROP_PAUSE_MS);
  if (running) {
    advertise();
    log('rozgłaszam ponownie');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
