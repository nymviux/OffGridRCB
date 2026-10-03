# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Off-grid RCB: an Expo app (SDK 57, Android-first, package `pl.offgrid.rcb`) that receives emergency alerts
from a nearby BLE node with **no SIM and no internet**. Alerts are signed with Ed25519 by the issuer (RCB).
The node is an untrusted relay: no pairing, no link encryption. Only the signature makes an alert authentic.
The UI and the protocol spec are in Polish.

`PROTOCOL.md` is the contract between the app and the node firmware (GATT UUIDs, the 200 B alert format,
fragmentation, the HELLO/RESEND control messages, the receiver acceptance rules, test vectors). Code in
`src/ble/protocol/` and `src/ble/sender/nodeCore.ts` is the reference implementation of that spec. Keep the
two in sync.

## Commands

The project uses npm (`package-lock.json`), so use `npx`. Install with plain `npm ci`. `react-dom` is a declared
dependency pinned to the same version as `react`. expo-router's web-only deps (`@radix-ui/*`, `vaul`) require it as a
peer; without the pin npm picks the newest `react-dom` and fails with ERESOLVE against the SDK's `react`. Keep the
two in lockstep (`npx expo install react react-dom`). esbuild's install script is denied in `allowScripts` on purpose;
nothing needs it. `munim-bluetooth` is pinned to `0.8.1`: 0.9.0 calls Android 17 APIs but compiles against the
app's `compileSdkVersion` (36), so the build fails. `react-native-notify-kit` hard-codes `compileSdk 35`, so the
SDK needs `platforms;android-35` installed as well as 36.

```bash
npm test                                  # vitest run (node env, no device needed)
npx vitest run src/ble/__tests__/codec.test.ts   # single file
npx vitest run -t "rejects unknown key id"  # single test by name
npm run typecheck                         # tsc --noEmit
npm run lint                              # eslint src tools
npm run fake-node -- vectors              # print test vectors (tools/fake-node/cli.ts)
npm run fake-node -- vectors --write      # regenerate src/ble/__tests__/vectors.json
npm run fake-node -- sign --text "TEST" --severity extreme --category flood --area Małopolskie --ttl 600 --mtu 23
npm run fake-node -- decode <hex>         # parse an alert and verify it against the test key
npx expo run:android                      # dev build (native modules: Expo Go will not work)
```

Release APK built locally with the Android SDK (no EAS, Metro or dev client; the JS bundle ships in the APK).
It needs JDK 17 and `ANDROID_HOME`. The release variant is signed with the debug keystore, which is for testing only.

```bash
npm run android:prebuild                  # regenerate android/ from app.json (gitignored; never edit by hand)
npm run android:build                     # ./gradlew assembleRelease → android/app/build/outputs/apk/release/
npm run android:build -- -PreactNativeArchitectures=arm64-v8a   # one ABI, much faster
npm run android:build:lowmem              # same, for low-RAM machines (scripts/android-build-lowmem.sh)
npm run android:install                   # adb install -r the release APK
npm run android:release                   # all three
```

A full `android:build` runs native C++ with `nproc+2` clang jobs per CMake task and two JVMs. On the 6 GB dev laptop
that made systemd-oomd kill the whole desktop session. `android:build:lowmem` runs Gradle in its own systemd scope. It uses
`nproc - 2` CPUs (ninja, Gradle and Metro all size their parallelism from the CPU set), sets MemoryHigh to 70% of
RAM (throttle and swap) and MemoryMax to 85% (only the build gets killed), runs no daemon, compiles Kotlin in-process
and builds one project at a time. Override with `BUILD_CPUS`, `BUILD_MEM_HIGH`, `BUILD_MEM_MAX`, `BUILD_HEAP` and
`BUILD_ABIS` (default `arm64-v8a` only).

BLE does not work in the emulator. For on-device testing (two Android phones, release build, airplane mode),
follow `tools/fake-node/README.md`.

If you change the alert or frame format, run `vectors --write`, paste the new vectors into `PROTOCOL.md`
section 10, and run `npm test`. `tools/fake-node/vectors.test.ts` fails when they drift apart.

## Architecture

```
BlePlxTransport ──frames──▶ AlertSession ──bytes──▶ AlertFilter ──Alert──▶ ble/index.ts listeners
 (or MemoryTransport)        Reassembler + RESEND    decode, rules,          ├─ AlertsContext (React)
                                                     Ed25519, SeenStore      ├─ historyStore (hash chain)
                                                                             └─ notify-kit notification
```

