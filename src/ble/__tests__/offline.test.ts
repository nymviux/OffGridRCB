import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Hard requirement: the receiver works with no SIM and no internet. No network APIs in src/ble.
const ROOT = join(__dirname, '..');
const FORBIDDEN = /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|new\s+(XMLHttpRequest|WebSocket|EventSource)\b|from\s+'(axios|expo-notifications|@react-native-firebase\/[a-z-]+)'/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : files(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('offline', () => {
  it('src/ble uses no network APIs and no push libraries', () => {
    const offenders = files(ROOT).filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('receiver code never imports the test private key or sender mode', () => {
    const receiver = files(ROOT).filter((f) => !f.includes(`${join(ROOT, 'sender')}`));
    const offenders = receiver.filter((f) => /TEST_ONLY_private_key|from '\.\/sender|from '\.\.\/sender/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
