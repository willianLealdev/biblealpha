// Notas musicais nos apps (o site usa tones.ts). Cada nota é um som curto criado aqui mesmo
// (sem arquivos de música e sem direitos autorais), guardado na pasta temporária e tocado pelo
// expo-audio. App antigo, ainda sem o expo-audio: fica sem som e o jogo continua.

import { requireOptionalNativeModule } from 'expo';
import { File, Paths } from 'expo-file-system';

type Player = { seekTo: (s: number) => Promise<void>; play: () => void; volume: number };

const NOTES: Record<string, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, C6: 1046.5,
};
const RATE = 22050;
const players = new Map<string, Player | null>();
let audio: { createAudioPlayer: (uri: string) => Player; setAudioModeAsync: (m: object) => Promise<void> } | null | undefined;

function audioModule() {
  if (audio !== undefined) return audio;
  audio = null;
  if (requireOptionalNativeModule('ExpoAudio')) {
    // Carregado só aqui: no app antigo o módulo nem é aberto
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audio = require('expo-audio');
    audio?.setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }
  return audio;
}

/** Som de sino em formato WAV (onda triangular que vai sumindo). */
function wav(freq: number, seconds: number) {
  const n = Math.floor(RATE * seconds);
  const bytes = new Uint8Array(44 + n * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const phase = (i * freq) / RATE;
    const tri = 4 * Math.abs(phase - Math.floor(phase + 0.5)) - 1;
    const fade = Math.exp((-5 * i) / n) * Math.min(1, i / 60);
    view.setInt16(44 + i * 2, tri * fade * 26000, true);
  }
  return bytes;
}

function player(note: string, seconds: number): Player | null {
  const id = `${note}-${seconds}`;
  if (players.has(id)) return players.get(id) ?? null;
  const mod = audioModule();
  const freq = NOTES[note];
  let p: Player | null = null;
  if (mod && freq) {
    try {
      const file = new File(Paths.cache, `bakids-note-${id}.wav`);
      if (!file.exists) {
        file.create();
        file.writeSync(wav(freq, seconds));
      }
      p = mod.createAudioPlayer(file.uri);
    } catch {
      p = null;
    }
  }
  players.set(id, p);
  return p;
}

/** Toca uma nota curta e suave (som de sino). */
export function playNote(note: string, seconds = 0.35, volume = 0.18) {
  const p = player(note, seconds);
  if (!p) return;
  try {
    p.volume = Math.min(1, volume * 4);
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // sem som: o jogo continua
  }
}

/** Som de trombeta (Jericó): duas notas seguidas. */
export function trumpet() {
  playNote('G4', 0.25, 0.22);
  setTimeout(() => playNote('C5', 0.5, 0.22), 220);
}

/** Som de vitória (fanfarra curta, sem voz). */
export function victory() {
  const notes: [string, number, number][] = [
    ['G4', 0, 0.18], ['C5', 130, 0.18], ['E5', 260, 0.18], ['G5', 390, 0.3],
    ['E5', 620, 0.16], ['G5', 750, 0.6], ['C6', 750, 0.7],
  ];
  for (const [note, at, len] of notes) setTimeout(() => playNote(note, len, 0.24), at);
}
