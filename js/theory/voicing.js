// Disposition des notes (voicings) et conduite des voix.
import { pc } from './notes.js';
import { getQuality, isRest } from './chords.js';

export const VOICINGS = [
  { id: 'auto', label: 'Auto', hint: 'renversement le plus proche du centre du clavier' },
  { id: 'close', label: 'Serré', hint: 'position fondamentale' },
  { id: 'open', label: 'Ouvert', hint: 'large, orchestral' },
  { id: 'drop2', label: 'Drop 2', hint: 'jazz, guitare' },
  { id: 'piano', label: 'Piano 2 mains', hint: 'basse + main droite' },
];

const LOW = 43;
const HIGH = 88;
const CENTER = 62;
const sortAsc = (list) => [...list].sort((a, b) => a - b);

function baseNotes(chord, octave) {
  const root = 48 + pc(chord.root) + 12 * octave;
  return getQuality(chord.quality).iv.map((iv) => root + iv);
}

function invert(notes, k) {
  let out = sortAsc(notes);
  for (let i = 0; i < k; i += 1) {
    const [low, ...rest] = out;
    out = sortAsc([...rest, low + 12]);
  }
  return out;
}

function applyStyle(style, notes, chord) {
  const sorted = sortAsc(notes);
  if (style === 'open') return sortAsc(sorted.map((n, i) => (i % 2 === 1 ? n + 12 : n)));
  if (style === 'drop2' && sorted.length >= 3) {
    const idx = sorted.length - 2;
    return sortAsc(sorted.map((n, i) => (i === idx ? n - 12 : n)));
  }
  if (style === 'piano') {
    const bass = 36 + pc(chord.root);
    const upper = sorted.filter((n) => pc(n) !== pc(chord.root) || sorted.length <= 3);
    const lifted = upper.map((n) => (n < 58 ? n + 12 : n));
    return sortAsc([bass, bass + 12 <= Math.min(...lifted) - 3 ? bass + 12 : bass, ...lifted].filter((n, i, a) => a.indexOf(n) === i));
  }
  return sorted;
}

const average = (list) => list.reduce((s, n) => s + n, 0) / list.length;
const inRange = (v) => v[0] >= LOW && v[v.length - 1] <= HIGH;

function candidates(chord, style) {
  const size = getQuality(chord.quality).iv.length;
  const out = [];
  for (let octave = -1; octave <= 1; octave += 1) {
    for (let k = 0; k < size; k += 1) {
      const v = applyStyle(style, invert(baseNotes(chord, octave), k), chord);
      if (inRange(v)) out.push({ notes: v, inversion: k });
    }
  }
  return out;
}

function withBass(notes, chord) {
  if (chord.bass == null || pc(chord.bass) === pc(chord.root)) return notes;
  const low = notes[0];
  const below = low - (pc(low - chord.bass) || 12);
  return sortAsc([below, ...notes.filter((n) => pc(n) !== pc(chord.bass) || n > below + 12)]);
}

/** Disposition d'un accord (identique en lecture et à l'écoute). */
export function voiceChord(chord, { style = 'auto' } = {}) {
  if (isRest(chord)) return [];
  const shape = style === 'auto' ? 'close' : style;
  const shift = 12 * (chord.octave ?? 0);
  let notes;
  if (chord.inversion != null) {
    const size = getQuality(chord.quality).iv.length;
    notes = applyStyle(shape, invert(baseNotes(chord, 0), chord.inversion % size), chord);
  } else {
    const list = candidates(chord, shape);
    const cost = (c) => Math.abs(average(c.notes) - (CENTER - 2)) + c.inversion * (style === 'close' ? 6 : 1.5);
    notes = list.length ? list.reduce((best, c) => (cost(c) < cost(best) ? c : best)).notes : baseNotes(chord, 0);
  }
  return withBass(notes, chord).map((n) => n + shift);
}

/**
 * Chaque accord a UNE disposition, calculée pour lui seul autour d'un registre fixe :
 * il sonne pareil quand on le touche et en lecture, et modifier un accord ne change jamais le son
 * de ses voisins. Rester dans le même registre donne naturellement des enchaînements fluides.
 */
export function voiceProgression(chords, style = 'auto') {
  return chords.map((chord) => voiceChord(chord, { style }));
}

export function bassNote(chord) {
  if (isRest(chord)) return null;
  return 36 + pc(chord.bass ?? chord.root);
}
