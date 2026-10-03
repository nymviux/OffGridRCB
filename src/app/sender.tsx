// Sender mode: this phone plays an Off-grid RCB node (BLE peripheral) and signs alerts with the publicly
// known TEST keys. The only screen allowed to import sender code (see eslint.config.mjs, offline.test.ts).
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CATEGORIES,
  SEVERITIES,
  VOIVODESHIPS,
  WHOLE_COUNTRY,
  areaLabel,
  gminaTerytToAreaCode,
  providerForKey,
  type Category,
  type Severity,
} from '../ble';
import { alertBudget, LORA_MAX_PACKET_LEN } from '../ble/sender/budget';
import type { SendOptions } from '../ble/sender/sender';
import { ALERT_MAX_LEN, ALERT_MAX_TEXT_LEN } from '../ble/protocol/constants';
import { TEST_ONLY_KEYS } from '../../tools/fake-node/keys/TEST_ONLY_private_key';
import { categoryInfo } from '../alerts/categoryInfo';
import { Button, Card, Chip, SectionTitle } from '../ui/components';
import { SEVERITY_LABEL, usePalette } from '../ui/theme';

// Loaded on demand: munim-bluetooth creates its native object on import, and receiver mode must not pay for
// (or crash on) the peripheral stack it never uses.
type SenderModule = typeof import('../ble/sender/sender');
const loadSender = (): Promise<SenderModule> => import('../ble/sender/sender');

type AreaMode = 'country' | 'voivodeship' | 'gmina';

