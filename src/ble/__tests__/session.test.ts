import { describe, expect, it } from 'vitest';
import { AlertFilter, MemorySeenStore } from '../alertFilter';
import { bytesToHex, hexToBytes } from '../bytes';
import { decodeControl } from '../protocol/control';
import { NodeCore } from '../sender/nodeCore';
import { AlertSession, type Clock } from '../session';
import { MemoryTransport } from '../transport/memoryTransport';
import { Backoff } from '../transport/backoff';
import type { Alert } from '../types';
import type { LinkState } from '../transport/types';
import { KEYS, makeAlert, NOW, vectors } from './helpers';

function fakeClock(startMs = NOW * 1000) {
  let t = startMs;
  let tick: (() => void) | null = null;
  const clock: Clock = {
    now: () => t,
    setInterval: (fn) => {
      tick = fn;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
  };
  return {
    clock,
    advance(ms: number) {
      for (let i = 0; i < ms; i += 1000) {
        t += Math.min(1000, ms - i);
        tick?.();
      }
    },
  };
}

async function setup(opts: { autoConnect?: boolean; mtu?: number } = {}) {
  const transport = new MemoryTransport({ autoConnect: opts.autoConnect, mtu: opts.mtu });
  const store = new MemorySeenStore();
  const fc = fakeClock();
  const filter = new AlertFilter(KEYS, store, () => Math.floor(fc.clock.now() / 1000));
  const alerts: Alert[] = [];
  const links: LinkState[] = [];
  const rejects: string[] = [];
  const session = new AlertSession(
    transport,
    filter,
    { onAlert: (a) => alerts.push(a), onLink: (s) => links.push(s), onReject: (r) => rejects.push(r) },
    fc.clock,
  );
  await session.start();
  return { transport, session, alerts, links, rejects, fc, store };
}

describe('AlertSession over MemoryTransport', () => {
  it('delivers a valid alert once; duplicate, bad signature, expired are dropped', async () => {
    const { transport, alerts, rejects } = await setup();
    const a = makeAlert({ alertId: 10, text: 'Powódź' });
    transport.inject(a);
    transport.inject(a, { store: false });
    transport.inject(hexToBytes(vectors.badSignatureHex), { store: false });
    transport.inject(hexToBytes(vectors.expiredHex), { store: false });
    expect(alerts.map((x) => x.text)).toEqual(['Powódź']);
    expect(alerts[0]).toMatchObject({ id: 10, severity: 'warning', nodeId: 0x00c0ffee });
    expect(rejects).toEqual(['duplicate', 'bad_signature', 'expired']);
  });

  it('works with MTU 247 (single frame)', async () => {
    const { transport, alerts } = await setup({ mtu: 247 });
    transport.inject(makeAlert({ alertId: 11 }));
    expect(alerts).toHaveLength(1);
  });

  it('HELLO carries lastKnownId and node sends only the backlog after it', async () => {
    const { transport, alerts } = await setup({ autoConnect: false });
    transport.inject(makeAlert({ alertId: 1 }));
    transport.inject(makeAlert({ alertId: 2 }));
    transport.connect();
    expect(alerts.map((a) => a.id)).toEqual([1, 2]);
    expect(bytesToHex(transport.controlLog[0])).toBe('010100000000');

    transport.simulateDisconnect();
    transport.inject(makeAlert({ alertId: 3 })); // arrives from the mesh while phone is away
    transport.connect();
    expect(decodeControl(transport.controlLog[1])).toEqual({ op: 'hello', protocolVersion: 1, lastKnownId: 2 });
    expect(alerts.map((a) => a.id)).toEqual([1, 2, 3]);
  });

  it('drop mid-transfer: partial alert completes after reconnect, notified once', async () => {
    const { transport, alerts, links } = await setup();
    transport.inject(makeAlert({ alertId: 20 }), { dropAfter: 4 });
    expect(alerts).toHaveLength(0);
    expect(links.at(-1)?.state).toBe('reconnecting');
    transport.connect();
    expect(alerts.map((a) => a.id)).toEqual([20]);
    transport.connect(); // reconnect again: already known, nothing new
    expect(alerts).toHaveLength(1);
  });

  it('RESEND path: missing fragments are requested and filled', async () => {
    const { transport, alerts, fc } = await setup();
    const a = makeAlert({ alertId: 40 });
    // Store at the node without sending, then hand-deliver a subset of frames.
    transport.inject(a, { store: true, dropAfter: 0 });
    const node = new NodeCore(1);
    node.onControl(hexToBytes('010100000000'));
    const frames = node.frames(a);
    transport.connect({ sendBacklog: false });
    [0, 1, 3].forEach((i) => transport.injectFrame(frames[i]));
    expect(alerts).toHaveLength(0);
    fc.advance(5000);
    const resend = decodeControl(transport.controlLog.at(-1)!);
    expect(resend?.op).toBe('resend');
    if (resend?.op === 'resend') {
      const expected = ((1 << frames.length) - 1) & ~0b1011;
      expect(resend.missing).toBe(expected);
    }
    expect(alerts.map((x) => x.id)).toEqual([40]);
  });

  it('gives up after MAX_RESEND_ATTEMPTS', async () => {
    const { transport, alerts, rejects, fc } = await setup();
    const a = makeAlert({ alertId: 50 });
    const node = new NodeCore(1);
    node.onControl(hexToBytes('010100000000'));
    transport.injectFrame(node.frames(a)[0]); // node does not know this alert: RESEND goes nowhere
    fc.advance(5000);
    fc.advance(5000);
    fc.advance(5000);
    expect(alerts).toHaveLength(0);
    expect(rejects).toContain('reassembly');
  });

  it('stop() reports idle and ignores further frames', async () => {
    const { transport, session, alerts, links } = await setup();
    await session.stop();
    expect(links.at(-1)?.state).toBe('idle');
    transport.inject(makeAlert({ alertId: 60 }));
    expect(alerts).toHaveLength(0);
  });
});

describe('NodeCore', () => {
  it('sends nothing before HELLO, backlog after', () => {
    const node = new NodeCore(7, 23, () => NOW);
    expect(node.addAlert(makeAlert({ alertId: 5 }))).toEqual([]);
    expect(node.addAlert(makeAlert({ alertId: 3 }))).toEqual([]);
    const res = node.onControl(hexToBytes('010100000003'));
    expect(res.ok && res.frames.length).toBe(node.frames(makeAlert({ alertId: 5 })).length);
  });

  it('rejects wrong protocol version and unknown alert', () => {
    const node = new NodeCore(7, 23, () => NOW);
    expect(node.onControl(hexToBytes('010200000000'))).toEqual({ ok: false, error: 'unsupported_version' });
    expect(node.onControl(hexToBytes('02000000630003'))).toEqual({ ok: false, error: 'unknown_alert' });
    expect(node.onControl(hexToBytes('ff'))).toEqual({ ok: false, error: 'bad_request' });
  });

  it('INFO reflects only live alerts', () => {
    let now = NOW;
    const node = new NodeCore(0x5e1d0001, 23, () => now);
    node.addAlert(makeAlert({ alertId: 9, expiresAt: NOW + 10 }));
    expect(bytesToHex(node.info())).toBe('015e1d00010000000901');
    now = NOW + 10;
    expect(bytesToHex(node.info())).toBe('015e1d00010000000000');
  });
});

describe('Backoff', () => {
  it('grows 1,2,4.. capped at 60 s with jitter in upper half', () => {
    const b = new Backoff(1000, 60_000, () => 1);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(() => b.next())).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    b.reset();
    expect(b.next()).toBe(1000);
    const lo = new Backoff(1000, 60_000, () => 0);
    expect(lo.next()).toBe(500);
  });
});
