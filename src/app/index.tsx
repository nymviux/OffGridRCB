import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../ui/components';
import { usePalette } from '../ui/theme';

function ModeCard({ icon, title, body, onPress }: { icon: string; title: string; body: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <Card>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={[styles.title, { color: p.text }]}>{title}</Text>
        <Text style={{ color: p.muted }}>{body}</Text>
      </Card>
    </Pressable>
  );
}

// Shown on every launch: nothing listens or advertises until a mode is picked.
export default function ModePicker() {
  const p = usePalette();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: p.bg }]}>
      <View style={styles.content}>
        <Text style={[styles.heading, { color: p.text }]}>Off-grid RCB</Text>
        <Text style={{ color: p.muted }}>Wybierz tryb pracy telefonu.</Text>
        <ModeCard
          icon="📡"
          title="Odbiornik"
          body="Łączy się z pobliskim węzłem i pokazuje zweryfikowane alerty. Działa bez internetu i karty SIM."
          onPress={() => router.replace('/receiver')}
        />
        <ModeCard
          icon="📢"
          title="Nadajnik (TEST)"
          body="Udaje węzeł BLE i wysyła alerty podpisane publicznie znanym kluczem testowym. Tylko do testów."
          onPress={() => router.replace('/sender')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12 },
  heading: { fontSize: 26, fontWeight: '700', marginTop: 24 },
  icon: { fontSize: 32 },
  title: { fontSize: 20, fontWeight: '600' },
});
