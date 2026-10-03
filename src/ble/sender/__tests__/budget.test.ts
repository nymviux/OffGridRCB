import { describe, expect, it } from 'vitest';
import { ALERT_MAX_LEN } from '../../protocol/constants';
import { alertBudget, LORA_MAX_PACKET_LEN, meshtasticFrameLen, MESHTASTIC_DATA_PAYLOAD_MAX } from '../budget';

describe('meshtastic frame size', () => {
  it('a worst-case 200 B alert fits one Meshtastic LoRa packet', () => {
    expect(meshtasticFrameLen(ALERT_MAX_LEN)).toBe(224); // 16 header + 8 Data framing + 200
    expect(meshtasticFrameLen(ALERT_MAX_LEN)).toBeLessThanOrEqual(LORA_MAX_PACKET_LEN);
    expect(ALERT_MAX_LEN).toBeLessThanOrEqual(MESHTASTIC_DATA_PAYLOAD_MAX);
  });

  it('small payloads use one-byte length varints', () => {
    expect(meshtasticFrameLen(100)).toBe(16 + 1 + 2 + 1 + 1 + 100 + 2);
  });
});

describe('alertBudget', () => {
  it('counts UTF-8 bytes, not characters', () => {
    const b = alertBudget('żółć');
    expect(b.textBytes).toBe(8);
    expect(b.alertLen).toBe(85 + 8);
    expect(b.error).toBeNull();
  });

  it('accepts exactly 115 B and reports the frame size', () => {
    const b = alertBudget('A'.repeat(115));
    expect(b).toMatchObject({ textBytes: 115, alertLen: 200, frameLen: 224, error: null });
  });

  it('rejects text over 115 B', () => {
    expect(alertBudget('A'.repeat(114) + 'ż').error).toMatch(/115/);
  });

  it('rejects empty text and control characters', () => {
    expect(alertBudget('').error).not.toBeNull();
    expect(alertBudget('a\u0007b').error).not.toBeNull();
    expect(alertBudget('linia 1\nlinia 2').error).toBeNull();
  });
});
