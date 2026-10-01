// Qualités d'accords, nommage et détection.
import { pc } from './notes.js';

const Q = (id, sym, iv, name, roman, group) => ({ id, sym, iv, name, roman, group });

export const QUALITY_LIST = [
  Q('maj', '', [0, 4, 7], 'Majeur', '', 'Triades'),
  Q('min', 'm', [0, 3, 7], 'Mineur', '', 'Triades'),
  Q('dim', 'dim', [0, 3, 6], 'Diminué', '°', 'Triades'),
  Q('aug', 'aug', [0, 4, 8], 'Augmenté', '+', 'Triades'),
  Q('sus2', 'sus2', [0, 2, 7], 'Sus 2', 'sus2', 'Triades'),
  Q('sus4', 'sus4', [0, 5, 7], 'Sus 4', 'sus4', 'Triades'),
  Q('5', '5', [0, 7], 'Quinte (power chord)', '5', 'Triades'),
  Q('maj7', 'maj7', [0, 4, 7, 11], 'Majeur 7', 'maj7', 'Septièmes'),
  Q('7', '7', [0, 4, 7, 10], 'Septième de dominante', '7', 'Septièmes'),
  Q('m7', 'm7', [0, 3, 7, 10], 'Mineur 7', '7', 'Septièmes'),
  Q('m7b5', 'm7♭5', [0, 3, 6, 10], 'Demi-diminué', 'ø7', 'Septièmes'),
  Q('dim7', 'dim7', [0, 3, 6, 9], 'Diminué 7', '°7', 'Septièmes'),
  Q('mMaj7', 'm(maj7)', [0, 3, 7, 11], 'Mineur majeur 7', '(maj7)', 'Septièmes'),
  Q('maj7s5', 'maj7♯5', [0, 4, 8, 11], 'Majeur 7 quinte augmentée', '+maj7', 'Septièmes'),
  Q('7sus4', '7sus4', [0, 5, 7, 10], '7 sus 4', '7sus4', 'Septièmes'),
  Q('6', '6', [0, 4, 7, 9], 'Sixte', '6', 'Septièmes'),
  Q('m6', 'm6', [0, 3, 7, 9], 'Mineur 6', '6', 'Septièmes'),
  Q('add9', 'add9', [0, 4, 7, 14], 'Add 9', 'add9', 'Extensions'),
  Q('madd9', 'm(add9)', [0, 3, 7, 14], 'Mineur add 9', 'add9', 'Extensions'),
  Q('69', '6/9', [0, 4, 7, 9, 14], 'Six-neuf', '6/9', 'Extensions'),
  Q('maj9', 'maj9', [0, 4, 7, 11, 14], 'Majeur 9', 'maj9', 'Extensions'),
  Q('9', '9', [0, 4, 7, 10, 14], 'Neuvième', '9', 'Extensions'),
  Q('m9', 'm9', [0, 3, 7, 10, 14], 'Mineur 9', '9', 'Extensions'),
  Q('mMaj9', 'm(maj9)', [0, 3, 7, 11, 14], 'Mineur majeur 9', '(maj9)', 'Extensions'),
  Q('9sus4', '9sus4', [0, 5, 7, 10, 14], '9 sus 4', '9sus4', 'Extensions'),
  Q('m11', 'm11', [0, 3, 7, 10, 14, 17], 'Mineur 11', '11', 'Extensions'),
  Q('maj9s11', 'maj9♯11', [0, 4, 7, 11, 14, 18], 'Majeur 9 ♯11 (lydien)', 'maj9♯11', 'Extensions'),
  Q('maj13', 'maj13', [0, 4, 7, 11, 14, 21], 'Majeur 13', 'maj13', 'Extensions'),
  Q('13', '13', [0, 4, 7, 10, 14, 21], 'Treizième', '13', 'Extensions'),
  Q('m13', 'm13', [0, 3, 7, 10, 14, 21], 'Mineur 13', '13', 'Extensions'),
  Q('7b9', '7♭9', [0, 4, 7, 10, 13], '7 ♭9', '7♭9', 'Altérés'),
  Q('7s9', '7♯9', [0, 4, 7, 10, 15], '7 ♯9 (Hendrix)', '7♯9', 'Altérés'),
  Q('7s11', '7♯11', [0, 4, 7, 10, 18], '7 ♯11 (lydien dominant)', '7♯11', 'Altérés'),
  Q('7b13', '7♭13', [0, 4, 7, 10, 20], '7 ♭13', '7♭13', 'Altérés'),
  Q('maj7s11', 'maj7♯11', [0, 4, 7, 11, 18], 'Majeur 7 ♯11', 'maj7♯11', 'Altérés'),
  Q('m9b5', 'm9♭5', [0, 3, 6, 10, 14], 'Demi-diminué 9', 'ø9', 'Altérés'),
  Q('m7b9', 'm7♭9', [0, 3, 7, 10, 13], 'Mineur 7 ♭9 (phrygien)', '7♭9', 'Altérés'),
];