- **`src/ble/index.ts`**: the receiver's public API, a module-level singleton (`startAlertListener`,
  `onAlert`, `onStatusChange`, ...). It wires permissions, the Android foreground service
  (`notifications.ts`), the transport, the session and the filter. Start it from the foreground UI only,
  because Android 12+ blocks starting a foreground service from the background. It never throws; failures go
  into `ListenerStatus`.
- **`Transport`** (`src/ble/transport/types.ts`) isolates the BLE library. `BlePlxTransport` does scanning,
  connection, MTU, the INFO→subscribe→HELLO handshake and reconnect backoff. `MemoryTransport` is for UI
  work and tests. Pass it through `startAlertListener({ transport })`.
- **`AlertSession`** and everything in `src/ble/protocol/`, `alertFilter.ts`, `regions.ts` and `bytes.ts` are
  pure TS with no React Native imports, so vitest runs them in Node. `AlertSession` takes an injectable
  `Clock`. Keep new protocol logic in this layer.
- **`AlertFilter`** applies the PROTOCOL.md §4 receiver rules in order. An `alert_id` is marked seen only after
  the signature verifies, so a forgery that reuses an ID cannot block the real alert. `SeenStore` has
  in-memory and MMKV (`mmkvSeenStore.ts`) implementations.
- **Providers and trusted keys** live in `src/ble/config.ts`. A provider (issuer) owns one or more keys, and
  `key_id` must be unique across all providers. Today there are two TEST providers (key_id 1 and 2), whose
  seeds are in `tools/fake-node/keys/`.
- **Muting** (`src/settings/`): the user can mute providers. The settings are stored in MMKV as the *muted* list,
  so providers added later start enabled. The muted state reaches `src/ble` only as the `shouldNotify` callback
  of `startAlertListener`. A muted alert is still verified and saved to history but doesn't ring. `extreme`
  severity always rings (`notifyPolicy.ts`).
- **`src/history/`**: persistent alert history in MMKV, kept as a SHA-256 hash chain (`verifyChain`) so edits
  are detectable. It is tamper-evident, not tamper-proof. `src/alerts/AlertsContext.tsx` subscribes to
  `onAlert` at module scope, so alerts are stored even when no screen is mounted.
- **Routes**: the root `src/app/_layout.tsx` is a Stack. `index.tsx` is the mode picker, shown on every launch.
  `receiver/` holds the tabs (node, history, settings) inside `AlertsProvider`, which starts the listener on
  mount and stops it on unmount. `sender.tsx` is the sender console. Modes are entered with `router.replace`.
  Shared UI lives in `src/ui/`.
- **Sender mode** (`src/ble/sender/`): lets a second phone act as a node in the BLE peripheral role
  (`munim-bluetooth`). It signs with the public TEST keys from `tools/fake-node/keys/`. `nodeCore.ts` is
  transport-agnostic node behaviour and the firmware reference. Session tests use it as the fake node.
  `budget.ts` holds the size checks the console shows: text ≤ 115 B, alert ≤ 200 B, and one Meshtastic LoRa
  packet ≤ 255 B. `src/app/sender.tsx` loads `sender.ts` with a dynamic `import()`, because munim creates its
  native object on import and receiver mode must not load it. Because the sender screen is in the app, the
  APK contains the TEST private keys. They are public, but remove or disable sender mode before any real
  deployment.

## Hard invariants (enforced by lint and tests)

- **The receiver is offline.** `fetch`, `XMLHttpRequest`, `WebSocket`, `axios` and `expo-notifications` are
  banned in `src/` by `eslint.config.mjs`, and `src/ble/__tests__/offline.test.ts` scans `src/ble`, `app`,
  `alerts`, `history`, `settings` and `ui` for them.
  Use `react-native-notify-kit` for local notifications.
- **The receiver never holds a private key and never advertises or relays.** Code under `src/` outside
  `src/ble/sender/` and `__tests__/` must not import `sender/` or `TEST_ONLY_private_key`. The only exception
  is `src/app/sender.tsx`, which has its own ESLint block and is skipped by `offline.test.ts`.
- **Protocol enums are append-only.** For an unknown `category` the receiver shows `other` and does not
  reject the alert. Text limits are counted in UTF-8 bytes (115 B max), not in characters.
- Multi-byte integers are big-endian, and timestamps are `u32` Unix seconds.
