// Bibliothèque de progressions célèbres + générateur intelligent par ambiance.
import { pc, makeRng } from '../theory/notes.js';
import { getScale, isHeptatonic, isMinorScale } from '../theory/scales.js';
import { isMinorQuality, isDominantQuality } from '../theory/chords.js';
import {
  diatonicChord, diatonicChords, transitionTable, borrowedChords, romanToChord,
} from '../theory/harmony.js';

const T = (name, genre, mode, prog, beats) => ({ id: `${genre}:${name}`, name, genre, mode, prog, beats });

// Chiffrage romain par rapport à la gamme MAJEURE de la tonique (♭VI = sixte mineure, etc.).
export const TEMPLATES = [
  T('L’axe pop', 'Pop', 'major', 'I V vi IV'),
  T('Sensible', 'Pop', 'major', 'vi IV I V'),
  T('Années 50', 'Pop', 'major', 'I vi IV V'),
  T('Optimiste', 'Pop', 'major', 'I IV vi V'),
  T('Refrain moderne', 'Pop', 'major', 'IV I V vi'),
  T('Canon de Pachelbel', 'Pop', 'major', 'I V vi iii IV I IV V'),
  T('Ballade triste', 'Émotion', 'minor', 'i bVI bIII bVII'),
  T('Larmes', 'Émotion', 'harmonicMinor', 'i iv bVI V'),
  T('Nostalgie', 'Émotion', 'major', 'I III IV iv'),
  T('Espoir', 'Émotion', 'major', 'IV V iii vi'),
  T('Douce-amère', 'Émotion', 'major', 'I IVmaj7 iv6 I'),
  T('ii–V–I', 'Jazz', 'major', 'ii7 V7 Imaj7 Imaj7'),
  T('Turnaround', 'Jazz', 'major', 'Imaj7 vi7 ii7 V7'),
  T('Rhythm changes', 'Jazz', 'major', 'Imaj7 VI7 ii7 V7'),
  T('ii–V–i mineur', 'Jazz', 'harmonicMinor', 'iiø7 V7b9 i7 i7'),
  T('Cycle des quintes', 'Jazz', 'major', 'ii7 V7 Imaj7 IVmaj7 viiø7 III7 vi7 vi7'),
  T('Backdoor', 'Jazz', 'major', 'iv7 bVII7 Imaj7 Imaj7'),
  T('Bossa', 'Jazz', 'major', 'Imaj7 II7 ii7 V7'),
  T('Neo-soul', 'Neo-soul & R&B', 'major', 'ii9 V13 Imaj9 vi9'),
  T('Soulful', 'Neo-soul & R&B', 'major', 'IVmaj9 III7 vi9 vi9'),
  T('Just the two of us', 'Neo-soul & R&B', 'major', 'IVmaj7 III7 vi7 v7 I7', [4, 4, 4, 2, 2]),
  T('R&B 90’s', 'Neo-soul & R&B', 'major', 'Imaj9 iii7 vi9 V9sus4'),
  T('Dorien groovy', 'Neo-soul & R&B', 'dorian', 'i9 IV9 i9 IV9'),
  T('Lo-fi café', 'Lo-fi', 'major', 'IVmaj7 iii7 ii7 Imaj7'),
  T('Lo-fi pluie', 'Lo-fi', 'major', 'ii9 V9 iii7 vi9'),
  T('Chemin royal', 'Lo-fi', 'major', 'IVmaj7 V7 iii7 vi7'),
  T('Nuit mineure', 'Lo-fi', 'minor', 'i9 iv9 bVIImaj7 bIIImaj7'),
  T('Épique', 'Cinéma', 'minor', 'i bVI bIII bVII'),
  T('Héroïque', 'Cinéma', 'major', 'bVI bVII I I'),
  T('Lydien rêveur', 'Cinéma', 'lydian', 'Imaj7 II Imaj7 II'),
  T('Mystère', 'Cinéma', 'minor', 'i bVI iv V'),
  T('Médiantes', 'Cinéma', 'major', 'I bVI I bIII'),
  T('Blues 12 mesures', 'Rock & Blues', 'mixolydian', 'I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7'),
  T('Rock mixolydien', 'Rock & Blues', 'mixolydian', 'I bVII IV I'),
  T('Rock classique', 'Rock & Blues', 'major', 'I IV V IV'),
  T('Grunge', 'Rock & Blues', 'minor', 'i bIII IV bVI'),
  T('EDM émotion', 'Électro', 'minor', 'bVI bVII i i'),
  T('Deep house', 'Électro', 'minor', 'i9 bVImaj9 bVII9sus4 i9'),
  T('Synthwave', 'Électro', 'minor', 'i bVI bVII i'),
  T('Trap sombre', 'Trap & Hip-hop', 'harmonicMinor', 'i iv bVI V'),
  T('Drill', 'Trap & Hip-hop', 'harmonicMinor', 'i bVI i V'),
  T('Boom bap', 'Trap & Hip-hop', 'dorian', 'i7 iv7 i7 V7'),
  T('Phrygien menaçant', 'Trap & Hip-hop', 'phrygian', 'i bII i bII'),
  T('Andalouse', 'Latin & monde', 'minor', 'i bVII bVI V'),
  T('Reggaeton', 'Latin & monde', 'minor', 'i bVI bIII bVII'),
  T('Montuno', 'Latin & monde', 'major', 'I IV V IV'),
  T('Oriental', 'Latin & monde', 'phrygianDominant', 'I bII I bII'),
  T('Gospel 1-4-5', 'Gospel', 'major', 'I IV/I I V'),
  T('Gospel chromatique', 'Gospel', 'major', 'Imaj7 I7 IVmaj7 #iv°7 I/V VI7 ii7 V7'),
  T('Cadence parfaite', 'Classique', 'major', 'I IV V I'),
  T('Marche harmonique', 'Classique', 'major', 'I IV vii° iii vi ii V I'),
  T('Tierce picarde', 'Classique', 'harmonicMinor', 'i iv V I'),
];

