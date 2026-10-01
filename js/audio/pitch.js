// Détection de hauteur pour l'accordeur (voix, sifflement, instrument).
// Algorithme YIN (de Cheveigné & Kawahara, 2002), celui des accordeurs logiciels et des objets Max
// type fzero~ : rapide, peu sensible aux erreurs d'octave, fiable même sur un son faible.

const MIN_RMS = 0.0015; // un sifflement doux dans le micro de l'iPhone (sans gain automatique)
const YIN_THRESHOLD = 0.15;
const YIN_FALLBACK = 0.3;
const MIN_FREQ = 70;
const MAX_FREQ = 2500;

/**
 * Fréquence fondamentale d'un extrait audio, ou null si silence / son non périodique.
 * @param {Float32Array} input  @param {number} sampleRate
 * @returns {{ freq: number, clarity: number, rms: number } | null}
 */
export function detectPitch(input, sampleRate) {
  const n = input.length;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += input[i] * input[i];
  const rms = Math.sqrt(sum / n);
  if (rms < MIN_RMS) return null;

  const w = Math.floor(n / 2);
  const minTau = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
  const maxTau = Math.min(w - 1, Math.ceil(sampleRate / MIN_FREQ));
  // Fonction de différence cumulée normalisée (étapes 2 et 3 de YIN).
  const d = new Float32Array(maxTau + 2);
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau + 1; tau += 1) {
    let diff = 0;
    for (let i = 0; i < w; i += 1) {
      const delta = input[i] - input[i + tau];
      diff += delta * delta;
    }
    running += diff;
    d[tau] = running > 0 ? (diff * tau) / running : 1;
  }
  // Premier creux sous le seuil (étape 4), sinon le creux le plus profond s'il reste net.
  let tau = -1;
  for (let t = minTau; t <= maxTau; t += 1) {
    if (d[t] < YIN_THRESHOLD) {
      while (t + 1 <= maxTau && d[t + 1] < d[t]) t += 1;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    let best = minTau;
    for (let t = minTau + 1; t <= maxTau; t += 1) if (d[t] < d[best]) best = t;
    if (d[best] > YIN_FALLBACK) return null;
    tau = best;
  }
  // Interpolation parabolique (étape 5) : précision au centième de demi-ton.
  const a = d[tau - 1];
  const b = d[tau];
  const c = d[tau + 1] ?? b;
  const denom = a - 2 * b + c;
  const period = tau + (denom !== 0 ? (a - c) / (2 * denom) : 0);
  const freq = sampleRate / period;
  if (!Number.isFinite(freq) || freq < MIN_FREQ || freq > MAX_FREQ) return null;
  return { freq, clarity: 1 - b, rms };
}

/** Fréquence → note la plus proche et écart en centièmes de demi-ton (−50…+50). */
export function freqToNote(freq) {
  const exact = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100), exact };
}

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Ramène une note dans la tessiture du clavier (en gardant son nom). */
export function foldIntoRange(midi, low = 48, high = 84) {
  let m = midi;
  while (m > high) m -= 12;
  while (m < low) m += 12;
  return m;
}

const CONFIRM_FRAMES = 2; // une nouvelle note s'affiche après 2 lectures d'accord (~30 ms)
const HOLD_FRAMES = 9; // on garde la note affichée pendant les micro-coupures (~150 ms)
const SMOOTH = 0.35; // lissage de l'aiguille seulement

/**
 * Suivi de hauteur image par image, comme un accordeur : la note apparaît tout de suite,
 * seule l'aiguille est lissée, les micro-coupures sont ignorées.
 */
export function createPitchTracker(sampleRate) {
  let current = null; // { midi, cents, freq }
  let exactSmooth = null;
  let candidate = null;
  let candidateCount = 0;
  let missing = 0;
  return {
    reset() {
      current = null;
      exactSmooth = null;
      candidate = null;
      candidateCount = 0;
      missing = 0;
    },
    /** @returns {{ midi:number, cents:number, freq:number } | null} */
    push(buffer) {
      const hit = detectPitch(buffer, sampleRate);
      if (!hit) {
        missing += 1;
        if (missing > HOLD_FRAMES) {
          current = null;
          exactSmooth = null;
        }
        return current;
      }
      missing = 0;
      const { exact } = freqToNote(hit.freq);
      const midi = Math.round(exact);
      if (current && midi === current.midi) {
        exactSmooth += (exact - exactSmooth) * SMOOTH;
        candidate = null;
        candidateCount = 0;
      } else {
        // Toute nouvelle note doit être confirmée sur 2 lectures (~17 ms) : pas de fausse note à l'attaque.
        candidateCount = candidate === midi ? candidateCount + 1 : 1;
        candidate = midi;
        if (candidateCount < CONFIRM_FRAMES) return current;
        exactSmooth = exact;
        candidate = null;
        candidateCount = 0;
      }
      const shown = Math.round(exactSmooth);
      current = { midi: shown, cents: Math.round((exactSmooth - shown) * 100), freq: 440 * 2 ** ((exactSmooth - 69) / 12) };
      return current;
    },
  };
}
