// Harmonie tonale : accords de la gamme, chiffrage romain, fonctions, emprunts, suggestions.
import { pc, makeSpeller } from './notes.js';
import { getScale, isHeptatonic, isMinorScale } from './scales.js';
import {
  getQuality, qualityFromIntervals, isMinorQuality, isDominantQuality, chordPitchClasses,
} from './chords.js';
import { inversionsOf, stepwiseCandidates } from './slash.js';

const MAJOR_IV = [0, 2, 4, 5, 7, 9, 11];
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export const LEVELS = [
  { value: 3, label: 'Triades' },
  { value: 4, label: '7e' },
  { value: 5, label: '9e' },
  { value: 6, label: '11e' },
  { value: 7, label: '13e' },
];

export const FUNCTIONS = {
  T: { label: 'Tonique', hint: 'repos' },
  SD: { label: 'Sous-dominante', hint: 'élan' },
  D: { label: 'Dominante', hint: 'tension' },
  sec: { label: 'Dominante secondaire', hint: 'tension chromatique' },
  borrow: { label: 'Emprunt', hint: 'couleur d’un autre mode' },
};

// Empilement de tierces : étapes de la gamme utilisées pour chaque niveau (13e sans la 11e).
const STACK_STEPS = { 3: [0, 1, 2], 4: [0, 1, 2, 3], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 6] };

// Gammes non heptatoniques : qualités essayées par niveau, dans l'ordre de préférence.
const FIT_CANDIDATES = {
  3: ['maj', 'min', 'sus4', 'sus2', 'dim', 'aug', '5'],
  4: ['maj7', 'm7', '7', '6', 'm6', '7sus4', 'm7b5', 'mMaj7', 'dim7'],
  5: ['maj9', 'm9', '9', '69', 'add9', 'madd9', '9sus4'],
  6: ['m11', 'maj9s11'],
  7: ['maj13', '13', 'm13'],
};

function stackedInterval(iv, degree, step) {
  const idx = degree + step * 2;
  return iv[idx % iv.length] + 12 * Math.floor(idx / iv.length) - iv[degree];
}

// Neuvième mineure sur un accord non dominant : sonne dur, on garde la septième.
const AVOID_IN_STACK = new Set(['m7b9']);

function stackQuality(scale, degree, level) {
  for (let l = level; l >= 3; l -= 1) {
    const q = qualityFromIntervals(STACK_STEPS[l].map((s) => stackedInterval(scale.iv, degree, s)));
    if (q && !AVOID_IN_STACK.has(q)) return q;
  }
  return null;
}

function fitQuality(scale, degree, level) {
  const rel = new Set(scale.iv.map((x) => pc(x - scale.iv[degree])));
  for (let l = level; l >= 3; l -= 1) {
    const q = FIT_CANDIDATES[l].find((id) => getQuality(id).iv.every((x) => rel.has(pc(x))));
    if (q) return q;
  }
  return null;
}

/** Accord construit sur le degré `degree` de la gamme. */
export function diatonicChord(key, degree, level = 3) {
  const scale = getScale(key.scale);
  const quality = (isHeptatonic(scale) && stackQuality(scale, degree, level)) || fitQuality(scale, degree, level);
  return quality ? { root: pc(key.root + scale.iv[degree]), quality, degree } : null;
}

export function diatonicChords(key, level = 3) {
  return getScale(key.scale).iv.map((_, d) => diatonicChord(key, d, level)).filter(Boolean);
}

export function isDiatonic(chord, key) {
  const set = new Set(getScale(key.scale).iv.map((iv) => pc(key.root + iv)));
  return chordPitchClasses(chord).every((p) => set.has(p)) && (chord.bass == null || set.has(pc(chord.bass)));
}

/** Index du degré si la fondamentale appartient à la gamme, sinon -1. */
export function degreeOf(chord, key) {
  return getScale(key.scale).iv.findIndex((iv) => pc(key.root + iv) === pc(chord.root));
}

