// Notas musicais simples tocadas pelo próprio navegador (sem arquivos de música e sem direitos
// autorais: as melodias do Louvor são originais). Nos apps, por enquanto, fica sem som.

import { Platform } from 'react-native';

type Ctx = { createOscillator: () => any; createGain: () => any; destination: any; currentTime: number; resume?: () => Promise<void> };
let ctx: Ctx | null = null;

function audio(): Ctx | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const AudioCtor = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!AudioCtor) return null;
  ctx ??= new AudioCtor() as Ctx;
  ctx.resume?.().catch(() => {});
  return ctx;
}

const NOTES: Record<string, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, C6: 1046.5,
};

/** Toca uma nota curta e suave (som de sino). */
export function playNote(note: string, seconds = 0.35, volume = 0.18) {
  const ac = audio();
  const freq = NOTES[note];
  if (!ac || !freq) return;
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const now = ac.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + seconds);
  } catch {
    // navegador sem som: o jogo continua
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
