export type LinkStateName =
  | 'idle'
  | 'bluetooth_off'
  | 'bluetooth_unauthorized'
  | 'unsupported'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface LinkState {
  state: LinkStateName;
  nodeId?: number;
  retryInMs?: number;
  error?: string;
}

export interface TransportHandlers {
  /** One raw ALERT notification (already base64-decoded). Untrusted. */
  onFrame(frame: Uint8Array): void;
  onLink(state: LinkState): void;
  /** Read at handshake time for HELLO. */
  getLastKnownId(): number;
}

/**
 * Moves ALERT frames from a node to the session. Implementations: BLE (ble-plx) and in-memory.
 * Must never throw from start/stop; failures are reported via onLink.
 */
export interface Transport {
  start(handlers: TransportHandlers): Promise<void>;
  stop(): Promise<void>;
  /** Write to CONTROL (RESEND). Rejects if not connected. */
  sendControl(bytes: Uint8Array): Promise<void>;
}
