// Détection de hauteur (voix, sifflement, instrument) par autocorrélation, façon accordeur.

const MIN_RMS = 0.012;
const MIN_CLARITY = 0.6;
const MIN_FREQ = 70;
const MAX_FREQ = 2400;

/**
 * Fréquence fondamentale d'un extrait audio, ou null si silence / son trop bruité.
 * @param {Float32Array} input  @param {number} sampleRate
 * @returns {{ freq: number, clarity: number } | null}
 */
export function detectPitch(input, sampleRate) {
  const n = input.length;
  let rms = 0;
  for (let i = 0; i < n; i += 1) rms += input[i] * input[i];
  rms = Math.sqrt(rms / n);
  if (rms < MIN_RMS) return null;

  const minLag = Math.floor(sampleRate / MAX_FREQ);
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / MIN_FREQ));
  // Autocorrélation normalisée (NSDF, méthode de McLeod).
  const nsdf = new Float32Array(maxLag + 2);
  for (let lag = 0; lag <= maxLag + 1; lag += 1) {
    let acf = 0;
    let energy = 0;
    for (let i = 0; i + lag < n; i += 1) {
      acf += input[i] * input[i + lag];
      energy += input[i] * input[i] + input[i + lag] * input[i + lag];
    }
    nsdf[lag] = energy > 0 ? (2 * acf) / energy : 0;
  }
  // Premier pic qui atteint 90 % du pic le plus haut (évite les erreurs d'octave).
  let lag = minLag;
  while (lag < maxLag && nsdf[lag] > 0) lag += 1;
  const peaks = [];
  for (; lag < maxLag; lag += 1) {
    if (nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1] && nsdf[lag] > 0) peaks.push(lag);
  }
  if (!peaks.length) return null;
  const highest = Math.max(...peaks.map((p) => nsdf[p]));
  const best = peaks.find((p) => nsdf[p] >= highest * 0.9);
  const clarity = nsdf[best];
  if (clarity < MIN_CLARITY) return null;
  // Interpolation parabolique pour une précision au centième de demi-ton.
  const a = nsdf[best - 1];
  const b = nsdf[best];
  const c = nsdf[best + 1];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  const period = best + (Number.isFinite(shift) ? shift : 0);
  const freq = sampleRate / period;
  return freq >= MIN_FREQ && freq <= MAX_FREQ ? { freq, clarity } : null;
}

/** Fréquence → note la plus proche et écart en centièmes de demi-ton (−50…+50). */
export function freqToNote(freq) {
  const exact = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100), exact };
}

/** Lissage : médiane des dernières lectures (supprime les sauts parasites). */
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
