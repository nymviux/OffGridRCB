import { useColorScheme } from 'react-native';
import type { Severity } from '../ble';

const light = {
  bg: '#f4f5f7',
  card: '#ffffff',
  text: '#15171a',
  muted: '#5f6670',
  border: '#e2e5ea',
  primary: '#1f6feb',
  ok: '#1a7f37',
  warn: '#9a6700',
  bad: '#cf222e',
};

const dark: typeof light = {
  bg: '#0d1117',
  card: '#161b22',
  text: '#e6edf3',
  muted: '#8d96a0',
  border: '#30363d',
  primary: '#4493f8',
  ok: '#3fb950',
  warn: '#d29922',
  bad: '#f85149',
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  test: '#8d96a0',
  info: '#1f6feb',
  warning: '#d4a72c',
  severe: '#e16f24',
  extreme: '#cf222e',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  test: 'Test',
  info: 'Informacja',
  warning: 'Ostrzeżenie',
  severe: 'Poważne zagrożenie',
  extreme: 'Skrajne zagrożenie',
};