function degreeNumeral(p, key, speller, scale) {
  const degree = (speller.spelling(p).letter - speller.rootLetter + 7) % 7;
  const ref = isHeptatonic(scale) ? scale.iv : MAJOR_IV;
  const diff = pc(p - (key.root + ref[degree]));
  const acc = diff === 1 ? '♯' : diff === 11 ? '♭' : '';
  return { degree, acc };
}

export function romanNumeral(chord, key) {
  const scale = getScale(key.scale);
  const speller = makeSpeller(key.root, scale);
  const { degree, acc } = degreeNumeral(chord.root, key, speller, scale);
  const numeral = isMinorQuality(chord.quality) ? NUMERALS[degree].toLowerCase() : NUMERALS[degree];
  const base = `${acc}${numeral}${getQuality(chord.quality).roman}`;
  if (chord.bass == null || pc(chord.bass) === pc(chord.root)) return base;
  const b = degreeNumeral(chord.bass, key, speller, scale);
  return `${base}/${b.acc}${NUMERALS[b.degree]}`;
}

const FUNCTION_BY_DEGREE = ['T', 'SD', 'T', 'SD', 'D', 'T', 'D'];
const FUNCTION_BY_SEMIS = ['T', 'SD', 'SD', 'T', 'T', 'SD', 'D', 'D', 'SD', 'T', 'SD', 'D'];

export function chordFunction(chord, key) {
  const scale = getScale(key.scale);
  const semis = pc(chord.root - key.root);
  if (isDiatonic(chord, key)) {
    const deg = degreeOf(chord, key);
    return isHeptatonic(scale) && deg >= 0 ? FUNCTION_BY_DEGREE[deg] : FUNCTION_BY_SEMIS[semis];
  }
  if (isDominantQuality(chord.quality)) return semis === 7 ? 'D' : 'sec';
  return 'borrow';
}

const sameChord = (a, b) => pc(a.root) === pc(b.root) && a.quality === b.quality && (a.bass ?? null) === (b.bass ?? null);

const PARALLEL_FOR_MAJOR = ['minor', 'mixolydian', 'dorian', 'lydian', 'phrygian', 'harmonicMinor'];
const PARALLEL_FOR_MINOR = ['major', 'dorian', 'harmonicMinor', 'phrygian', 'melodicMinor', 'mixolydian'];

/** Accords empruntés aux modes parallèles (même tonique), regroupés par mode d'origine. */
export function borrowedChords(key, level = 3) {
  const scale = getScale(key.scale);
  const sources = (isMinorScale(scale) ? PARALLEL_FOR_MINOR : PARALLEL_FOR_MAJOR).filter((id) => id !== key.scale);
  const seen = [];
  return sources.map((source) => {
    const chords = diatonicChords({ root: key.root, scale: source }, level)
      .filter((c) => !isDiatonic(c, key) && !seen.some((s) => sameChord(s, c)))
      .map(({ root, quality }) => ({ root, quality }));
    seen.push(...chords);
    return { source, name: getScale(source).name, chords };
  }).filter((g) => g.chords.length);
}

const resolvable = (c) => !['dim', 'dim7', 'm7b5', 'm9b5', 'aug'].includes(c.quality);

/** Dominantes secondaires (V7/x) et substitutions tritoniques (subV7/x) vers chaque degré. */
export function secondaryDominants(key, level = 3) {
  const quality = level >= 5 ? '9' : '7';
  return diatonicChords(key, 3)
    .filter((t) => t.degree !== 0 && resolvable(t))
    .map((t) => ({ root: pc(t.root + 7), quality, target: t, label: `V7/${romanNumeral({ root: t.root, quality: t.quality }, key)}` }))
    .filter((c) => !isDiatonic(c, key));
}

