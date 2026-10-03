# fake-node

A small toolkit for pretending to be an Off-grid RCB node. Everything here runs locally on your
machine — no Bluetooth, no network.

What's inside:

- `cli.ts` is a command-line tool for your laptop. It can generate keys, sign alerts, print test
  vectors and decode raw alerts.
- `vectors.ts` produces the test vectors used in `PROTOCOL.md` and in
  `src/ble/__tests__/vectors.json`.
- `keys/TEST_ONLY_private_key.ts` holds the issuer's **test key, which is public knowledge** — never
  use it for anything real. The CLI and the app's "sender" mode (`src/ble/sender/`) both sign with it.
  The receiver only ever knows the public key (`src/ble/config.ts`), and `offline.test.ts` makes sure
  receiver code never imports this file.

One thing worth knowing: in the proof of concept, the BLE node is played by a second Android phone
running in sender mode, not by your laptop.

## Running it

From the repository root (you'll need Node 20 or newer):

```bash
npm install
npx tsx tools/fake-node/cli.ts vectors            # print the test vectors
npx tsx tools/fake-node/cli.ts vectors --write    # regenerate src/ble/__tests__/vectors.json
npx tsx tools/fake-node/cli.ts sign --text "TEST: ewakuacja" --severity extreme --category flood --area Małopolskie --ttl 600 --mtu 23
npx tsx tools/fake-node/cli.ts sign --category fire --area 1261011   # Kraków municipality (TERYT code)
npx tsx tools/fake-node/cli.ts decode <hex>       # break an alert down and check its signature against the test key
npx tsx tools/fake-node/cli.ts keygen             # make a fresh key pair to play with
```

If you change the protocol format, run `vectors --write`, copy the new vectors into `PROTOCOL.md`
and run `npm test`. If you forget, `tools/fake-node/vectors.test.ts` will let you know.

## Testing with two phones

You'll need two real Android phones (8.0 or newer) — BLE doesn't work in the emulator. We'll call
them A, the receiver, and B, the sender. B acts as the BLE peripheral, so it has to support BLE
advertising.

1. Build a release version, so the JS bundle ships inside the APK and the app doesn't depend on
   Metro or the network:
   ```bash
   npx expo prebuild --platform android
   npx expo run:android --variant release --device
   ```
   Install it on both phones.
2. **Phone A (receiver):** take out the SIM card, turn on airplane mode, then switch Bluetooth back
   on by itself. Open the app in receiver mode (this calls `startAlertListener()`) and grant the
   Bluetooth and notification permissions. On Android 14 and later, also allow full-screen
   notifications if the status shows `canRequestFullScreenIntent: true`.
   On Xiaomi and Samsung phones, turn off battery optimization for the app as well.
3. **Phone B (sender):** start sender mode (`startSender()`).
4. Watch A's status go from `scanning` to `connecting` to `connected`.
5. Turn off A's screen and lock it. Then try each button on B:

| What you do on B | What should happen on A |
|---|---|
| `sendValid()` | a notification (full-screen or heads-up) within 2 s |
| `sendBadSignature()` | no notification; the log shows `rejected bad_signature` |
| `sendExpired()` | no notification; the log shows `rejected expired` |
| `sendDuplicate()` | no notification; the log shows `rejected duplicate` |
| `dropMidTransfer()` | `reconnecting`, then `connected`, and exactly one notification for the interrupted alert |
| turn off Bluetooth on B for 30 s, turn it back on and press `sendValid()` | A reconnects and receives the alert |
| turn off Bluetooth on A | status becomes `bluetooth_off` and nothing crashes; once Bluetooth is back, A returns to `scanning` on its own |

To see the receiver's logs: `adb logcat | grep -E "ReactNativeJS|\[ble\]"`.
To check latency, compare the moment you tap the button on B with `receivedAt` in `onAlert` — or
just use a stopwatch.