export const GENRES = [...new Set(TEMPLATES.map((t) => t.genre))];

export function templateChords(template, keyRoot) {
  const tokens = template.prog.split(/\s+/);
  return tokens.map((tok, i) => {
    const chord = romanToChord(tok, keyRoot);
    return chord ? { ...chord, beats: template.beats?.[i] ?? 4 } : null;
  }).filter(Boolean);
}

// --- Générateur par ambiance ---

export const MOODS = [
  { id: 'joyeux', label: 'Joyeux', glyph: '☀', scale: 'major', start: [0], boost: { 3: 1.3, 4: 1.2 }, borrow: 0.15, secondary: 0.25, tritone: 0, color: null },
  { id: 'melancolique', label: 'Mélancolique', glyph: '☂', scale: 'minor', start: [0, 5], boost: { 5: 1.6, 2: 1.3, 3: 1.2 }, borrow: 0.45, secondary: 0.1, tritone: 0, color: 'soft' },
  { id: 'reveur', label: 'Rêveur', glyph: '☾', scale: 'lydian', start: [0, 3], boost: { 3: 1.4, 1: 1.3, 2: 1.2 }, borrow: 0.2, secondary: 0.1, tritone: 0, color: 'dreamy', minLevel: 4 },
  { id: 'epique', label: 'Épique', glyph: '⚔', scale: 'minor', start: [0], boost: { 5: 1.7, 6: 1.6, 2: 1.4 }, borrow: 0.3, secondary: 0.05, tritone: 0, color: 'power' },
  { id: 'sombre', label: 'Sombre', glyph: '☠', scale: 'phrygian', start: [0], boost: { 1: 1.8, 5: 1.5, 3: 1.3 }, borrow: 0.35, secondary: 0.1, tritone: 0.1, color: null },
  { id: 'jazzy', label: 'Jazzy', glyph: '♪', scale: 'major', start: [0, 1, 5], boost: { 1: 1.6, 4: 1.5, 5: 1.2 }, borrow: 0.3, secondary: 0.55, tritone: 0.35, color: 'jazz', minLevel: 4, iiV: true },
  { id: 'soul', label: 'Neo-soul', glyph: '❦', scale: 'dorian', start: [0, 3, 1], boost: { 3: 1.5, 1: 1.4, 2: 1.3 }, borrow: 0.35, secondary: 0.35, tritone: 0.15, color: 'lush', minLevel: 5 },
  { id: 'tendu', label: 'Tendu', glyph: '⚡', scale: 'harmonicMinor', start: [0], boost: { 4: 1.6, 6: 1.5, 1: 1.3 }, borrow: 0.2, secondary: 0.3, tritone: 0.1, color: 'tense' },
];

export const getMood = (id) => MOODS.find((m) => m.id === id) ?? MOODS[0];

const COLORS = {
  soft: { maj: ['maj', 'add9', 'maj7'], min: ['min', 'm7', 'madd9'] },
  dreamy: { maj: ['maj7', 'maj9', 'add9', '69'], min: ['m7', 'm9'], '7': ['9', '7sus4'] },
  power: { maj: ['maj', 'maj', 'sus2', '5'], min: ['min', 'min', 'sus2'] },
  jazz: { maj: ['maj7', '6', 'maj9'], min: ['m7', 'm9'], '7': ['7', '9', '13', '7b9'] },
  lush: { maj: ['maj9', 'maj7', '69'], min: ['m9', 'm11', 'm7'], '7': ['9', '13', '7s9'], maj7: ['maj9'], m7: ['m9', 'm11'] },
  tense: { '7': ['7b9', '7'], dim: ['dim7'] },
};

