import { createMMKV } from 'react-native-mmkv';
import type { Alert } from '../ble';
import { shouldNotify } from './notifyPolicy';
import { createSettingsStore } from './settingsStore';

export { shouldNotify } from './notifyPolicy';
export type { SettingsStore } from './settingsStore';

export const settingsStore = createSettingsStore(createMMKV({ id: 'offgrid-rcb-settings' }));

/** Notification policy for startAlertListener, reading the current settings on every alert. */
export const notifyPolicy = (alert: Alert): boolean => shouldNotify(alert, settingsStore.mutedProviders());
