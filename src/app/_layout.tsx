import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text, type ColorValue } from 'react-native';
import { AlertsProvider } from '../alerts/AlertsContext';
import { usePalette } from '../ui/theme';

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  };

export default function RootLayout() {
  const p = usePalette();
  return (
    <AlertsProvider>
      <StatusBar style="auto" />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: p.card },
          headerTintColor: p.text,
          tabBarStyle: { backgroundColor: p.card, borderTopColor: p.border },
          tabBarActiveTintColor: p.primary,
          tabBarInactiveTintColor: p.muted,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Węzeł', tabBarIcon: icon('📡') }} />
        <Tabs.Screen name="history" options={{ title: 'Historia', tabBarIcon: icon('🗂️') }} />
      </Tabs>
    </AlertsProvider>
  );
}
