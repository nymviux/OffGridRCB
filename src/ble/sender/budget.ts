// Size budget for the sender console: an alert must fit PROTOCOL.md limits and one Meshtastic LoRa packet.
// Meshtastic firmware limits (src/mesh/RadioInterface.h, protobufs mesh.options):
//   MAX_LORA_PAYLOAD_LEN 255, MESHTASTIC_HEADER_LENGTH 16, Data.payload max_size 233.
// The alert travels as the payload of a Data protobuf; channel encryption (AES-CTR) adds no bytes.
import { validateText } from '../protocol/alertCodec';
import { ALERT_HEADER_LEN, ALERT_MAX_TEXT_LEN, SIGNATURE_LEN } from '../protocol/constants';
import { utf8Encode } from '../bytes';

export const LORA_MAX_PACKET_LEN = 255;
export const MESHTASTIC_HEADER_LEN = 16;
export const MESHTASTIC_DATA_PAYLOAD_MAX = 233;
/** PRIVATE_APP port number. */
const PORTNUM = 256;
/** Data.bitfield (field 9, one-byte varint), set by current firmware. */
const BITFIELD_LEN = 2;

function varintLen(n: number): number {
  let len = 1;
  while (n >= 0x80) {
    n = Math.floor(n / 0x80);
    len++;
  }
  return len;
}

/** Bytes on air for one Meshtastic packet carrying `payloadLen` application bytes. */
export function meshtasticFrameLen(payloadLen: number): number {
  const data = 1 + varintLen(PORTNUM) + 1 + varintLen(payloadLen) + payloadLen + BITFIELD_LEN;
  return MESHTASTIC_HEADER_LEN + data;
}

export interface AlertBudget {
  textBytes: number;
  alertLen: number;
  frameLen: number;
  /** Polish message for the UI, null when the text can be sent. */
  error: string | null;
}

export function alertBudget(text: string): AlertBudget {
  const textBytes = utf8Encode(text).length;
  const alertLen = ALERT_HEADER_LEN + textBytes + SIGNATURE_LEN;
  const frameLen = meshtasticFrameLen(alertLen);
  let error: string | null = null;
  if (textBytes === 0) error = 'Treść nie może być pusta';
  else if (textBytes > ALERT_MAX_TEXT_LEN) error = `Treść ma ${textBytes} B, limit to ${ALERT_MAX_TEXT_LEN} B UTF-8`;
  else if (!validateText(text)) error = 'Treść zawiera niedozwolone znaki sterujące';
  else if (alertLen > MESHTASTIC_DATA_PAYLOAD_MAX || frameLen > LORA_MAX_PACKET_LEN) error = 'Alert nie mieści się w pakiecie LoRa';
  return { textBytes, alertLen, frameLen, error };
}
