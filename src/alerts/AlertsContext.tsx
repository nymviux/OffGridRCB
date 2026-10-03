import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Linking } from 'react-native';
import {
  getStatus,
  onAlert,
  onStatusChange,
  openFullScreenIntentSettings,
  refreshNotificationStatus,
  startAlertListener,
  stopAlertListener,
  type ListenerStatus,
} from '../ble';
import { historyStore, verifyChain, type HistoryRecord, type VerifyResult } from '../history';

// Store every verified alert while JS runs (also with the UI in background, thanks to the
// foreground service), not only while a screen is mounted.
onAlert((alert) => {
  try {
    historyStore.append(alert);
  } catch (e) {
    console.warn('[history] append failed', e);
  }
});

interface AlertsContextValue {
  status: ListenerStatus;
  /** Newest first. */
  records: readonly HistoryRecord[];
  chain: VerifyResult;
  restart: () => Promise<void>;
  stop: () => Promise<void>;
  openFullScreenSettings: () => void;
  openAppSettings: () => void;
  openBluetoothSettings: () => void;
  clearHistory: () => void;
}

const AlertsContext = createContext<AlertsContextValue | null>(null);

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ListenerStatus>(getStatus);
  const [records, setRecords] = useState(historyStore.records);
  const chain = useMemo(() => verifyChain(records), [records]);

  useEffect(() => {
    const unsubStatus = onStatusChange(setStatus);
    const unsubHistory = historyStore.subscribe((r) => setRecords(r));
    void startAlertListener();
    // Permissions may change while the user is in system settings.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshNotificationStatus();
    });
    return () => {
      unsubStatus();
      unsubHistory();
      sub.remove();
    };
  }, []);

  const restart = useCallback(async () => {
    await stopAlertListener();
    await startAlertListener();
  }, []);

  const value = useMemo<AlertsContextValue>(
    () => ({
      status,
      records,
      chain,
      restart,
      stop: stopAlertListener,
      openFullScreenSettings: () => void openFullScreenIntentSettings(),
      openAppSettings: () => void Linking.openSettings(),
      openBluetoothSettings: () =>
        void Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() => Linking.openSettings()),
      clearHistory: () => historyStore.clear(),
    }),
    [status, records, chain, restart],
  );

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useAlerts(): AlertsContextValue {
  const ctx = useContext(AlertsContext);
  if (!ctx) throw new Error('useAlerts must be used inside <AlertsProvider>');
  return ctx;
}
