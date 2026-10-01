// Générateur de mélodie : rythme motivique + notes de l'accord sur les temps forts,
// notes de passage sur les temps faibles, arc mélodique et cadence en fin de phrase.
import { pc, makeRng } from '../theory/notes.js';
import { getScale, isHeptatonic, isMinorScale } from '../theory/scales.js';
import { chordPitchClasses } from '../theory/chords.js';

export const MELODY_STYLES = [
  { id: 'chant', label: 'Chantée', hint: 'lyrique, par degrés' },
  { id: 'motif', label: 'Motif', hint: 'une idée qui revient' },
  { id: 'hook', label: 'Hook', hint: 'court et entêtant' },
  { id: 'penta', label: 'Pentatonique', hint: 'accrocheuse, sûre' },
  { id: 'arpege', label: 'Arpégée', hint: 'épouse les accords' },
];

export const REGISTERS = [
  { id: 'low', label: 'Grave', range: [55, 74] },
  { id: 'mid', label: 'Médium', range: [60, 81] },
  { id: 'high', label: 'Aigu', range: [67, 88] },
];

const STRENGTH_8 = [1, 0.3, 0.65, 0.3, 0.9, 0.3, 0.65, 0.3];
const STRENGTH_16 = [1, 0.15, 0.4, 0.15, 0.65, 0.15, 0.4, 0.15, 0.9, 0.15, 0.4, 0.15, 0.65, 0.15, 0.4, 0.15];

function pitchPool(key, style, range) {
  const scale = getScale(key.scale);
  let iv = scale.iv;
  if ((style === 'penta' || style === 'hook') && isHeptatonic(scale)) {
    const pick = isMinorScale(scale) ? [0, 2, 3, 4, 6] : [0, 1, 2, 4, 5];
    iv = pick.map((i) => scale.iv[i]);
  }
  const pcs = new Set(iv.map((x) => pc(key.root + x)));
  const out = [];
  for (let m = range[0]; m <= range[1]; m += 1) if (pcs.has(pc(m))) out.push(m);
  return out;
}

function rhythmCell(rng, { slots, density, syncopation, hook }) {
  const strength = slots === 16 ? STRENGTH_16 : STRENGTH_8;
  const onsets = [];
  strength.forEach((s, i) => {
    const weight = i === 0 && syncopation < 0.6 ? 1 : s * (1 - syncopation) + (1 - s) * syncopation * 0.9 + 0.08;
    if (rng.chance(Math.min(0.95, Math.max(0.04, density * weight * (hook ? 1.15 : 1))))) onsets.push(i);
  });
  while (onsets.length < 2) {
    const extra = [0, 4, 2, 6].find((i) => !onsets.includes(i * (slots / 8)));
    onsets.push((extra ?? 0) * (slots / 8));
  }
  const sorted = [...new Set(onsets)].sort((a, b) => a - b);
  return sorted.map((slot, i) => {
    const next = sorted[i + 1] ?? slots;
    const rest = rng.chance(hook ? 0.3 : 0.15) && next - slot > 1;
    return { slot, len: rest ? Math.max(1, Math.floor((next - slot) / 2)) : next - slot, strong: strength[slot] >= 0.6 };
  });
}

function chordAt(chords, t) {
  return chords.find((c) => t >= c.start && t < c.start + c.beats) ?? chords[chords.length - 1];
}

const nearestIndex = (pool, midi) => pool.reduce((best, m, i) => (Math.abs(m - midi) < Math.abs(pool[best] - midi) ? i : best), 0);

function chordToneNear(pool, chordPcs, target, prev, rng) {
  const tones = pool.filter((m) => chordPcs.includes(pc(m)));
  const all = tones.length ? tones : pool;
  const scored = all.map((m) => ({ m, cost: Math.abs(m - target) * 0.6 + Math.abs(m - prev) * 0.8 + (m === prev ? 1.5 : 0) + rng.next() * 1.5 }));
  return scored.reduce((a, b) => (b.cost < a.cost ? b : a)).m;
}

function stepFrom(pool, prev, target, rng) {
  const i = nearestIndex(pool, prev);
  const dir = target > prev ? 1 : target < prev ? -1 : rng.chance(0.5) ? 1 : -1;
  const size = rng.chance(0.75) ? 1 : 2;
  const j = Math.max(0, Math.min(pool.length - 1, i + dir * size));
  return pool[j];
}

/**
 * @param {{ chords: Array<{root:number, quality:string, beats:number}>, key: {root:number, scale:string},
 *   params?: {style?:string, density?:number, register?:string, syncopation?:number, repetition?:number}, seed?: number }} input
 * @returns {Array<{midi:number, start:number, dur:number, vel:number}>}
 */
