// Reconhecimento de fala igual no site e nos apps: no navegador usa o do próprio navegador
// (Chrome, Edge, Safari); no Android/iPhone usa o do aparelho, com a mesma interface.

import { ExpoSpeechRecognitionModule, ExpoWebSpeechRecognition } from 'expo-speech-recognition';
import { Platform } from 'react-native';

export function speechRecognitionClass(): any {
  if (Platform.OS === 'web') {
    const w = globalThis as any;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  }
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable() ? ExpoWebSpeechRecognition : null;
  } catch {
    return null;
  }
}

/** No celular, pede acesso ao microfone e ao reconhecimento de fala antes de começar. */
export async function ensureSpeechPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const r = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return r.granted;
  } catch {
    return false;
  }
}
