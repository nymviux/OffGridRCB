import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes, writeU32 } from '../bytes';
import { chunkSizeForMtu, MAX_FRAGMENTS, RESEND_ALL } from '../protocol/constants';
import { fragmentAlert, Reassembler } from '../protocol/fragments';
import { vectors } from './helpers';

const alert = hexToBytes(vectors.validHex);
const frames = () => fragmentAlert(1001, alert, chunkSizeForMtu(23));

describe('fragmentation', () => {
  it('matches MTU 23 and 247 vectors', () => {
    expect(frames().map(bytesToHex)).toEqual(vectors.framesMtu23Hex);
    expect(fragmentAlert(1001, alert, chunkSizeForMtu(247)).map(bytesToHex)).toEqual(vectors.framesMtu247Hex);
  });

  it('every MTU-23 frame fits in 20 bytes', () => {
    for (const f of frames()) expect(f.length).toBeLessThanOrEqual(20);
  });

  it('200-byte alert needs at most 15 fragments', () => {
    const big = hexToBytes(vectors.maxTextHex);
    expect(fragmentAlert(1003, big, chunkSizeForMtu(23)).length).toBe(MAX_FRAGMENTS);
  });
});

describe('Reassembler', () => {
  it('reassembles in order', () => {
    const r = new Reassembler();
    const fs = frames();
    fs.slice(0, -1).forEach((f) => expect(r.push(f)).toBeNull());
    expect(r.push(fs[fs.length - 1])).toEqual({ type: 'complete', alertId: 1001, bytes: alert });
    expect(r.size).toBe(0);
  });

  it('reassembles shuffled with duplicate fragments', () => {
    const r = new Reassembler();
    const fs = frames();
    const order = [3, 0, 9, 0, 5, 1, 2, 3, 8, 7, 4, 6];
    let done = null;
    for (const i of order) done = r.push(fs[i]) ?? done;
    expect(done).toEqual({ type: 'complete', alertId: 1001, bytes: alert });
  });

  it('interleaves two alerts', () => {
    const r = new Reassembler();
    const a = frames();
    const other = Uint8Array.from(alert);
    writeU32(other, 2, 1002);
    const b = fragmentAlert(1002, other, chunkSizeForMtu(23));
    const results = [];
    for (let i = 0; i < a.length; i++) results.push(r.push(a[i]), r.push(b[i]));
    const done = results.filter(Boolean);
    expect(done.map((d) => d!.type === 'complete' && d!.alertId)).toEqual([1001, 1002]);
  });

  it('rejects malformed frame headers', () => {
    const r = new Reassembler();
    expect(r.push(new Uint8Array(6))?.type).toBe('rejected'); // no payload
    expect(r.push(Uint8Array.from([0, 0, 0, 1, 2, 2, 9]))?.type).toBe('rejected'); // idx >= count
    expect(r.push(Uint8Array.from([0, 0, 0, 1, 0, 16, 9]))?.type).toBe('rejected'); // count > 15
    expect(r.push(Uint8Array.from([0, 0, 0, 0, 0, 1, 9]))?.type).toBe('rejected'); // id 0
    expect(r.size).toBe(0);
  });

  it('drops buffer on conflicting count', () => {
    const r = new Reassembler();
    r.push(frames()[0]);
    expect(r.push(Uint8Array.from([0, 0, 3, 0xe9, 1, 3, 1, 2]))).toEqual({
      type: 'rejected',
      alertId: 1001,
      reason: 'count_mismatch',
    });
    expect(r.size).toBe(0);
  });

  it('rejects total over 200 bytes', () => {
    const r = new Reassembler();
    const big = new Uint8Array(6 + 100);
    writeU32(big, 0, 7);
    big[5] = 3;
    let res = null;
    for (let i = 0; i < 3; i++) {
      big[4] = i;
      res = r.push(big.slice());
    }
    expect(res).toMatchObject({ type: 'rejected', reason: 'too_large' });
  });

  it('rejects uneven fragment sizes', () => {
    const r = new Reassembler();
    const f0 = Uint8Array.from([0, 0, 0, 9, 0, 2, 1, 2]);
    const f1 = Uint8Array.from([0, 0, 0, 9, 1, 2, 1, 2, 3]);
    r.push(f0);
    expect(r.push(f1)).toMatchObject({ type: 'rejected', reason: 'size_mismatch' });
  });

  it('caps parallel buffers and evicts oldest', () => {
    let t = 0;
    const r = new Reassembler(() => t);
    for (let id = 1; id <= 6; id++) {
      t++;
      r.push(Uint8Array.from([0, 0, 0, id, 0, 2, 1]));
    }
    expect(r.size).toBe(4);
  });

  it('reports stale buffers with missing bitmap', () => {
    let t = 0;
    const r = new Reassembler(() => t);
    const fs = frames();
    [0, 2, 3].forEach((i) => r.push(fs[i]));
    t = 4999;
    expect(r.stale(5000)).toEqual([]);
    t = 5000;
    const missing = 0b1111110010;
    expect(r.stale(5000)).toEqual([{ alertId: 1001, missing }]);
    expect(RESEND_ALL).toBe(0xffff);
  });
});
