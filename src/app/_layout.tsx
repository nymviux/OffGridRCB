import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { usePalette } from '../ui/theme';

// Root: the mode picker (index) leads to receiver mode (tabs) or sender mode. Modes are entered with
// router.replace, so Android back from a mode leaves the app instead of returning to the picker.
export default function RootLayout() {
  const p = usePalette();
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: p.card },
          headerTintColor: p.text,
          contentStyle: { backgroundColor: p.bg },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="receiver" />
        <Stack.Screen name="sender" options={{ headerShown: true, title: 'Nadajnik (TEST)' }} />
      </Stack>
    </>
  );
}
