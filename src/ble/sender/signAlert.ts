import { assembleAlert, encodeAlertBody, signedMessage, type AlertFields } from '../protocol/alertCodec';
import { ed } from '../crypto/ed25519';

/** Encode + sign. The secret key is passed in; this module holds none. */
export function signAlert(fields: AlertFields, secretKey: Uint8Array): Uint8Array {
  const body = encodeAlertBody(fields);
  return assembleAlert(body, ed.sign(signedMessage(body), secretKey));
}
