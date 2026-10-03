import notifee, {
  AndroidCategory,
  AndroidForegroundServiceType,
  AndroidImportance,
  AndroidNotificationSetting,
  AndroidStyle,
  AndroidVisibility,
} from 'react-native-notify-kit';
import { Linking, Platform } from 'react-native';
import { areaLabel } from './regions';
import type { Alert } from './types';

// Local notifications only. No push, no FCM, no network.

export const ALERT_CHANNEL_ID = 'rcb-alerts';
const SERVICE_CHANNEL_ID = 'rcb-listener';
const SERVICE_NOTIFICATION_ID = 'rcb-listener';

const SEVERITY_LABEL: Record<Alert['severity'], string> = {
  test: 'TEST',
  info: 'Informacja',
  warning: 'Ostrzeżenie',
  severe: 'Poważne zagrożenie',
  extreme: 'Skrajne zagrożenie',
};

export const CATEGORY_LABEL: Record<Alert['category'], string> = {
  other: 'Zagrożenie',
  fire: 'Pożar',
  flood: 'Powódź',
  accident: 'Wypadek',
  medical: 'Zagrożenie medyczne',
  storm: 'Burza',
  strong_wind: 'Silny wiatr',
  heat: 'Upał',
  frost: 'Mróz',
  heavy_snow: 'Intensywne opady śniegu',
  chemical_hazard: 'Skażenie chemiczne',
  air_threat: 'Zagrożenie z powietrza',
  power_outage: 'Brak prądu',
  water_contamination: 'Skażenie wody',
  missing_person: 'Zaginięcie osoby',
  avalanche: 'Zagrożenie lawinowe',
  mountain_danger: 'Zagrożenie w górach',
  water_rescue: 'Ratownictwo wodne',
};

let channelsReady = false;
let stopService: (() => void) | null = null;

// Must be registered before a notification with asForegroundService is displayed.
// The task keeps the service alive until the promise resolves (stopForegroundService).
notifee.registerForegroundService(
  () =>
    new Promise<void>((resolve) => {
      stopService = resolve;
    }),
);

async function ensureChannels(): Promise<void> {
  if (channelsReady) return;
  await notifee.createChannel({
    id: ALERT_CHANNEL_ID,
    name: 'Alerty RCB (off-grid)',
    description: 'Zweryfikowane alerty odebrane z węzłów przez Bluetooth',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    bypassDnd: true,
    vibration: true,
    lights: true,
  });
  await notifee.createChannel({
    id: SERVICE_CHANNEL_ID,
    name: 'Nasłuch alertów',
    importance: AndroidImportance.LOW,
  });
  channelsReady = true;
}

export interface FullScreenStatus {
  allowed: boolean;
  /** User can change it in settings (Android 14+). */
  canRequest: boolean;
}

export async function fullScreenIntentStatus(): Promise<FullScreenStatus> {
  if (Platform.OS !== 'android') return { allowed: false, canRequest: false };
  try {
    const s = await notifee.getNotificationSettings();
    const allowed = s.android.fullScreenIntent === AndroidNotificationSetting.ENABLED;
    return { allowed, canRequest: !allowed && Number(Platform.Version) >= 34 };
  } catch {
    return { allowed: false, canRequest: false };
  }
}

/** Opens the Android 14+ "full screen notifications" page; falls back to app notification settings. */
export async function openFullScreenIntentSettings(): Promise<void> {
  try {
    if (Platform.OS === 'android' && Number(Platform.Version) >= 34) {
      await Linking.sendIntent('android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT');
      return;
    }
  } catch {
    // Some OEM builds lack the activity.
  }
  await notifee.openNotificationSettings(ALERT_CHANNEL_ID).catch(() => {});
}

/** Shows a verified alert. Full screen only when the platform allows it, else heads-up. */
export async function showAlertNotification(alert: Alert, fullScreenAllowed: boolean): Promise<void> {
  await ensureChannels();
  await notifee.displayNotification({
    id: `alert-${alert.id}`,
    title: `${CATEGORY_LABEL[alert.category]} · ${SEVERITY_LABEL[alert.severity]}`,
    subtitle: areaLabel(alert.areaCode),
    body: alert.text,
    data: { alertId: String(alert.id) },
    android: {
      channelId: ALERT_CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      category: AndroidCategory.ALARM,
      pressAction: { id: 'default', launchActivity: 'default' },
      ...(fullScreenAllowed ? { fullScreenAction: { id: 'default', launchActivity: 'default' } } : {}),
      timestamp: alert.issuedAt.getTime(),
      showTimestamp: true,
      style: { type: AndroidStyle.BIGTEXT, text: alert.text },
    },
  });
}

/** Starts the connectedDevice foreground service. Must be called while the app is in the foreground. */
export async function startListenerService(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await ensureChannels();
  await notifee.displayNotification({
    id: SERVICE_NOTIFICATION_ID,
    title: 'Off-grid RCB',
    body: 'Nasłuch alertów z węzłów Bluetooth',
    android: {
      channelId: SERVICE_CHANNEL_ID,
      asForegroundService: true,
      foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE],
      ongoing: true,
      pressAction: { id: 'default', launchActivity: 'default' },
    },
  });
}

export async function updateListenerService(body: string): Promise<void> {
  if (Platform.OS !== 'android' || !stopService) return;
  await notifee
    .displayNotification({
      id: SERVICE_NOTIFICATION_ID,
      title: 'Off-grid RCB',
      body,
      android: {
        channelId: SERVICE_CHANNEL_ID,
        asForegroundService: true,
        foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE],
        ongoing: true,
        onlyAlertOnce: true,
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    })
    .catch(() => {});
}

export async function stopListenerService(): Promise<void> {
  if (Platform.OS !== 'android') return;
  stopService?.();
  stopService = null;
  await notifee.stopForegroundService().catch(() => {});
}