export const QUALITY_GROUPS = ['Triades', 'Septièmes', 'Extensions', 'Altérés'];

export const QUALITIES = Object.fromEntries(QUALITY_LIST.map((q) => [q.id, q]));
const BY_INTERVALS = new Map(QUALITY_LIST.map((q) => [q.iv.join(','), q.id]));

export const DOMINANT_QUALITIES = new Set(['7', '9', '13', '7b9', '7s9', '7s11', '7b13', '7sus4', '9sus4']);

export function getQuality(id) {
  return QUALITIES[id] ?? QUALITIES.maj;
}

export function qualityFromIntervals(intervals) {
  return BY_INTERVALS.get([...intervals].sort((a, b) => a - b).join(',')) ?? null;
}

export const isMinorQuality = (id) => {
  const iv = getQuality(id).iv;
  return iv.includes(3) && !iv.includes(4);
};

export const isDominantQuality = (id) => DOMINANT_QUALITIES.has(id);

// Nombre de « couches » de l'accord : 3 = triade, 4 = septième, 5 = neuvième…
export const qualityLevel = (id) => Math.max(3, getQuality(id).iv.length);

export function chordPitchClasses(chord) {
  return getQuality(chord.quality).iv.map((iv) => pc(chord.root + iv));
}

export function chordSymbol(chord, speller, notation = 'en') {
  const base = speller.name(chord.root, notation) + getQuality(chord.quality).sym;
  return chord.bass != null && pc(chord.bass) !== pc(chord.root)
    ? `${base}/${speller.name(chord.bass, notation)}`
    : base;
}

/** Détecte les accords possibles à partir d'un ensemble de notes MIDI. */
export function detectChords(midiNotes) {
  if (!midiNotes.length) return [];
  const sorted = [...midiNotes].sort((a, b) => a - b);
  const bass = pc(sorted[0]);
  const set = [...new Set(sorted.map(pc))];
  const results = [];
  for (const root of set) {
    const rel = new Set(set.map((p) => pc(p - root)));
    for (const q of QUALITY_LIST) {
      const qset = new Set(q.iv.map(pc));
      const missing = [...qset].filter((x) => !rel.has(x));
      const extra = [...rel].filter((x) => !qset.has(x));
      if (extra.length) continue;
      // La quinte juste peut manquer sans changer le nom de l'accord.
      const allowedMissing = missing.every((x) => x === 7) && missing.length <= 1;
      if (missing.length && !allowedMissing) continue;
      if (qset.size < 3 && set.length > 2) continue;
      let score = 10 - missing.length * 2;
      if (root === bass) score += 3;
      score -= Math.max(0, q.iv.length - 4) * 0.3;
      results.push({ root, quality: q.id, bass: root === bass ? null : bass, score });
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 6);
}
