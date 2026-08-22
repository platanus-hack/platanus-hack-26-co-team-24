// ponytail: audio sintetizado; cambiar por .ogg reales = reemplazar sfx()/música por scene.sound
//
// Módulo de audio sin dependencias (ni Phaser ni React): un loop chiptune de
// 16 pasos (lead cuadrada + bajo triangular, ~120 BPM, La menor) y unos
// efectos de sonido sintetizados con Web Audio API. Todo pasa por un único
// GainNode `master` que el botón de mute controla.

const MUTE_KEY = 'muted';
const BPM = 120;
const STEP_SECONDS = 60 / BPM / 4; // semicorchea
const LOOKAHEAD_MS = 100;
const SCHEDULE_AHEAD_S = 0.2;

/** MIDI note number -> Hz (A4 = MIDI 69 = 440 Hz). */
export function midiToHz(n: number): number {
  return 440 * 2 ** ((n - 69) / 12);
}

// Progresión i-VI-III-VII en La menor, arpegio simple de 16 pasos.
// A3=57 C4=60 E4=64 | F3=53 A3=57 C4=60 | C4=60 E4=64 G4=67 | G3=55 B3=59 D4=62
export const LEAD: (number | null)[] = [
  57, 60, 64, 60, 53, 57, 60, 57, 60, 64, 67, 64, 55, 59, 62, 59,
];
export const BASS: (number | null)[] = [
  45, null, null, null, 41, null, null, null, 48, null, null, null, 43, null, null, null,
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicStarted = false;
let nextStepTime = 0;
let step = 0;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** true si el usuario silenció el juego (persistido en localStorage). */
export function isMuted(): boolean {
  return readMuted();
}

/** Aplica/persiste el mute. No lanza si aún no existe AudioContext: sólo
 * toca la ganancia si ya se creó (p.ej. en tests, sin gesto del usuario). */
export function setMuted(m: boolean): void {
  if (master) master.gain.value = m ? 0 : 1;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    // ponytail: sin localStorage (modo privado) el mute no sobrevive recarga.
  }
}

function envelope(gain: GainNode, at: number, peak: number, attack: number, hold: number, release: number): void {
  const g = gain.gain;
  g.setValueAtTime(0, at);
  g.linearRampToValueAtTime(peak, at + attack);
  g.setValueAtTime(peak, at + attack + hold);
  g.linearRampToValueAtTime(0, at + attack + hold + release);
}

function playNote(freq: number, type: OscillatorType, at: number, dur: number, peak: number): void {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  envelope(gain, at, peak, 0.005, Math.max(0, dur - 0.005 - 0.08), 0.08);
  osc.connect(gain).connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.01);
}

function scheduler(): void {
  if (!ctx) return;
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
    const lead = LEAD[step % LEAD.length];
    const bass = BASS[step % BASS.length];
    if (lead != null) playNote(midiToHz(lead), 'square', nextStepTime, STEP_SECONDS * 0.9, 0.12);
    if (bass != null) playNote(midiToHz(bass), 'triangle', nextStepTime, STEP_SECONDS * 3.5, 0.12);
    step++;
    nextStepTime += STEP_SECONDS;
  }
}

function startMusic(): void {
  if (musicStarted || !ctx) return;
  musicStarted = true;
  step = 0;
  nextStepTime = ctx.currentTime + 0.05;
  scheduler();
  setInterval(scheduler, LOOKAHEAD_MS);
}

/** Crea (o reanuda) el AudioContext y arranca la música. Debe llamarse desde
 * un gesto del usuario (click) por la autoplay policy del navegador. */
export function unlock(): void {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = readMuted() ? 0 : 1;
    master.connect(ctx.destination);
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__audioCtx = ctx;
  }
  if (ctx.state === 'suspended') ctx.resume();
  startMusic();
}

function noiseBuffer(seconds: number): AudioBuffer | null {
  if (!ctx) return null;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function playNoise(seconds: number, filterType: BiquadFilterType, freq: number, gainVal: number): void {
  if (!ctx || !master) return;
  const buf = noiseBuffer(seconds);
  if (!buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  const at = ctx.currentTime;
  envelope(gain, at, gainVal, 0.005, Math.max(0, seconds - 0.085), 0.08);
  src.connect(filter).connect(gain).connect(master);
  src.start(at);
  src.stop(at + seconds + 0.01);
}

type SfxName = 'click' | 'door' | 'alarm' | 'smoke' | 'blackout' | 'shake';

/** Reproduce un efecto sintetizado. No-op si `unlock()` no se ha llamado. */
export function sfx(name: SfxName): void {
  if (!ctx || !master) return;
  const at = ctx.currentTime;
  switch (name) {
    case 'click':
      playNote(880, 'square', at, 0.04, 0.15);
      break;
    case 'door':
      playNote(660, 'sine', at, 0.12, 0.2);
      playNote(440, 'sine', at + 0.12, 0.12, 0.2);
      break;
    case 'alarm': {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      const gain = ctx.createGain();
      gain.gain.value = 0.15;
      osc.connect(gain).connect(master);
      let t = at;
      osc.frequency.setValueAtTime(600, t);
      for (let i = 0; i < 8; i++) {
        const target = i % 2 === 0 ? 900 : 600;
        t += 0.15;
        osc.frequency.linearRampToValueAtTime(target, t);
      }
      osc.start(at);
      osc.stop(at + 1.2);
      break;
    }
    case 'smoke':
      playNoise(0.8, 'lowpass', 800, 0.2);
      break;
    case 'blackout': {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const gain = ctx.createGain();
      envelope(gain, at, 0.2, 0.005, 0.2, 0.08);
      osc.connect(gain).connect(master);
      osc.frequency.setValueAtTime(300, at);
      osc.frequency.linearRampToValueAtTime(60, at + 0.3);
      osc.start(at);
      osc.stop(at + 0.31);
      break;
    }
    case 'shake':
      playNoise(0.5, 'highpass', 200, 0.25);
      break;
  }
}