const MAX_LOG = 100;
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export default function SenderScreen() {
  const p = usePalette();
  const sender = useRef<SenderModule | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const [keyId, setKeyId] = useState(TEST_ONLY_KEYS[0].keyId);
  const [severity, setSeverity] = useState<Severity>('severe');
  const [category, setCategory] = useState<Category>('strong_wind');
  const [areaMode, setAreaMode] = useState<AreaMode>('country');
  const [voivodeship, setVoivodeship] = useState(VOIVODESHIPS[0].code);
  const [gmina, setGmina] = useState('1465011');
  const [text, setText] = useState('TEST: Ostrzeżenie przed silnym wiatrem. Zostań w domu.');

  const append = (line: string) => setLog((l) => [`${stamp()} ${line}`, ...l].slice(0, MAX_LOG));

  useEffect(() => {
    let unsubLog: (() => void) | undefined;
    let cancelled = false;
    loadSender()
      .then((s) => {
        if (cancelled) return;
        sender.current = s;
        unsubLog = s.onSenderLog(append);
      })
      .catch((e) => append(`nie udało się załadować nadajnika: ${String(e)}`));
    return () => {
      cancelled = true;
      unsubLog?.();
      // Leaving sender mode stops advertising.
      if (sender.current?.isSenderRunning()) sender.current.stopSender();
    };
  }, []);

  const budget = alertBudget(text);
  const gminaCode = gminaTerytToAreaCode(gmina);
  const areaCode =
    areaMode === 'country' ? WHOLE_COUNTRY : areaMode === 'voivodeship' ? voivodeship : (gminaCode ?? null);
  const formError = budget.error ?? (areaCode === null ? 'Kod TERYT gminy jest niepoprawny (7 cyfr)' : null);
  const opts = (): SendOptions => ({ keyId, severity, category, areaCode: areaCode ?? WHOLE_COUNTRY, text });
  const canSend = running && formError === null;

  const toggle = async () => {
    const s = sender.current;
    if (!s) return;
    if (running) {
      s.stopSender();
      setRunning(false);
      append('zatrzymano rozgłaszanie');
      return;
    }
    setStarting(true);
    try {
      setRunning(await s.startSender());
    } finally {
      setStarting(false);
    }
  };

  const send = (action: (s: SenderModule) => void | Promise<void>) => {
    const s = sender.current;
    if (!s) return;
    try {
      void Promise.resolve(action(s)).catch((e) => append(`błąd: ${String(e)}`));
    } catch (e) {
      append(`błąd: ${String(e)}`);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: p.bg }} contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: running ? p.ok : p.muted }]} />
          <Text style={[styles.status, { color: p.text }]}>{running ? 'Rozgłaszam serwis RCB' : 'Nadajnik wyłączony'}</Text>
        </View>
        <Text style={{ color: p.warn }}>
          Tryb testowy: alerty są podpisane publicznie znanym kluczem TEST. Nie używać do prawdziwych alertów.
        </Text>
        <View style={styles.actions}>
          <Button
            title={running ? 'Zatrzymaj' : starting ? 'Uruchamiam…' : 'Uruchom nadajnik'}
            variant={running ? 'secondary' : 'primary'}
            disabled={starting}
            onPress={() => void toggle()}
          />
          <Button title="Zmień tryb" variant="secondary" onPress={() => router.replace('/')} />
        </View>
      </Card>

      <SectionTitle>WYDAWCA</SectionTitle>
      <View style={styles.chips}>
        {TEST_ONLY_KEYS.map((k) => (
          <Chip
            key={k.keyId}
            label={`${providerForKey(k.keyId)?.name ?? 'nieznany'} · klucz ${k.keyId}`}
            selected={keyId === k.keyId}
            onPress={() => setKeyId(k.keyId)}
          />
        ))}
      </View>

      <SectionTitle>POZIOM</SectionTitle>
      <View style={styles.chips}>
        {SEVERITIES.map((s) => (
          <Chip key={s} label={SEVERITY_LABEL[s]} selected={severity === s} onPress={() => setSeverity(s)} />
        ))}
      </View>

      <SectionTitle>KATEGORIA</SectionTitle>
      <View style={styles.chips}>
        {CATEGORIES.map((c) => {
          const info = categoryInfo(c);
          return <Chip key={c} label={`${info.icon} ${info.label}`} selected={category === c} onPress={() => setCategory(c)} />;
        })}
      </View>

      <SectionTitle>OBSZAR</SectionTitle>
      <View style={styles.chips}>
        <Chip label="Cała Polska" selected={areaMode === 'country'} onPress={() => setAreaMode('country')} />
        <Chip label="Województwo" selected={areaMode === 'voivodeship'} onPress={() => setAreaMode('voivodeship')} />
        <Chip label="Gmina (TERYT)" selected={areaMode === 'gmina'} onPress={() => setAreaMode('gmina')} />
      </View>
      {areaMode === 'voivodeship' && (
        <View style={styles.chips}>
          {VOIVODESHIPS.map((v) => (
            <Chip key={v.code} label={v.name} selected={voivodeship === v.code} onPress={() => setVoivodeship(v.code)} />
          ))}
        </View>
      )}
      {areaMode === 'gmina' && (
        <TextInput
          value={gmina}
          onChangeText={setGmina}
          keyboardType="number-pad"
          maxLength={7}
          placeholder="np. 1465011"
          placeholderTextColor={p.muted}
          style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
        />
      )}
      <Text style={{ color: p.muted }}>{areaCode === null ? '—' : areaLabel(areaCode)}</Text>

      <SectionTitle>TREŚĆ</SectionTitle>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        style={[styles.input, styles.multiline, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
      />
      <Text style={{ color: budget.textBytes > ALERT_MAX_TEXT_LEN ? p.bad : p.muted }}>
        {budget.textBytes}/{ALERT_MAX_TEXT_LEN} B UTF-8 · alert {budget.alertLen}/{ALERT_MAX_LEN} B · pakiet LoRa
        (Meshtastic) ~{budget.frameLen}/{LORA_MAX_PACKET_LEN} B
      </Text>
      {formError && <Text style={{ color: p.bad }}>{formError}</Text>}

      <SectionTitle>WYŚLIJ</SectionTitle>
      {!running && <Text style={{ color: p.muted }}>Uruchom nadajnik, aby wysyłać alerty.</Text>}
      <View style={styles.actions}>
        <Button title="Poprawny alert" disabled={!canSend} onPress={() => send((s) => s.sendValid(opts()))} />
        <Button title="Zły podpis" variant="secondary" disabled={!canSend} onPress={() => send((s) => s.sendBadSignature(opts()))} />
        <Button title="Wygasły" variant="secondary" disabled={!canSend} onPress={() => send((s) => s.sendExpired(opts()))} />
        <Button title="Duplikat" variant="secondary" disabled={!running} onPress={() => send((s) => s.sendDuplicate())} />
        <Button
          title="Zerwanie w połowie"
          variant="secondary"
          disabled={!canSend}
          onPress={() => send((s) => s.dropMidTransfer(opts()))}
        />
      </View>

      <SectionTitle>LOG</SectionTitle>
      <Card>
        {log.length === 0 ? (
          <Text style={{ color: p.muted }}>Brak wpisów.</Text>
        ) : (
          log.map((line, i) => (
            <Text key={`${i}-${line}`} style={[styles.log, { color: p.text }]} selectable>
              {line}
            </Text>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  status: { fontSize: 18, fontWeight: '600', flexShrink: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  log: { fontFamily: 'monospace', fontSize: 12 },
});
