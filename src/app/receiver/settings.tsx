import { router } from 'expo-router';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { PROVIDERS } from '../../ble';
import { useAlerts } from '../../alerts/AlertsContext';
import { Button, Card, SectionTitle } from '../../ui/components';
import { usePalette } from '../../ui/theme';

export default function SettingsScreen() {
  const p = usePalette();
  const { mutedProviders, setProviderMuted } = useAlerts();

  return (
    <ScrollView style={{ backgroundColor: p.bg }} contentContainerStyle={styles.content}>
      <SectionTitle>WYDAWCY ALERTÓW</SectionTitle>
      <Card>
        {PROVIDERS.map((provider) => {
          const enabled = !mutedProviders.has(provider.id);
          return (
            <View key={provider.id} style={styles.row}>
              <View style={styles.flex}>
                <Text style={[styles.name, { color: p.text }]}>{provider.name}</Text>
                <Text style={{ color: p.muted }}>{enabled ? 'Powiadomienia włączone' : 'Wyciszony'}</Text>
              </View>
              <Switch
                accessibilityLabel={`Powiadomienia: ${provider.name}`}
                value={enabled}
                onValueChange={(on) => setProviderMuted(provider.id, !on)}
                trackColor={{ true: p.primary }}
              />
            </View>
          );
        })}
        <Text style={{ color: p.muted }}>
          Alerty od wyciszonych wydawców są nadal sprawdzane i zapisywane w historii, ale nie wywołują powiadomienia.
          Alerty o skrajnym zagrożeniu zawsze wywołują powiadomienie.
        </Text>
      </Card>

      <SectionTitle>TRYB</SectionTitle>
      <Card>
        <Text style={{ color: p.text }}>Telefon pracuje jako odbiornik.</Text>
        <Button title="Zmień tryb" variant="secondary" onPress={() => router.replace('/')} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
});
