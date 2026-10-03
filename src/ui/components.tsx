import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { areaLabel } from '../ble';
import { categoryInfo } from '../alerts/categoryInfo';
import type { StoredAlert } from '../history';
import { formatDateTime, formatRelative } from './format';
import { SEVERITY_COLOR, SEVERITY_LABEL, usePalette } from './theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const p = usePalette();
  return <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const p = usePalette();
  const bg = variant === 'primary' ? p.primary : variant === 'danger' ? p.bad : 'transparent';
  const fg = variant === 'secondary' ? p.primary : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: variant === 'secondary' ? p.primary : bg },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function AlertSummary({ alert, compact }: { alert: StoredAlert; compact?: boolean }) {
  const p = usePalette();
  const info = categoryInfo(alert.category);
  return (
    <View style={styles.alertRow}>
      <View style={[styles.severityBar, { backgroundColor: SEVERITY_COLOR[alert.severity] }]} />
      <Text style={styles.alertIcon}>{info.icon}</Text>
      <View style={styles.flex}>
        <Text style={[styles.alertTitle, { color: p.text }]}>{info.label}</Text>
        <Text style={{ color: p.muted }}>
          {SEVERITY_LABEL[alert.severity]} · {areaLabel(alert.areaCode)}
        </Text>
        <Text style={{ color: p.text }} numberOfLines={compact ? 2 : undefined}>
          {alert.text}
        </Text>
        {!compact && <Text style={{ color: p.muted }}>Wydano {formatDateTime(alert.issuedAt)}</Text>}
      </View>
      <Text style={[styles.relative, { color: p.muted }]}>{formatRelative(alert.receivedAt)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8 },
  button: { borderRadius: 8, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
  buttonText: { fontWeight: '600', fontSize: 15 },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  severityBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  alertIcon: { fontSize: 28 },
  alertTitle: { fontSize: 16, fontWeight: '600' },
  relative: { fontSize: 12 },
  flex: { flex: 1, gap: 2 },
});
