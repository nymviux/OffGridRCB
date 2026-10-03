import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { areaLabel } from '../ble';
import { useAlerts } from '../alerts/AlertsContext';
import { categoryInfo } from '../alerts/categoryInfo';
import type { HistoryRecord } from '../history';
import { AlertSummary, Button, Card } from '../ui/components';
import { confirmDestructive } from '../ui/confirm';
import { formatDateTime, formatNodeId } from '../ui/format';
import { SEVERITY_LABEL, usePalette } from '../ui/theme';

function DetailRow({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: p.muted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: p.text }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function AlertDetails({ record, onClose }: { record: HistoryRecord; onClose: () => void }) {
  const p = usePalette();
  const { alert } = record;
  const info = categoryInfo(alert.category);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={() => undefined}>
          <Card style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: p.text }]}>
              {info.icon} {info.label}
            </Text>
            <Text style={{ color: p.text }} selectable>
              {alert.text}
            </Text>
            <DetailRow label="Poziom" value={SEVERITY_LABEL[alert.severity]} />
            <DetailRow label="Obszar" value={areaLabel(alert.areaCode)} />
            <DetailRow label="Źródło" value={info.source} />
            <DetailRow label="Wydano" value={formatDateTime(alert.issuedAt)} />
            <DetailRow label="Wygasa" value={formatDateTime(alert.expiresAt)} />
            <DetailRow label="Odebrano" value={formatDateTime(alert.receivedAt)} />
            <DetailRow label="Węzeł" value={formatNodeId(alert.nodeId)} />
            <DetailRow label="ID alertu" value={String(alert.id)} />
            <DetailRow label="Hash" value={record.hash.slice(0, 16) + '…'} />
            <Button title="Zamknij" onPress={onClose} />
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function HistoryScreen() {
  const p = usePalette();
  const { records, chain, clearHistory } = useAlerts();
  const [selected, setSelected] = useState<HistoryRecord | null>(null);

  const confirmClear = () =>
    confirmDestructive('Wyczyścić historię?', 'Wszystkie zapisane alerty zostaną usunięte z telefonu.', 'Wyczyść', clearHistory);

  return (
    <View style={[styles.flex, { backgroundColor: p.bg }]}>
      <FlatList
        data={records}
        keyExtractor={(r) => r.hash}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          records.length > 0 ? (
            <Text style={{ color: chain.ok ? p.ok : p.bad }}>
              {chain.ok
                ? '✓ Łańcuch historii spójny'
                : `✗ Historia naruszona (rekord #${chain.brokenAt})`}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)}>
            <Card>
              <AlertSummary alert={item.alert} compact />
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: p.muted }]}>Brak alertów.</Text>}
        ListFooterComponent={
          records.length > 0 ? (
            <View style={styles.footer}>
              <Text style={{ color: p.muted }}>Zapisano: {records.length}</Text>
              <Button title="Wyczyść historię" variant="danger" onPress={confirmClear} />
            </View>
          ) : null
        }
      />
      {selected && <AlertDetails record={selected} onClose={() => setSelected(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 16, gap: 10 },
  empty: { textAlign: 'center', marginTop: 48 },
  footer: { alignItems: 'center', gap: 8, marginTop: 12 },
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 },
  modalCard: { gap: 6 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  detailRow: { flexDirection: 'row', gap: 12 },
  detailLabel: { width: 80 },
  detailValue: { flex: 1 },
});
