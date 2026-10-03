import { HELLO_LEN, INFO_LEN, OP_HELLO, OP_RESEND, PROTOCOL_VERSION, RESEND_LEN } from './constants';
import { isU32, readU16, readU32, writeU16, writeU32 } from '../bytes';

export interface NodeInfo {
  protocolVersion: number;
  nodeId: number;
  latestAlertId: number;
  storedCount: number;
}

export function encodeInfo(info: NodeInfo): Uint8Array {
  const b = new Uint8Array(INFO_LEN);
  b[0] = info.protocolVersion;
  writeU32(b, 1, info.nodeId);
  writeU32(b, 5, info.latestAlertId);
  b[9] = Math.min(info.storedCount, 255);
  return b;
}

/** Accepts longer payloads for forward compatibility; extra bytes are ignored. */
export function decodeInfo(b: Uint8Array): NodeInfo | null {
  if (b.length < INFO_LEN) return null;
  return { protocolVersion: b[0], nodeId: readU32(b, 1), latestAlertId: readU32(b, 5), storedCount: b[9] };
}

export type ControlMessage =
  | { op: 'hello'; protocolVersion: number; lastKnownId: number }
  | { op: 'resend'; alertId: number; missing: number };

export function encodeHello(lastKnownId: number, protocolVersion = PROTOCOL_VERSION): Uint8Array {
  if (!isU32(lastKnownId)) throw new RangeError('lastKnownId must be u32');
  const b = new Uint8Array(HELLO_LEN);
  b[0] = OP_HELLO;
  b[1] = protocolVersion;
  writeU32(b, 2, lastKnownId);
  return b;
}

export function encodeResend(alertId: number, missing: number): Uint8Array {
  const b = new Uint8Array(RESEND_LEN);
  b[0] = OP_RESEND;
  writeU32(b, 1, alertId);
  writeU16(b, 5, missing);
  return b;
}

/** Node side: parse CONTROL write. Returns null for unknown opcode or wrong length. */
export function decodeControl(b: Uint8Array): ControlMessage | null {
  if (b.length === HELLO_LEN && b[0] === OP_HELLO) {
    return { op: 'hello', protocolVersion: b[1], lastKnownId: readU32(b, 2) };
  }
  if (b.length === RESEND_LEN && b[0] === OP_RESEND) {
    return { op: 'resend', alertId: readU32(b, 1), missing: readU16(b, 5) };
  }
  return null;
}
