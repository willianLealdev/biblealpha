// Guardar pequenos dados do Kids só neste aparelho, na hora (sem esperar).
// Site: localStorage. Apps: um arquivo JSON por chave na pasta do app.
// Sem espaço ou armazenamento bloqueado (navegação privada), segue sem guardar.

import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

function nativeFile(key: string) {
  const dir = new Directory(Paths.document, 'bakids');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, `${encodeURIComponent(key)}.json`);
}

export function readStored<T>(key: string): T | null {
  try {
    if (Platform.OS === 'web') {
      const raw = globalThis.localStorage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    const file = nativeFile(key);
    return file.exists ? (JSON.parse(file.textSync()) as T) : null;
  } catch {
    return null;
  }
}

export function writeStored<T>(key: string, value: T) {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
      return;
    }
    const file = nativeFile(key);
    if (!file.exists) file.create();
    file.writeSync(JSON.stringify(value));
  } catch {
    // sem espaço: segue sem guardar
  }
}
