import type { Category, Severity } from './protocol/constants';

export type { Category, Severity };

/** A verified alert (valid signature, not expired, not seen before). */
export interface Alert {
  id: number;
  keyId: number;
  issuedAt: Date;
  expiresAt: Date;
  severity: Severity;
  /** Event type; values unknown to this app version arrive as 'other'. */
  category: Category;
  /** 0 = whole country, 2..32 = voivodeship (TERYT WOJ), WWPPGGR = gmina. See regions.ts. */
  areaCode: number;
  text: string;
  /** Node that delivered it (untrusted, informational). 0 if unknown. */
  nodeId: number;
  receivedAt: Date;
}

export type ListenerState =
  | 'idle'
  | 'permissions_missing'
  | 'bluetooth_off'
  | 'bluetooth_unauthorized'
  | 'unsupported'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface ListenerStatus {
  state: ListenerState;
  /** Android permission names still missing (empty when all granted). */
  missingPermissions: string[];
  /** Notifications can open full screen. False on Android 14+ until the user allows it. */
  fullScreenIntentAllowed: boolean;
  /** True when the user can grant full-screen in settings (see openFullScreenIntentSettings). */
  canRequestFullScreenIntent: boolean;
  /** Local notifications allowed at all (POST_NOTIFICATIONS on Android 13+). */
  notificationsAllowed: boolean;
  nodeId?: number;
  /** Delay before the next reconnect attempt, when state is 'reconnecting'. */
  retryInMs?: number;
  lastError?: string;
}
