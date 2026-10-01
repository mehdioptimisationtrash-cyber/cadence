// Actions : fonctions pures état → nouvel état.
import { pc } from './theory/notes.js';
import { getScale } from './theory/scales.js';
import { qualityLevel } from './theory/chords.js';
import { diatonicChord, isDiatonic, degreeOf } from './theory/harmony.js';
import { newId } from './state.js';
import { patternBassNotes } from './gen/arrange.js';
import { adaptMelody, adaptBass } from './gen/adapt.js';

// Toute modification de la progression recale la mélodie et la basse écrites sur les nouveaux accords.
const withChords = (state, chords) => ({
  ...state,
  chords,
  melody: {
    ...state.melody,
    notes: adaptMelody(state.melody.notes, state.chords, chords, state.key),
    stale: state.melody.notes.length > 0,
  },
  bassLine: {
    ...state.bassLine,
    notes: state.bassLine?.custom ? adaptBass(state.bassLine.notes, state.chords, chords) : state.bassLine.notes,
    stale: Boolean(state.bassLine?.custom),
  },
});

/** Passe la basse en mode « à la main » en partant de ce que joue le motif actuel. */
export function freezeBass(state) {
  if (state.bassLine?.custom) return state;
  return { ...state, bassLine: { custom: true, stale: false, notes: patternBassNotes(state) } };
}

/** Rend la main au motif automatique (les notes faites à la main sont abandonnées). */
export function releaseBass(state, bassPattern = state.arrangement.bassPattern) {
  return {
    ...state,
    arrangement: { ...state.arrangement, bassPattern },
    bassLine: { custom: false, stale: false, notes: [] },
  };
}

export const trackNotes = (state, track) => (track === 'bass' ? state.bassLine.notes : state.melody.notes);

export function setTrackNotes(state, track, notes) {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  return track === 'bass'
    ? { ...state, bassLine: { ...state.bassLine, custom: true, notes: sorted } }
    : { ...state, melody: { ...state.melody, enabled: true, notes: sorted } };
}

export function makeChord({ root, quality, bass = null, beats = 4, inversion = null, octave = 0, rest = false }) {
  if (rest) return { id: newId(), rest: true, beats };
  return { id: newId(), root: pc(root), quality, bass: bass == null ? null : pc(bass), beats, inversion, octave };
}

export function addChord(state, chord, index = null, { select = false } = {}) {
  const item = makeChord({ beats: state.generator.beatsPerChord, ...chord });
  const at = index == null ? state.chords.length : index;
  const chords = [...state.chords.slice(0, at), item, ...state.chords.slice(at)];
  return { ...withChords(state, chords), selected: select ? item.id : state.selected };
}

/** Position d'insertion choisie avec un « + » entre deux cartes (sinon : à la fin). */
export const insertionIndex = (state) => (state.ui?.insertAt == null ? null : Math.min(state.ui.insertAt, state.chords.length));

/** Ajoute à la position d'insertion en cours puis avance le curseur (pour enchaîner plusieurs ajouts). */
export function insertChord(state, chord) {
  const at = insertionIndex(state);
  const next = addChord(state, chord, at);
  return at == null ? next : { ...next, ui: { ...next.ui, insertAt: at + 1 } };
}

export function updateChord(state, id, patch) {
  return withChords(state, state.chords.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export function removeChord(state, id) {
  const idx = state.chords.findIndex((c) => c.id === id);
  const chords = state.chords.filter((c) => c.id !== id);
  const neighbour = chords[Math.min(idx, chords.length - 1)];
  return { ...withChords(state, chords), selected: state.selected === id ? neighbour?.id ?? null : state.selected };
}

export function duplicateChord(state, id) {
  const idx = state.chords.findIndex((c) => c.id === id);
  if (idx < 0) return state;
  const copy = { ...state.chords[idx], id: newId() };
  return { ...withChords(state, [...state.chords.slice(0, idx + 1), copy, ...state.chords.slice(idx + 1)]), selected: copy.id };
}

export function moveChord(state, from, to) {
  if (from === to || from < 0 || to < 0 || from >= state.chords.length || to >= state.chords.length) return state;
  const list = state.chords.filter((_, i) => i !== from);
  return withChords(state, [...list.slice(0, to), state.chords[from], ...list.slice(to)]);
}

export function replaceProgression(state, chords, scale = state.key.scale) {
  const items = chords.map((c) => makeChord(c));
  // Nouvelle progression complète : la basse écrite pour l'ancienne n'a plus de sens, on revient au motif.
  const next = withChords({ ...state, key: { ...state.key, scale } }, items);
  return { ...next, selected: null, bassLine: { custom: false, stale: false, notes: [] } };
}

export function clearProgression(state) {
  return {
    ...state, chords: [], selected: null, melody: { ...state.melody, notes: [], stale: false }, bassLine: { custom: false, stale: false, notes: [] },
  };
}

const shiftNote = (n, semis) => ({ ...n, midi: n.midi + semis });

// Écart de transposition le plus court (−6…+5 demi-tons).
const shortest = (from, to) => {
  const d = pc(to - from);
  return d > 5 ? d - 12 : d;
};

export function transpose(state, semis) {
  return {
    ...state,
    key: { ...state.key, root: pc(state.key.root + semis) },
    chords: state.chords.map((c) => (c.rest ? c : { ...c, root: pc(c.root + semis), bass: c.bass == null ? null : pc(c.bass + semis) })),
    melody: { ...state.melody, notes: state.melody.notes.map((n) => shiftNote(n, semis)) },
    bassLine: { ...state.bassLine, notes: state.bassLine.notes.map((n) => shiftNote(n, semis)) },
  };
}

function mapPitchToMode(p, oldKey, newKey) {
  const oldIv = getScale(oldKey.scale).iv;
  const newIv = getScale(newKey.scale).iv;
  const rel = pc(p - oldKey.root);
  const idx = oldIv.indexOf(rel);
  return idx >= 0 && oldIv.length === newIv.length ? p - rel + newIv[idx] : p;
}

/**
 * Change de tonalité. transposeAll : déplace accords et mélodie avec la tonique.
 * adaptMode : quand le mode change, chaque accord de la gamme devient celui du même degré dans le nouveau mode.
 */
export function setKey(state, { root = state.key.root, scale = state.key.scale }, { transposeAll = true, adaptMode = true } = {}) {
  let next = state;
  if (transposeAll && root !== state.key.root) next = transpose(next, shortest(state.key.root, root));
  next = { ...next, key: { root, scale: next.key.scale } };
  if (scale === next.key.scale) return next;
  const oldKey = next.key;
  const newKey = { root, scale };
  if (!adaptMode) return { ...next, key: newKey };
  const sameSize = getScale(oldKey.scale).iv.length === getScale(scale).iv.length;
  const chords = next.chords.map((c) => {
    const deg = degreeOf(c, oldKey);
    if (!sameSize || deg < 0 || !isDiatonic(c, oldKey)) return c;
    const mapped = diatonicChord(newKey, deg, qualityLevel(c.quality));
    if (!mapped) return c;
    const bass = c.bass == null ? null : pc(mapPitchToMode(c.bass, oldKey, newKey));
    return { ...c, root: mapped.root, quality: mapped.quality, bass };
  });
  const notes = next.melody.notes.map((n) => ({ ...n, midi: mapPitchToMode(n.midi, oldKey, newKey) }));
  const bass = next.bassLine.notes.map((n) => ({ ...n, midi: mapPitchToMode(n.midi, oldKey, newKey) }));
  return { ...next, key: newKey, chords, melody: { ...next.melody, notes }, bassLine: { ...next.bassLine, notes: bass } };
}
