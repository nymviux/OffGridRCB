import { PermissionsAndroid, Platform, type Permission } from 'react-native';

export interface PermissionResult {
  /** Required for scanning/connecting; missing ones block the listener. */
  missingBle: string[];
  /** POST_NOTIFICATIONS (Android 13+). Missing means alerts still arrive via onAlert, no system notification. */
  notificationsAllowed: boolean;
}

function blePermissions(): Permission[] {
  const api = Number(Platform.Version);
  if (api >= 31) {
    return [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];
  }
  return [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
}

/** Requests what is missing and reports the result. Never throws. */
export async function ensurePermissions(request = true): Promise<PermissionResult> {
  if (Platform.OS !== 'android') return { missingBle: [], notificationsAllowed: true };
  const wanted = blePermissions();
  const notif = Number(Platform.Version) >= 33 ? PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS : null;
  try {
    const all = notif ? [...wanted, notif] : wanted;
    const granted: Record<string, boolean> = {};
    if (request) {
      const res = await PermissionsAndroid.requestMultiple(all);
      for (const p of all) granted[p] = res[p] === PermissionsAndroid.RESULTS.GRANTED;
    } else {
      for (const p of all) granted[p] = await PermissionsAndroid.check(p);
    }
    return {
      missingBle: wanted.filter((p) => !granted[p]),
      notificationsAllowed: notif ? granted[notif] : true,
    };
  } catch {
    return { missingBle: wanted, notificationsAllowed: false };
  }
}
