// Accords sur une autre basse que la fondamentale : renversements, couleurs de basse, pédales,
// et lignes de basse conjointes (qui avancent pas à pas).
import { pc } from './notes.js';
import { getScale, isMinorScale } from './scales.js';
import { getQuality } from './chords.js';
import { diatonicChords, romanToChord, degreeOf, isDiatonic, transitionTable } from './harmony.js';

const INTERVAL_NAMES = { 3: 'tierce', 4: 'tierce', 6: 'quinte ♭', 7: 'quinte', 8: 'quinte ♯', 10: 'septième', 11: 'septième', 9: 'sixte', 2: 'neuvième', 5: 'quarte' };

/** Notes de l'accord utilisables à la basse (hors fondamentale), dans l'ordre tierce, quinte, septième… */
export function inversionsOf(chord) {
  const iv = getQuality(chord.quality).iv.map((x) => pc(x)).filter((x) => x !== 0);
  return [...new Set(iv)].map((x) => ({
    bass: pc(chord.root + x),
    interval: x,
    label: `${INTERVAL_NAMES[x] ?? 'note'} à la basse`,
  }));
}

const withBass = (c, bass) => ({ root: c.root, quality: c.quality, bass: pc(bass) === pc(c.root) ? null : pc(bass) });

// Couleurs de basse célèbres, en chiffrage romain (basse après la barre).
const MAJOR_COLORS = [
  ['IV/V', 'Dominante suspendue', 'gospel, soul, pop'],
  ['ii7/V', '9sus4 tout doux', 'neo-soul, R&B'],
  ['I/V', 'Quarte et sixte de cadence', 'appelle le V'],
  ['V/IV', 'Couleur lydienne', 'cinéma, rêveur'],
  ['IV/I', 'Pédale plagale', 'gospel, hymne'],
  ['V/I', 'Pédale de tonique', 'tension sur la basse'],
  ['bVII/I', 'Pédale mixolydienne', 'rock, épique'],
  ['I/II', 'Accord suspendu (add9)', 'pop moderne'],
  ['vi/IV', 'Fmaj7 déguisé', 'lo-fi'],
  ['iii/I', 'Imaj7 déguisé', 'doux'],
];
const MINOR_COLORS = [
  ['i/bVII', 'Basse descendante', 'ballade, lament'],
  ['i/bVI', 'Basse qui chute', 'mélancolie'],
  ['V/i', 'Pédale de tonique', 'tension sombre'],
  ['iv/i', 'Pédale plagale mineure', 'hymne sombre'],
  ['bVII/i', 'Pédale éolienne', 'épique'],
  ['bVI/i', 'Couleur cinématographique', 'cinéma'],
  ['iv/V', 'Dominante suspendue mineure', 'soul sombre'],
  ['i/V', 'Quarte et sixte mineure', 'appelle le V'],
];

/** Groupes d'accords « slash » proposés dans la palette. */
export function slashGroups(key, level = 3) {
  const minor = isMinorScale(getScale(key.scale));
  const diatonic = diatonicChords(key, level);
  const tonic = diatonic.find((c) => c.degree === 0);
  const inversions = [
    ...diatonic.map((c) => ({ ...withBass(c, inversionsOf(c)[0]?.bass ?? c.root), label: 'tierce à la basse' })),
    ...diatonic.filter((c) => [0, 3, 4].includes(c.degree))
      .map((c) => ({ ...withBass(c, inversionsOf(c)[1]?.bass ?? c.root), label: 'quinte à la basse' })),
  ].filter((c) => c.bass != null);
  const colors = (minor ? MINOR_COLORS : MAJOR_COLORS).map(([token, name, hint]) => {
    const c = romanToChord(token, key.root);
    return c && c.bass != null ? { ...c, label: name, hint, token } : null;
  }).filter(Boolean);
  const pedal = tonic ? diatonic.filter((c) => c.degree !== 0).map((c) => ({ ...withBass(c, key.root), label: 'sur la tonique' })) : [];
  return [
    { id: 'colors', title: 'Couleurs de basse', hint: 'les sons « slash » qu’on entend partout', chords: colors },
    { id: 'inversions', title: 'Renversements', hint: 'même accord, basse plus douce', chords: inversions },
    { id: 'pedal', title: 'Pédale de tonique', hint: 'tous les accords sur la même basse', chords: pedal.filter((c) => c.bass != null) },
  ].filter((g) => g.chords.length);
}

const bassPc = (c) => pc(c.bass ?? c.root);
// Mouvement de basse le plus court (un bassiste descend ou monte au plus près).
const signedStep = (a, b) => {
  const d = pc(bassPc(b) - bassPc(a));
  return d > 6 ? d - 12 : d;
};
const bassLeap = (a, b) => Math.abs(signedStep(a, b));

/** Accords dont la basse avance d'un ou deux demi-tons depuis `prev` (lignes de basse conjointes). */
export function stepwiseCandidates(prev, key, level = 3) {
  const table = transitionTable(key);
  const prevDeg = isDiatonic({ ...prev, bass: null }, key) ? degreeOf(prev, key) : -1;
  return diatonicChords(key, level).flatMap((c) => inversionsOf(c).slice(0, 2).map((inv) => ({ ...withBass(c, inv.bass), degree: c.degree })))
    .filter((c) => c.bass != null)
    .map((c) => {
      const signed = signedStep(prev, c);
      const leap = Math.abs(signed);
      if (leap < 1 || leap > 2) return null;
      const base = prevDeg >= 0 && table[prevDeg] ? table[prevDeg][c.degree] * 6 : 1;
      return {
        chord: { root: c.root, quality: c.quality, bass: c.bass },
        base: base + 3 - leap * 0.4,
        reason: signed < 0 ? 'Basse descendante, pas à pas' : 'Basse montante, pas à pas',
      };
    })
    .filter(Boolean);
}

/**
 * Choisit des renversements pour que la basse bouge le moins possible.
 * amount 0 = toujours la fondamentale, 1 = basse la plus conjointe possible.
 * Le premier et le dernier accord gardent leur fondamentale (repère tonal).
 */
export function smoothBassLine(chords, amount = 0.6) {
  if (chords.length < 3 || amount <= 0) return chords;
  const options = chords.map((c, i) => {
    const keepRoot = i === 0 || i === chords.length - 1 || c.bass != null;
    const own = { ...c, bass: c.bass ?? null, cost: 0 };
    if (keepRoot) return [own];
    return [own, ...inversionsOf(c).slice(0, 2).map((inv, k) => ({ ...c, bass: inv.bass, cost: (k === 0 ? 2.2 : 4.5) / amount }))];
  });
  // Programmation dynamique : coût = sauts de basse + préférence pour la fondamentale.
  let best = options[0].map((o) => ({ cost: o.cost, path: [o] }));
  for (let i = 1; i < options.length; i += 1) {
    best = options[i].map((o) => best
      .map((b) => ({ cost: b.cost + o.cost + bassLeap(b.path[b.path.length - 1], o), path: [...b.path, o] }))
      .reduce((x, y) => (y.cost < x.cost ? y : x)));
  }
  const winner = best.reduce((x, y) => (y.cost < x.cost ? y : x));
  return winner.path.map(({ cost, ...c }) => c);
}

export const isSlash = (c) => c.bass != null && pc(c.bass) !== pc(c.root);
