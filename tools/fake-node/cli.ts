#!/usr/bin/env -S npx tsx
// Off-grid RCB fake node CLI: keys, signing, test vectors, decoding. No BLE, no network.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ed } from '../../src/ble/crypto/ed25519';
import { decodeAlert, signedMessage, type AlertFields } from '../../src/ble/protocol/alertCodec';
import { CATEGORIES, chunkSizeForMtu, SEVERITIES, type Category, type Severity } from '../../src/ble/protocol/constants';
import { areaLabel, voivodeshipCode } from '../../src/ble/regions';
import { fragmentAlert } from '../../src/ble/protocol/fragments';
import { buildVectors } from './vectors';
import { signAlert } from '../../src/ble/sender/signAlert';
import { bytesToHex, hexToBytes } from '../../src/ble/bytes';
import { TEST_ONLY_KEY_ID, TEST_ONLY_PUBLIC_KEY_HEX, TEST_ONLY_SECRET_KEY_HEX } from './keys/TEST_ONLY_private_key';

const VECTORS_JSON = resolve(__dirname, '../../src/ble/__tests__/vectors.json');

function usage(): never {
  console.log(`Usage: npx tsx tools/fake-node/cli.ts <command>

  keygen                         new random key pair (hex). Not for production use either.
  sign [--id N] [--severity S] [--category C] [--ttl SEC] [--area CODE|Name] [--text "..."] [--mtu 23]
                                 --area: 0 (country), 12 / Małopolskie (voivodeship), 1261011 (gmina)
                                 sign an alert with the TEST key, print hex and frames
  vectors [--write]              print test vectors; --write updates src/ble/__tests__/vectors.json
  decode <hex>                   decode and verify an alert with the TEST public key`);
  process.exit(1);
}

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(argv: string[]): void {
  const [cmd, ...args] = argv;
  switch (cmd) {
    case 'keygen': {
      const { secretKey, publicKey } = ed.keygen();
      console.log(JSON.stringify({ secretKeyHex: bytesToHex(secretKey), publicKeyHex: bytesToHex(publicKey) }, null, 2));
      return;
    }
    case 'sign': {
      const now = Math.floor(Date.now() / 1000);
      const severity = (arg(args, 'severity') ?? 'severe') as Severity;
      if (!SEVERITIES.includes(severity)) throw new Error(`severity: ${SEVERITIES.join('|')}`);
      const category = (arg(args, 'category') ?? 'other') as Category;
      if (!CATEGORIES.includes(category)) throw new Error(`category: ${CATEGORIES.join('|')}`);
      const areaArg = arg(args, 'area') ?? '0';
      const areaCode = /^\d+$/.test(areaArg) ? Number(areaArg) : voivodeshipCode(areaArg);
      if (areaCode === null) throw new Error(`unknown voivodeship: ${areaArg}`);
      const fields: AlertFields = {
        keyId: TEST_ONLY_KEY_ID,
        alertId: Number(arg(args, 'id') ?? now),
        issuedAt: now,
        expiresAt: now + Number(arg(args, 'ttl') ?? 3600),
        severity,
        category,
        areaCode,
        text: arg(args, 'text') ?? 'TEST: alert z fake-node',
      };
      const alert = signAlert(fields, hexToBytes(TEST_ONLY_SECRET_KEY_HEX));
      const mtu = Number(arg(args, 'mtu') ?? 23);
      console.log(`alert (${alert.length} B): ${bytesToHex(alert)}`);
      fragmentAlert(fields.alertId, alert, chunkSizeForMtu(mtu)).forEach((f, i) => console.log(`frame ${i}: ${bytesToHex(f)}`));
      return;
    }
    case 'vectors': {
      const v = buildVectors();
      const json = JSON.stringify(v, null, 2) + '\n';
      if (args.includes('--write')) {
        writeFileSync(VECTORS_JSON, json);
        console.error(`wrote ${VECTORS_JSON}`);
      }
      process.stdout.write(json);
      return;
    }
    case 'decode': {
      if (!args[0]) usage();
      const raw = hexToBytes(args[0]);
      const d = decodeAlert(raw);
      if (!d.ok) {
        console.log(`invalid: ${d.error}`);
        process.exit(2);
      }
      const sigOk = ed.verify(d.alert.signature, signedMessage(d.alert.body), hexToBytes(TEST_ONLY_PUBLIC_KEY_HEX));
      const a = d.alert;
      const out = {
        keyId: a.keyId,
        alertId: a.alertId,
        issuedAt: new Date(a.issuedAt * 1000).toISOString(),
        expiresAt: new Date(a.expiresAt * 1000).toISOString(),
        severity: a.severity,
        category: a.category,
        categoryCode: a.categoryCode,
        areaCode: a.areaCode,
        area: areaLabel(a.areaCode),
        text: a.text,
        length: a.raw.length,
        signatureValid: sigOk,
      };
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    default:
      usage();
  }
}

if (require.main === module) main(process.argv.slice(2));
