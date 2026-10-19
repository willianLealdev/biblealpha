import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Armazenamento local pequeno: SecureStore no celular, localStorage no navegador.
// No web, segredos (refresh token) NÃO ficam aqui: vão num cookie httpOnly definido pela API.

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } catch {
      // modo privado ou armazenamento bloqueado: segue sem persistir
    }
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}