export function generateMelody({ chords, key, params = {}, seed }) {
  if (!chords.length) return [];
  const {
    style = 'chant', density = 0.55, register = 'mid', syncopation = 0.25, repetition = 0.6,
  } = params;
  const rng = makeRng(seed);
  const range = (REGISTERS.find((r) => r.id === register) ?? REGISTERS[1]).range;
  const pool = pitchPool(key, style, range);
  let t0 = 0;
  const timeline = chords.map((c) => {
    const item = { ...c, start: t0, pcs: chordPitchClasses(c) };
    t0 += c.beats;
    return item;
  });
  const total = t0;
  const bars = Math.ceil(total / 4);
  const hook = style === 'hook';
  const slots = density > 0.72 && style !== 'arpege' ? 16 : 8;
  const cellOpts = { slots, density, syncopation, hook };
  const rep = style === 'motif' || hook ? Math.max(repetition, 0.8) : repetition;
  const cellA = rhythmCell(rng, cellOpts);
  const cellB = rhythmCell(rng, cellOpts);
  const center = (range[0] + range[1]) / 2;
  const notes = [];
  let prev = pool[nearestIndex(pool, center - 2)];
  let motif = null;
  let arpDir = 1;

  for (let bar = 0; bar < bars; bar += 1) {
    const phrasePos = bar % 4;
    const lastOfPhrase = phrasePos === 3 || bar === bars - 1;
    let cell = phrasePos === 2 && !rng.chance(rep) ? cellB : rng.chance(rep) ? cellA : rhythmCell(rng, cellOpts);
    if (hook) cell = cellA.filter((n) => n.slot < slots / 2).flatMap((n) => [n, { ...n, slot: n.slot + slots / 2 }]);
    if (lastOfPhrase) {
      const kept = cell.filter((n) => n.slot < slots / 2);
      const base = kept.length ? kept : cell.slice(0, 1);
      const last = base[base.length - 1];
      cell = [...base.slice(0, -1), { ...last, len: slots - last.slot, strong: true }];
    }
    const reuse = motif && cell === cellA && rng.chance(rep);
    const startIdx = notes.length;
    cell.forEach((n, idx) => {
      const start = bar * 4 + (n.slot * 4) / slots;
      if (start >= total) return;
      const dur = Math.min((n.len * 4) / slots, total - start) * 0.94;
      const chord = chordAt(timeline, start);
      const arc = Math.sin(Math.PI * ((bar % 2) * 4 + (n.slot * 4) / slots) / 8);
      const target = center - 3 + arc * (range[1] - range[0]) * 0.3;
      let midi;
      const finalNote = lastOfPhrase && idx === cell.length - 1;
      if (finalNote) {
        const goal = bar === bars - 1 ? [pc(key.root)] : [chord.pcs[0], chord.pcs[1]];
        midi = chordToneNear(pool, goal, prev, prev, rng);
      } else if (reuse && motif[idx] != null) {
        const anchor = chordToneNear(pool, chord.pcs, motif.first, prev, rng);
        midi = pool[Math.max(0, Math.min(pool.length - 1, nearestIndex(pool, anchor) + motif[idx]))];
        if (n.strong && !chord.pcs.includes(pc(midi))) midi = chordToneNear(pool, chord.pcs, midi, midi, rng);
      } else if (style === 'arpege') {
        const tones = pool.filter((m) => chord.pcs.includes(pc(m)));
        const i = nearestIndex(tones, prev);
        if (i + arpDir < 0 || i + arpDir >= tones.length) arpDir = -arpDir;
        midi = tones[Math.max(0, Math.min(tones.length - 1, i + arpDir))] ?? prev;
        if (rng.chance(0.15)) arpDir = -arpDir;
      } else if (n.strong) {
        midi = chordToneNear(pool, chord.pcs, target, prev, rng);
      } else {
        midi = hook && rng.chance(0.3) ? prev : stepFrom(pool, prev, target, rng);
      }
      const last2 = notes.slice(-2).map((x) => x.midi);
      if (last2.length === 2 && Math.abs(last2[1] - last2[0]) > 5 && Math.sign(midi - last2[1]) === Math.sign(last2[1] - last2[0])) {
        midi = stepFrom(pool, last2[1], last2[0], rng);
      }
      notes.push({ midi, start, dur, vel: n.strong ? 0.82 : 0.66 + rng.next() * 0.06 });
      prev = midi;
    });
    if (!motif && cell === cellA) {
      const made = notes.slice(startIdx);
      if (made.length) {
        const firstIdx = nearestIndex(pool, made[0].midi);
        motif = made.map((x) => nearestIndex(pool, x.midi) - firstIdx);
        motif.first = made[0].midi;
      }
    }
  }
  return notes;
}

/** Nouvelle série de hauteurs sur le même rythme. */
export function revoiceMelody(notes, { chords, key, params = {}, seed }) {
  const fresh = generateMelody({ chords, key, params: { ...params, density: 1, syncopation: 0 }, seed });
  if (!fresh.length) return notes;
  return notes.map((n) => {
    const near = fresh.reduce((a, b) => (Math.abs(b.start - n.start) < Math.abs(a.start - n.start) ? b : a));
    return { ...n, midi: near.midi };
  });
}
