import { Alert } from 'react-native';

export function confirmDestructive(title: string, message: string, actionLabel: string, onConfirm: () => void): void {
  Alert.alert(title, message, [
    { text: 'Anuluj', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