function colorize(chord, mood, level, rng) {
  const table = COLORS[mood.color];
  if (!table) return chord;
  const fam = isDominantQuality(chord.quality) ? '7' : chord.quality === 'dim' || chord.quality === 'dim7' ? 'dim' : isMinorQuality(chord.quality) ? 'min' : 'maj';
  const options = table[chord.quality] ?? table[fam];
  if (!options || (level < 4 && mood.color !== 'power' && mood.color !== 'soft' && rng.chance(0.4))) return chord;
  return { ...chord, quality: rng.pick(options) };
}

function walkDegrees(key, mood, length, startOnTonic, rng) {
  const table = transitionTable(key);
  const first = startOnTonic ? 0 : rng.pick(mood.start);
  const degrees = [first];
  for (let i = 1; i < length; i += 1) {
    const prev = degrees[i - 1];
    const isLast = i === length - 1;
    const entries = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== prev).map((d) => {
      let w = table[prev][d] * (mood.boost[d] ?? 1);
      if (degrees[i - 2] === d) w *= 0.25;
      if (d === first && !isLast) w *= 0.45;
      if (isLast) w *= table[d][first] + 0.05;
      if (isLast && d === first && length > 2) w = 0;
      return [d, w + 0.01];
    });
    degrees.push(rng.weighted(entries));
  }
  return degrees;
}

const resolvesTo = (target) => !['dim', 'dim7', 'm7b5', 'aug'].includes(target.quality);

function decorate(chords, key, mood, level, audace, rng) {
  const harsh = (c) => ['dim', 'dim7', 'aug', 'm7b5', 'm9b5', 'maj7s5'].includes(c.quality) && mood.id !== 'tendu';
  const borrowed = borrowedChords(key, level).slice(0, 2).flatMap((g) => g.chords)
    .filter((c) => pc(c.root) !== pc(key.root) && !harsh(c));
  let out = chords.map((c, i) => {
    if (i === 0 || !rng.chance(audace * mood.borrow)) return c;
    const same = borrowed.filter((b) => pc(b.root) === pc(c.root));
    const pool = same.length ? same : borrowed.slice(0, 4);
    return pool.length ? { ...rng.pick(pool), beats: c.beats } : c;
  });
  out = out.map((c, i) => {
    const target = out[i + 1] ?? out[0];
    if (i === 0 || !target || !resolvesTo(target) || !rng.chance(audace * mood.secondary)) return c;
    if (pc(target.root - key.root) === 0 && rng.chance(0.5)) return c;
    return { root: pc(target.root + 7), quality: level >= 5 ? '9' : '7', beats: c.beats };
  });
  out = out.map((c, i) => {
    const target = out[i + 1] ?? out[0];
    if (!isDominantQuality(c.quality) || pc(target.root - c.root) !== 5 || !rng.chance(audace * mood.tritone)) return c;
    return { root: pc(c.root + 6), quality: '7', beats: c.beats };
  });
  if (mood.iiV) {
    out = out.flatMap((c) => {
      if (!isDominantQuality(c.quality) || c.beats < 4 || !rng.chance(0.35 + audace * 0.5)) return [c];
      const half = c.beats / 2;
      return [{ root: pc(c.root + 7), quality: 'm7', beats: half }, { ...c, beats: half }];
    });
  }
  return out;
}

/**
 * Génère une progression.
 * @returns {{ chords: Array<{root:number, quality:string, bass:null, beats:number}>, scale: string }}
 */
export function generateProgression({
  key, level = 3, moodId = 'joyeux', length = 4, beatsPerChord = 4, audace = 0.4, startOnTonic = true, adaptScale = false, seed,
}) {
  const rng = makeRng(seed);
  const mood = getMood(moodId);
  const scaleId = adaptScale ? mood.scale : key.scale;
  const k = { root: key.root, scale: scaleId };
  const lvl = Math.max(level, mood.minLevel ?? 3);
  let base;
  if (isHeptatonic(getScale(scaleId))) {
    base = walkDegrees(k, mood, length, startOnTonic, rng).map((d) => ({ ...diatonicChord(k, d, lvl), beats: beatsPerChord }));
  } else {
    const pool = diatonicChords(k, lvl);
    base = Array.from({ length }, (_, i) => (i === 0 && startOnTonic ? pool[0] : rng.pick(pool)))
      .map((c) => ({ ...c, beats: beatsPerChord }));
  }
  const decorated = decorate(base, k, mood, lvl, audace, rng).map((c) => colorize(c, mood, lvl, rng));
  return {
    scale: scaleId,
    chords: decorated.map((c) => ({ root: c.root, quality: c.quality, bass: null, beats: c.beats })),
  };
}

export const moodFitsScale = (mood, scaleId) => isMinorScale(getScale(mood.scale)) === isMinorScale(getScale(scaleId));