export function tritoneSubstitutions(key, level = 3) {
  const quality = level >= 5 ? '9' : '7';
  return diatonicChords(key, 3)
    .filter((t) => resolvable(t))
    .map((t) => ({ root: pc(t.root + 1), quality, target: t, label: `subV7/${romanNumeral({ root: t.root, quality: t.quality }, key)}` }));
}

const COLOR_QUALITIES = { maj: ['sus2', 'sus4', 'add9', '6', '69', 'maj7', 'maj9'], min: ['madd9', 'm6', 'm7', 'm9', 'm11', 'sus2', 'sus4'], dom: ['7sus4', '9', '13', '7b9', '7s9', '7b13'] };

/** Substitutions et variantes de couleur pour un accord donné. */
export function chordVariants(chord, key, level = 3) {
  const out = [];
  const push = (c, label) => {
    const item = { root: pc(c.root), quality: c.quality, bass: c.bass == null || pc(c.bass) === pc(c.root) ? null : pc(c.bass) };
    if (!sameChord(item, chord) && !out.some((o) => sameChord(o.chord, item))) out.push({ chord: item, label });
  };
  // Même accord, autre basse : en tête, c'est la variante la plus fréquente.
  if (chord.bass != null) push({ root: chord.root, quality: chord.quality }, 'Fondamentale à la basse');
  inversionsOf(chord).slice(0, 3).forEach((inv) => push({ ...chord, bass: inv.bass }, 'Renversement'));
  const scaleIv = getScale(key.scale).iv;
  [scaleIv[4], scaleIv[0]].filter((x) => x != null).forEach((x) => push({ ...chord, bass: pc(key.root + x) }, x === 0 ? 'Pédale de tonique' : 'Sur la dominante'));
  const family = isDominantQuality(chord.quality) ? 'dom' : isMinorQuality(chord.quality) ? 'min' : 'maj';
  (COLOR_QUALITIES[family] ?? []).forEach((q) => push({ root: chord.root, quality: q }, 'Couleur'));
  const pcs = new Set(chordPitchClasses(chord));
  diatonicChords(key, Math.max(level, 3))
    .filter((c) => chordPitchClasses(c).filter((p) => pcs.has(p)).length >= 2)
    .forEach((c) => push(c, 'Substitution diatonique'));
  if (isDominantQuality(chord.quality)) push({ root: chord.root + 6, quality: '7' }, 'Substitution tritonique');
  push({ root: chord.root, quality: isMinorQuality(chord.quality) ? 'maj' : 'min' }, 'Mode parallèle');
  const deg = degreeOf(chord, key);
  if (deg >= 0) {
    borrowedChords(key, level).forEach((g) => g.chords
      .filter((c) => pc(c.root) === pc(chord.root))
      .forEach((c) => push(c, `Emprunt (${g.name.toLowerCase()})`)));
  }
  return out.slice(0, 20);
}

// Probabilités d'enchaînement entre degrés (inspirées des statistiques de la pop et du jazz).
const MAJOR_TABLE = [
  [0, 0.12, 0.05, 0.3, 0.25, 0.22, 0.02],
  [0.1, 0, 0.1, 0.1, 0.5, 0.1, 0.1],
  [0.1, 0.1, 0, 0.3, 0.05, 0.45, 0],
  [0.3, 0.1, 0.05, 0, 0.35, 0.15, 0.05],
  [0.5, 0.05, 0.05, 0.15, 0, 0.25, 0],
  [0.1, 0.2, 0.1, 0.35, 0.25, 0, 0],
  [0.6, 0, 0.2, 0, 0, 0.2, 0],
];
const MINOR_TABLE = [
  [0, 0.1, 0.1, 0.25, 0.1, 0.25, 0.2],
  [0.2, 0, 0, 0, 0.6, 0, 0.2],
  [0.2, 0, 0, 0.25, 0, 0.35, 0.2],
  [0.3, 0.1, 0, 0, 0.25, 0.1, 0.25],
  [0.4, 0, 0.1, 0.2, 0, 0.3, 0],
  [0.15, 0, 0.2, 0.2, 0.1, 0, 0.35],
  [0.35, 0, 0.35, 0.1, 0, 0.2, 0],
];

