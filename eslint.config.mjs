import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', 'android', 'ios', '.expo'] },
  ...tseslint.configs.recommended,
  {
    // Receiver code must not reach the TEST private key, the sender mode, or any network/push API.
    files: ['src/ble/**/*.ts', 'src/ble/**/*.tsx'],
    ignores: ['src/ble/sender/**', 'src/ble/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/TEST_ONLY_private_key*'], message: 'Receiver must only know the public key (src/ble/config.ts).' },
            { group: ['**/sender/**', './sender', '../sender'], message: 'Receiver never advertises or relays.' },
          ],
          paths: [
            { name: 'expo-notifications', message: 'Local notifications only (react-native-notify-kit).' },
            { name: 'axios', message: 'Receiver is offline: no network.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Receiver is offline: no network.' },
        { name: 'XMLHttpRequest', message: 'Receiver is offline: no network.' },
        { name: 'WebSocket', message: 'Receiver is offline: no network.' },
      ],
    },
  },
);
