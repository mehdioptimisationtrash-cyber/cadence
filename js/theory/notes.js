// Notes, hauteurs et orthographe (C♯ ou D♭ selon la tonalité).

export const pc = (n) => ((n % 12) + 12) % 12;

const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = {
  en: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  fr: ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'],
};
const ACCIDENTALS = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };

// Orthographe « simple » quand l'orthographe tonale donnerait un double dièse/bémol.
const SIMPLE_SHARP = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
const SIMPLE_FLAT = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];

export function accidentalOf(pitchClass, letter) {
  const diff = pc(pitchClass - LETTER_PC[letter]);
  return diff > 6 ? diff - 12 : diff;
}

export function simpleSpelling(pitchClass, preferFlats) {
  const [letter, acc] = (preferFlats ? SIMPLE_FLAT : SIMPLE_SHARP)[pc(pitchClass)];
  return { letter, acc };
}

export function formatNote({ letter, acc }, notation = 'en') {
  return LETTERS[notation][letter] + (ACCIDENTALS[acc] ?? '');
}

export function noteLabel(pitchClass, notation = 'en', preferFlats = false) {
  return formatNote(simpleSpelling(pitchClass, preferFlats), notation);
}

export function midiLabel(midi, notation = 'en') {
  return `${noteLabel(midi, notation)}${Math.floor(midi / 12) - 1}`;
}

export function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export const isBlackKey = (midi) => [1, 3, 6, 8, 10].includes(pc(midi));

// Lettre de la tonique de chaque tonalité majeure (C D♭ D E♭ E F F♯ G A♭ A B♭ B).
const MAJOR_KEY_LETTER = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];
const FLAT_MAJOR_KEYS = [1, 3, 5, 8, 10];
// Degrés chromatiques par rapport à la tonique : [décalage de lettre].
const CHROMATIC_LETTER = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6 };

/**
 * Orthographie les 12 hauteurs selon la tonalité (lettres conjointes dans la gamme).
 * scale = { iv, spell: [décalage vers la tonalité majeure parente, degré dans cette tonalité], letters? }
 */
export function makeSpeller(root, scale) {
  const parent = pc(root + scale.spell[0]);
  const baseLetter = (MAJOR_KEY_LETTER[parent] + scale.spell[1]) % 7;
  const letters = scale.letters ?? scale.iv.map((_, i) => i);
  // Les deux écritures possibles de la tonique (ex. D♯ / E♭) : on garde celle qui donne des lettres
  // conjointes avec le moins d'altérations, en évitant les doubles dièses/bémols.
  const options = [0, 1, 6].map((d) => (baseLetter + d) % 7).filter((L) => Math.abs(accidentalOf(root, L)) <= 1);
  const scored = options.map((rootLetter, order) => {
    const notes = scale.iv.map((iv, i) => {
      const letter = (rootLetter + letters[i]) % 7;
      return { p: pc(root + iv), letter, acc: accidentalOf(root + iv, letter) };
    });
    const cost = notes.reduce((s, n) => s + Math.abs(n.acc) + (Math.abs(n.acc) > 1 ? 10 : 0), 0) + order * 0.5;
    return { rootLetter, notes, cost };
  });
  const best = scored.reduce((x, y) => (y.cost < x.cost ? y : x));
  const { rootLetter } = best;
  const preferFlats = accidentalOf(root, rootLetter) < 0 || (accidentalOf(root, rootLetter) === 0 && FLAT_MAJOR_KEYS.includes(parent))
    || best.notes.some((n) => n.acc < 0) && !best.notes.some((n) => n.acc > 0);
  const spellings = new Array(12).fill(null);
  best.notes.forEach((n) => {
    if (!spellings[n.p]) spellings[n.p] = Math.abs(n.acc) > 2 ? simpleSpelling(n.p, preferFlats) : { letter: n.letter, acc: n.acc };
  });
  const place = (pitchClass, letter) => {
    const acc = accidentalOf(pitchClass, letter);
    return Math.abs(acc) > 1 ? simpleSpelling(pitchClass, preferFlats) : { letter, acc };
  };
  for (let p = 0; p < 12; p += 1) {
    if (spellings[p]) continue;
    const semis = pc(p - root);
    const offset = semis === 6 ? (preferFlats ? 4 : 3) : CHROMATIC_LETTER[semis];
    spellings[p] = place(p, (rootLetter + offset) % 7);
  }
  return {
    rootLetter,
    preferFlats,
    spelling: (p) => spellings[pc(p)],
    name: (p, notation = 'en') => formatNote(spellings[pc(p)], notation),
  };
}

// Petit générateur pseudo-aléatoire reproductible (mulberry32).
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    weighted(entries) {
      const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
      if (total <= 0) return entries[0]?.[0];
      let r = next() * total;
      for (const [value, w] of entries) {
        r -= Math.max(0, w);
        if (r <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
  };
}
