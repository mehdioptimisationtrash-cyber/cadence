// Motifs de jeu des accords et de la basse (temps exprimés en temps / noires).

export const CHORD_PATTERNS = [
  { id: 'block', label: 'Plaqué' },
  { id: 'pulse', label: 'Pulsé' },
  { id: 'offbeat', label: 'Contretemps' },
  { id: 'stabs', label: 'Stabs' },
  { id: 'strum', label: 'Gratté' },
  { id: 'ballad', label: 'Ballade' },
  { id: 'arpUp', label: 'Arpège ↑' },
  { id: 'arpDown', label: 'Arpège ↓' },
  { id: 'arpUpDown', label: 'Arpège ↕' },
  { id: 'broken', label: 'Brisé' },
  { id: 'arp16', label: 'Arpège 16e' },
];

export const BASS_PATTERNS = [
  { id: 'off', label: 'Aucune' },
  { id: 'hold', label: 'Tenue' },
  { id: 'pump', label: 'Pompe' },
  { id: 'octaves', label: 'Octaves' },
  { id: 'rootFifth', label: 'Fond.–quinte' },
  { id: 'sync', label: 'Syncopée' },
  { id: 'walking', label: 'Walking' },
];

const ev = (midi, start, dur, vel) => ({ midi, start, dur, vel });

function repeatBars(beats, barPattern) {
  const out = [];
  for (let bar = 0; bar < beats; bar += 4) barPattern(bar).forEach((e) => out.push({ ...e, start: e.start + bar }));
  return out;
}

function clip(events, beats) {
  return events
    .filter((e) => e.start < beats - 0.01)
    .map((e) => ({ ...e, dur: Math.max(0.05, Math.min(e.dur, beats - e.start - 0.02)) }));
}

function sequence(seq, beats, step, vel = 0.62) {
  const out = [];
  for (let i = 0, t = 0; t < beats; i += 1, t += step) out.push(ev(seq[i % seq.length], t, step * 0.95, i % (1 / step) === 0 ? vel + 0.12 : vel));
  return out;
}

const PATTERNS = {
  block: (n, beats) => n.map((m) => ev(m, 0, beats, 0.66)),
  pulse: (n, beats) => repeatBars(beats, () => [0, 1, 2, 3].flatMap((b) => n.map((m) => ev(m, b, 0.85, b % 2 ? 0.52 : 0.66)))),
  offbeat: (n, beats) => repeatBars(beats, () => [0.5, 1.5, 2.5, 3.5].flatMap((b) => n.map((m) => ev(m, b, 0.32, 0.6)))),
  stabs: (n, beats) => repeatBars(beats, () => [[0, 0.45, 0.72], [1.5, 0.4, 0.6], [3, 0.8, 0.66]].flatMap(([b, d, v]) => n.map((m) => ev(m, b, d, v)))),
  strum: (n, beats) => repeatBars(beats, () => [[0, 1], [1, 1], [1.5, -1], [2.5, -1], [3, 1], [3.5, -1]].flatMap(([b, dir], i, all) => {
    const notes = dir > 0 ? n : [...n].reverse().slice(0, 3);
    const next = all[i + 1]?.[0] ?? 4;
    return notes.map((m, k) => ev(m, b + k * 0.03, next - b - 0.05, dir > 0 ? 0.64 : 0.5));
  })),
  ballad: (n, beats) => {
    const upper = n.slice(1).length ? n.slice(1) : n;
    const cycle = [...upper, ...upper.slice(1, -1).reverse()];
    const arp = [];
    for (let i = 0, t = 0.5; t < beats; i += 1, t += 0.5) arp.push(ev(cycle[i % cycle.length], t, 1.2, 0.5));
    return [ev(n[0], 0, beats, 0.66), ev(upper[0], 0, 1, 0.5), ...arp];
  },
  arpUp: (n, beats) => sequence(n, beats, 0.5),
  arpDown: (n, beats) => sequence([...n].reverse(), beats, 0.5),
  arpUpDown: (n, beats) => sequence(n.length > 2 ? [...n, ...n.slice(1, -1).reverse()] : n, beats, 0.5),
  broken: (n, beats) => {
    const hi = n.length - 1;
    const mid = Math.floor(n.length / 2);
    return sequence([n[0], n[hi], n[mid], n[hi]], beats, 0.5);
  },
  arp16: (n, beats) => {
    const up = [...n, ...n.map((m) => m + 12)];
    return sequence([...up, ...up.slice(1, -1).reverse()], beats, 0.25, 0.5);
  },
};

export function chordEvents(patternId, notes, beats) {
  if (!notes.length) return [];
  return clip((PATTERNS[patternId] ?? PATTERNS.block)(notes, beats), beats);
}

function fifthOf(root) {
  return root + 7 > 50 ? root - 5 : root + 7;
}

function walkingLine(root, chordPcs, nextRoot, beats) {
  const tones = chordPcs.map((p) => root + ((p - root) % 12 + 12) % 12).filter((m) => m !== root).sort((a, b) => a - b);
  const third = tones[0] ?? root + 4;
  const fifth = tones.find((m) => m - root === 7) ?? fifthOf(root);
  const target = nextRoot ?? root;
  const approach = target > root ? target - 1 : target + 1;
  const line = [];
  for (let b = 0; b < beats; b += 1) {
    const lastBeat = b === beats - 1;
    const choices = [root, third, fifth, root + 12];
    const pitch = b === 0 ? root : lastBeat ? approach : choices[b % choices.length];
    line.push(ev(pitch, b, 0.9, b === 0 ? 0.8 : 0.66));
  }
  return line;
}

const BASS = {
  hold: (r, beats) => [ev(r, 0, beats, 0.78)],
  pump: (r, beats) => {
    const out = [];
    for (let t = 0; t < beats; t += 0.5) out.push(ev(r, t, 0.42, t % 1 === 0 ? 0.78 : 0.62));
    return out;
  },
  octaves: (r, beats) => {
    const out = [];
    for (let i = 0, t = 0; t < beats; i += 1, t += 0.5) out.push(ev(i % 2 ? r + 12 : r, t, 0.42, i % 2 ? 0.6 : 0.78));
    return out;
  },
  rootFifth: (r, beats) => repeatBars(beats, () => [ev(r, 0, 1.9, 0.8), ev(fifthOf(r), 2, 1.9, 0.68)]),
  sync: (r, beats) => repeatBars(beats, () => [ev(r, 0, 1.3, 0.82), ev(r, 1.5, 0.9, 0.66), ev(r + 12, 2.5, 0.4, 0.6), ev(r, 3, 0.4, 0.7), ev(fifthOf(r), 3.5, 0.4, 0.6)]),
};

export function bassEvents(patternId, root, { chordPcs = [], nextRoot = null, beats = 4 } = {}) {
  if (patternId === 'off') return [];
  if (patternId === 'walking') return clip(walkingLine(root, chordPcs, nextRoot, beats), beats);
  return clip((BASS[patternId] ?? BASS.hold)(root, beats), beats);
}

/** Décale les croches (et doubles) en contretemps pour donner un groove « swing ». */
export function applySwing(start, swing) {
  if (!swing) return start;
  const frac = start % 1;
  if (Math.abs(frac - 0.5) < 0.01) return start + swing * 0.1667;
  if (Math.abs(frac - 0.25) < 0.01 || Math.abs(frac - 0.75) < 0.01) return start + swing * 0.0833;
  return start;
}
