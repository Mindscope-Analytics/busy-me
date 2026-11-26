import { Alert, Platform } from 'react-native';

/** Confirmación que funciona en web (window.confirm) y nativo (Alert.alert). */
export function confirmAsync(title: string, message: string, okLabel = 'Sí'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof globalThis.confirm === 'function' ? globalThis.confirm(`${title}\n\n${message}`) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, onPress: () => resolve(true) },
    ]);
  });
}
