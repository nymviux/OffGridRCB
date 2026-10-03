// Public API of the receiver. The receiver only listens: it never advertises and never relays.
import 'react-native-get-random-values';
import { AlertFilter } from './alertFilter';
import { TRUSTED_KEYS } from './config';
import { MmkvSeenStore } from './mmkvSeenStore';
import {
  fullScreenIntentStatus,
  openFullScreenIntentSettings,
  showAlertNotification,
  startListenerService,
  stopListenerService,
  updateListenerService,
} from './notifications';
import { ensurePermissions } from './permissions';
import { AlertSession } from './session';
import { BlePlxTransport } from './transport/blePlxTransport';
import type { LinkState, Transport } from './transport/types';
import type { Alert, ListenerState, ListenerStatus } from './types';

export type { Alert, Category, ListenerState, ListenerStatus, Severity } from './types';
export { CATEGORIES, SEVERITIES } from './protocol/constants';
export { ALERT_MAX_TEXT_LEN } from './protocol/constants';
export { utf8Encode } from './bytes';
export {
  VOIVODESHIPS,
  WHOLE_COUNTRY,
  areaCovers,
  areaLabel,
  gminaTerytToAreaCode,
  isValidAreaCode,
  parseAreaCode,
  voivodeshipCode,
  type AreaInfo,
  type AreaKind,
  type Voivodeship,
} from './regions';
export { CATEGORY_LABEL } from './notifications';
export { PROVIDERS, providerForKey, type Provider } from './config';
export type { Transport } from './transport/types';
export { MemoryTransport } from './transport/memoryTransport';
export { openFullScreenIntentSettings };

export interface StartOptions {
  /** Defaults to BLE. Pass a MemoryTransport for UI work on the emulator. */
  transport?: Transport;
  /** Show system notifications (default true). */
  notify?: boolean;
  /** Ask for missing runtime permissions (default true). */
  requestPermissions?: boolean;
  /**
   * Called for every verified alert before showing a notification; false keeps it silent (it still reaches
   * onAlert listeners and history). Default: always notify.
   */
  shouldNotify?: (alert: Alert) => boolean;
}

type Listener<T> = (v: T) => void;

const alertListeners = new Set<Listener<Alert>>();
const statusListeners = new Set<Listener<ListenerStatus>>();

let status: ListenerStatus = {
  state: 'idle',
  missingPermissions: [],
  fullScreenIntentAllowed: false,
  canRequestFullScreenIntent: false,
  notificationsAllowed: false,
};
let session: AlertSession | null = null;
let filter: AlertFilter | null = null;
let notifyEnabled = true;
let notifyFilter: (alert: Alert) => boolean = () => true;
let usesService = false;
let starting: Promise<ListenerStatus> | null = null;

function setStatus(patch: Partial<ListenerStatus>): void {
  status = { ...status, ...patch };
  if (patch.state && patch.state !== 'reconnecting') delete status.retryInMs;
  for (const l of statusListeners) safeCall(l, status);
}

function safeCall<T>(fn: Listener<T>, v: T): void {
  try {
    fn(v);
  } catch (e) {
    console.warn('[ble] listener threw', e);
  }
}

const LINK_TEXT: Partial<Record<ListenerState, string>> = {
  scanning: 'Szukam węzła…',
  connecting: 'Łączę z węzłem…',
  connected: 'Połączono z węzłem',
  reconnecting: 'Ponowne łączenie…',
  bluetooth_off: 'Bluetooth wyłączony',
};

function onLink(s: LinkState): void {
  setStatus({ state: s.state, nodeId: s.nodeId, retryInMs: s.retryInMs, lastError: s.error });
  const text = LINK_TEXT[s.state];
  if (usesService && text) void updateListenerService(text);
}

function dispatchAlert(a: Alert): void {
  for (const l of alertListeners) safeCall(l, a);
  if (notifyEnabled && status.notificationsAllowed && passesNotifyFilter(a)) {
    showAlertNotification(a, status.fullScreenIntentAllowed).catch((e) => console.warn('[ble] notification failed', e));
  }
}

function passesNotifyFilter(a: Alert): boolean {
  try {
    return notifyFilter(a);
  } catch (e) {
    // A broken policy must never silence a verified alert.
    console.warn('[ble] shouldNotify threw', e);
    return true;
  }
}

/**
 * Starts listening. Call from the UI while the app is in the foreground (Android 12+ forbids
 * starting a foreground service from the background). Never throws: problems end up in the status.
 */
export function startAlertListener(opts: StartOptions = {}): Promise<ListenerStatus> {
  if (session) return Promise.resolve(status);
  starting ??= doStart(opts).finally(() => {
    starting = null;
  });
  return starting;
}

async function doStart(opts: StartOptions): Promise<ListenerStatus> {
  try {
    notifyEnabled = opts.notify !== false;
    notifyFilter = opts.shouldNotify ?? (() => true);
    const isMemory = !!opts.transport;
    const perms = isMemory
      ? { missingBle: [], notificationsAllowed: (await ensurePermissions(opts.requestPermissions !== false)).notificationsAllowed }
      : await ensurePermissions(opts.requestPermissions !== false);
    const fsi = await fullScreenIntentStatus();
    setStatus({
      missingPermissions: perms.missingBle,
      notificationsAllowed: perms.notificationsAllowed,
      fullScreenIntentAllowed: fsi.allowed,
      canRequestFullScreenIntent: fsi.canRequest,
    });
    if (perms.missingBle.length > 0) {
      setStatus({ state: 'permissions_missing' });
      return status;
    }

    filter ??= new AlertFilter(TRUSTED_KEYS, new MmkvSeenStore());
    const transport = opts.transport ?? new BlePlxTransport();
    session = new AlertSession(transport, filter, {
      onAlert: dispatchAlert,
      onLink,
      onReject: (reason, alertId) => console.info('[ble] rejected', reason, alertId ?? ''),
    });

    usesService = !isMemory;
    if (usesService) {
      try {
        await startListenerService();
      } catch (e) {
        // Still listen in the foreground; background delivery is not guaranteed.
        setStatus({ lastError: `foreground service: ${String(e)}` });
        usesService = false;
      }
    }
    await session.start();
    return status;
  } catch (e) {
    setStatus({ state: 'error', lastError: String(e) });
    return status;
  }
}

export async function stopAlertListener(): Promise<void> {
  await starting?.catch(() => {});
  const s = session;
  session = null;
  try {
    await s?.stop();
  } catch {
    // ignore
  }
  if (usesService) await stopListenerService();
  usesService = false;
  setStatus({ state: 'idle', nodeId: undefined, lastError: undefined });
}

export function onAlert(cb: (alert: Alert) => void): () => void {
  alertListeners.add(cb);
  return () => alertListeners.delete(cb);
}

/** Calls back immediately with the current status, then on every change. */
export function onStatusChange(cb: (status: ListenerStatus) => void): () => void {
  statusListeners.add(cb);
  safeCall(cb, status);
  return () => statusListeners.delete(cb);
}

export function getStatus(): ListenerStatus {
  return status;
}

/** Re-reads full-screen permission (e.g. after the user returns from settings). */
export async function refreshNotificationStatus(): Promise<ListenerStatus> {
  const fsi = await fullScreenIntentStatus();
  const perms = await ensurePermissions(false);
  setStatus({
    fullScreenIntentAllowed: fsi.allowed,
    canRequestFullScreenIntent: fsi.canRequest,
    notificationsAllowed: perms.notificationsAllowed,
  });
  return status;
}