export function transitionTable(key) {
  return isMinorScale(getScale(key.scale)) ? MINOR_TABLE : MAJOR_TABLE;
}

const DEFAULT_REASON = { T: 'Retour au repos', SD: 'Ouvre et éloigne', D: 'Crée de la tension', sec: 'Tension chromatique', borrow: 'Couleur empruntée' };

function namedMotion(prev, cand, key) {
  const a = pc(prev.root - key.root);
  const b = pc(cand.root - key.root);
  const fa = chordFunction(prev, key);
  if (fa === 'D' && b === 0) return 'Cadence parfaite';
  if (a === 5 && !isMinorQuality(prev.quality) && b === 0) return 'Cadence plagale';
  if (a === 5 && isMinorQuality(prev.quality) && b === 0) return 'Cadence plagale mineure';
  if (fa === 'D' && b === 9 && isMinorQuality(cand.quality)) return 'Cadence rompue';
  if (a === 2 && b === 7) return 'ii → V, le classique jazz';
  if (a === 5 && b === 5 && isMinorQuality(cand.quality)) return 'IV → iv, la touche mélancolique';
  if (a === 8 && b === 10) return '♭VI → ♭VII, montée épique';
  if (a === 10 && b === 0) return 'Cadence mixolydienne';
  if (isDominantQuality(prev.quality) && pc(cand.root - prev.root) === 5) return 'Résolution de la dominante';
  if (isDominantQuality(prev.quality) && pc(cand.root - prev.root) === 11) return 'Résolution tritonique';
  if (['dim', 'dim7'].includes(prev.quality) && pc(cand.root - prev.root) === 1) return 'Résolution du diminué';
  if (pc(cand.root - prev.root) === 5) return 'Cycle des quintes';
  return null;
}

function motionBonus(prev, cand, key) {
  const a = pc(prev.root - key.root);
  const b = pc(cand.root - key.root);
  const up = pc(cand.root - prev.root);
  let bonus = 0;
  if (isDominantQuality(prev.quality) && up === 5) bonus += 7;
  if (isDominantQuality(prev.quality) && up === 11 && a !== 7) bonus += 3;
  if (['dim', 'dim7'].includes(prev.quality) && up === 1) bonus += 5;
  if (a === 5 && b === 5 && isMinorQuality(cand.quality) && !isMinorQuality(prev.quality)) bonus += 4;
  if (a === 8 && b === 10) bonus += 4;
  if (a === 10 && b === 0) bonus += 4;
  if (a === 5 && isMinorQuality(prev.quality) && b === 0) bonus += 4;
  if (up === 5) bonus += 1.5;
  const shared = chordPitchClasses(prev).filter((p) => chordPitchClasses(cand).includes(p)).length;
  return bonus + shared * 0.4;
}

/** Propose les accords qui sonnent bien après `prev` (ou pour commencer si prev est nul). */
export function suggestNext(prev, key, level = 3, count = 8) {
  const diatonic = diatonicChords(key, level);
  const table = transitionTable(key);
  const heptatonic = isHeptatonic(getScale(key.scale));
  if (!prev) {
    const order = [0, 3, 5, 4, 1, 2, 6];
    return order.map((d, i) => diatonic.find((c) => c.degree === d))
      .filter(Boolean)
      .slice(0, count)
      .map((c, i) => ({ chord: { root: c.root, quality: c.quality }, strength: 1 - i * 0.12, reason: i === 0 ? 'Commencer sur la tonique' : DEFAULT_REASON[chordFunction(c, key)] }));
  }
  const prevDeg = isDiatonic(prev, key) && heptatonic ? degreeOf(prev, key) : -1;
  const pool = [
    ...diatonic.map((c) => ({ chord: { root: c.root, quality: c.quality }, base: prevDeg >= 0 ? table[prevDeg][c.degree] * 10 : 1.5 })),
    ...borrowedChords(key, level).slice(0, 2).flatMap((g) => g.chords.map((c) => ({ chord: c, base: 0.6 }))),
    ...secondaryDominants(key, level).map((c) => ({
      chord: { root: c.root, quality: c.quality },
      base: 0.4 + (prevDeg >= 0 && heptatonic ? table[prevDeg][c.target.degree] * 4 : 0.5),
    })),
    ...(heptatonic ? stepwiseCandidates(prev, key, level) : []),
  ];
  const scored = pool
    .filter((p) => !sameChord(p.chord, prev))
    .map((p) => ({ ...p, score: p.base + motionBonus(prev, p.chord, key) }))
    .sort((a, b) => b.score - a.score);
  const unique = scored.filter((p, i) => scored.findIndex((q) => sameChord(q.chord, p.chord)) === i).slice(0, count);
  const top = unique[0]?.score || 1;
  return unique.map((p) => ({
    chord: p.chord,
    strength: Math.max(0.08, p.score / top),
    reason: p.reason ?? namedMotion(prev, p.chord, key) ?? DEFAULT_REASON[chordFunction(p.chord, key)],
  }));
}

// --- Chiffrage romain → accord (pour la bibliothèque de progressions) ---

const ROMAN_RE = /^([b#♭♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)([^/]*)(?:\/([b#♭♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i))?$/;
const UPPER_SUFFIX = {
  '': 'maj', 7: '7', maj7: 'maj7', 9: '9', maj9: 'maj9', 13: '13', maj13: 'maj13', 6: '6', 69: '69', add9: 'add9',
  sus2: 'sus2', sus4: 'sus4', '7sus4': '7sus4', '9sus4': '9sus4', 11: '9sus4', '+': 'aug', '+maj7': 'maj7s5', '7b9': '7b9', '7#9': '7s9',
  '7#11': '7s11', '7b13': '7b13', 'maj7#11': 'maj7s11', 'maj9#11': 'maj9s11', 5: '5', '°': 'dim', '°7': 'dim7',
};
const LOWER_SUFFIX = {
  '': 'min', 7: 'm7', 9: 'm9', 11: 'm11', 13: 'm13', 6: 'm6', add9: 'madd9', maj7: 'mMaj7', maj9: 'mMaj9',
  '°': 'dim', o: 'dim', '°7': 'dim7', o7: 'dim7', ø: 'm7b5', ø7: 'm7b5', ø9: 'm9b5', '7b9': 'm7b9',
};
const accSemis = (a) => (a === 'b' || a === '♭' ? -1 : a === '#' || a === '♯' ? 1 : 0);
const numeralIndex = (n) => NUMERALS.indexOf(n.toUpperCase());

export function parseRoman(token) {
  const m = ROMAN_RE.exec(token.trim());
  if (!m) return null;
  const [, acc, numeral, suffix, bassAcc, bassNumeral] = m;
  const lower = numeral === numeral.toLowerCase();
  const quality = (lower ? LOWER_SUFFIX : UPPER_SUFFIX)[suffix];
  if (!quality) return null;
  const semis = pc(MAJOR_IV[numeralIndex(numeral)] + accSemis(acc));
  const bassSemis = bassNumeral ? pc(MAJOR_IV[numeralIndex(bassNumeral)] + accSemis(bassAcc)) : null;
  return { semis, quality, bassSemis };
}

export function romanToChord(token, keyRoot) {
  const parsed = parseRoman(token);
  if (!parsed) return null;
  return {
    root: pc(keyRoot + parsed.semis),
    quality: parsed.quality,
    bass: parsed.bassSemis == null ? null : pc(keyRoot + parsed.bassSemis),
  };
}
