// État de l'application : magasin immuable avec annuler/rétablir, sauvegarde locale et liens de partage.
import { getScale } from './theory/scales.js';
import { QUALITIES } from './theory/chords.js';
import { CHORD_PATTERNS, BASS_PATTERNS } from './gen/patterns.js';
import { VOICINGS } from './theory/voicing.js';
import { INSTRUMENTS } from './audio/synth.js';
import { MELODY_STYLES, REGISTERS } from './gen/melody.js';
import { MOODS } from './gen/progressions.js';

const SESSION_KEY = 'cadence.session';
const LIBRARY_KEY = 'cadence.library';
const HISTORY_LIMIT = 120;

let counter = 0;
export const newId = () => `c${Date.now().toString(36)}${(counter += 1).toString(36)}`;

export const DEFAULT_SONG = {
  key: { root: 0, scale: 'major' },
  tempo: 88,
  loop: true,
  level: 4,
  notation: 'en',
  chords: [
    { root: 5, quality: 'maj7', beats: 4 },
    { root: 7, quality: '7', beats: 4 },
    { root: 4, quality: 'm7', beats: 4 },
    { root: 9, quality: 'm7', beats: 4 },
  ],
  arrangement: {
    voicing: 'auto',
    chordPattern: 'block',
    bassPattern: 'hold',
    swing: 0,
    instruments: { chords: 'epiano', melody: 'bell', bass: 'sub' },
    mix: { chords: 0.8, melody: 0.72, bass: 0.8, reverb: 0.28 },
    muted: { chords: false, melody: false, bass: false },
    internalSound: true,
  },
  melody: {
    enabled: true,
    notes: [],
    params: { style: 'chant', density: 0.55, register: 'mid', syncopation: 0.25, repetition: 0.6 },
  },
  generator: { mood: 'reveur', length: 4, beatsPerChord: 4, audace: 0.4, startOnTonic: true, adaptScale: true },
};

// --- Validation des données venant de l'extérieur (lien partagé, sauvegarde) ---

const num = (v, min, max, fallback) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const int = (v, min, max, fallback) => (Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback);
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const ids = (list) => list.map((x) => x.id);

function sanitizeChord(c) {
  if (!c || typeof c !== 'object' || !QUALITIES[c.quality]) return null;
  return {
    id: newId(),
    root: int(c.root, 0, 11, 0),
    quality: c.quality,
    bass: c.bass == null ? null : int(c.bass, 0, 11, null),
    beats: oneOf(c.beats, [1, 2, 3, 4, 6, 8], 4),
    inversion: c.inversion == null ? null : int(c.inversion, 0, 6, null),
    octave: int(c.octave ?? 0, -1, 1, 0),
  };
}

function sanitizeNote(n) {
  if (!n || typeof n !== 'object') return null;
  const midi = int(n.midi, 24, 108, null);
  const start = num(n.start, 0, 512, null);
  if (midi == null || start == null) return null;
  return { midi, start, dur: num(n.dur, 0.05, 32, 0.5), vel: num(n.vel, 0.05, 1, 0.7) };
}

export function sanitizeSong(raw) {
  const d = DEFAULT_SONG;
  const s = raw && typeof raw === 'object' ? raw : {};
  const a = s.arrangement ?? {};
  const m = s.melody ?? {};
  const g = s.generator ?? {};
  const p = m.params ?? {};
  return {
    key: { root: int(s.key?.root, 0, 11, d.key.root), scale: getScale(s.key?.scale).id },
    tempo: int(s.tempo, 40, 220, d.tempo),
    loop: bool(s.loop, true),
    level: int(s.level, 3, 7, d.level),
    notation: oneOf(s.notation, ['en', 'fr'], 'en'),
    chords: (Array.isArray(s.chords) ? s.chords : d.chords).slice(0, 64).map(sanitizeChord).filter(Boolean),
    arrangement: {
      voicing: oneOf(a.voicing, ids(VOICINGS), d.arrangement.voicing),
      chordPattern: oneOf(a.chordPattern, ids(CHORD_PATTERNS), d.arrangement.chordPattern),
      bassPattern: oneOf(a.bassPattern, ids(BASS_PATTERNS), d.arrangement.bassPattern),
      swing: num(a.swing, 0, 1, 0),
      instruments: {
        chords: oneOf(a.instruments?.chords, ids(INSTRUMENTS.chords), d.arrangement.instruments.chords),
        melody: oneOf(a.instruments?.melody, ids(INSTRUMENTS.melody), d.arrangement.instruments.melody),
        bass: oneOf(a.instruments?.bass, ids(INSTRUMENTS.bass), d.arrangement.instruments.bass),
      },
      mix: {
        chords: num(a.mix?.chords, 0, 1, 0.8), melody: num(a.mix?.melody, 0, 1, 0.72),
        bass: num(a.mix?.bass, 0, 1, 0.8), reverb: num(a.mix?.reverb, 0, 1, 0.28),
      },
      muted: { chords: bool(a.muted?.chords, false), melody: bool(a.muted?.melody, false), bass: bool(a.muted?.bass, false) },
      internalSound: bool(a.internalSound, true),
    },
    melody: {
      enabled: bool(m.enabled, true),
      notes: (Array.isArray(m.notes) ? m.notes : []).slice(0, 1024).map(sanitizeNote).filter(Boolean),
      params: {
        style: oneOf(p.style, ids(MELODY_STYLES), 'chant'),
        density: num(p.density, 0, 1, 0.55),
        register: oneOf(p.register, ids(REGISTERS), 'mid'),
        syncopation: num(p.syncopation, 0, 1, 0.25),
        repetition: num(p.repetition, 0, 1, 0.6),
      },
    },
    generator: {
      mood: oneOf(g.mood, ids(MOODS), d.generator.mood),
      length: oneOf(g.length, [2, 3, 4, 5, 6, 8], 4),
      beatsPerChord: oneOf(g.beatsPerChord, [2, 4, 8], 4),
      audace: num(g.audace, 0, 1, 0.4),
      startOnTonic: bool(g.startOnTonic, true),
      adaptScale: bool(g.adaptScale, true),
    },
  };
}

/** Partie « musique » de l'état (ce qu'on sauvegarde et partage). */
export function songOf(state) {
  const { key, tempo, loop, level, notation, chords, arrangement, melody, generator } = state;
  return { key, tempo, loop, level, notation, chords, arrangement, melody, generator };
}

// --- Magasin ---

// Réglages hors historique : annuler/rétablir ne doit pas les faire revenir en arrière.
function keepSettings(restored, current) {
  const selected = restored.chords.some((c) => c.id === current.selected) ? current.selected : null;
  return {
    ...restored,
    ui: current.ui,
    notation: current.notation,
    generator: current.generator,
    level: current.level,
    selected,
    melody: { ...restored.melody, params: current.melody.params },
  };
}

export function createStore(initial) {
  let state = initial;
  let past = [];
  let future = [];
  const subs = new Set();
  const notify = (prev) => subs.forEach((fn) => fn(state, prev));
  return {
    get: () => state,
    /** @param {(s:object)=>object} updater  @param {{history?:boolean}} [opts] */
    set(updater, { history = true } = {}) {
      const next = updater(state);
      if (!next || next === state) return;
      if (history) {
        past = [...past.slice(-HISTORY_LIMIT + 1), state];
        future = [];
      }
      const prev = state;
      state = next;
      notify(prev);
    },
    undo() {
      if (!past.length) return;
      const prev = state;
      future = [state, ...future];
      state = keepSettings(past[past.length - 1], state);
      past = past.slice(0, -1);
      notify(prev);
    },
    redo() {
      if (!future.length) return;
      const prev = state;
      past = [...past, state];
      state = keepSettings(future[0], state);
      future = future.slice(1);
      notify(prev);
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

// --- Stockage local ---

function readJson(storageKey, fallback) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storageKey, value) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadSession = () => {
  const saved = readJson(SESSION_KEY, null);
  return saved ? sanitizeSong(saved) : null;
};
export const saveSession = (state) => writeJson(SESSION_KEY, songOf(state));

export function loadLibrary() {
  const list = readJson(LIBRARY_KEY, []);
  return Array.isArray(list)
    ? list.filter((x) => x && typeof x.name === 'string').map((x) => ({
      id: String(x.id ?? newId()), name: x.name.slice(0, 80), savedAt: Number(x.savedAt) || Date.now(), song: sanitizeSong(x.song),
    }))
    : [];
}

export function saveToLibrary(name, state) {
  const entry = { id: newId(), name: name.slice(0, 80), savedAt: Date.now(), song: songOf(state) };
  const ok = writeJson(LIBRARY_KEY, [entry, ...loadLibrary()].slice(0, 200));
  return ok ? entry : null;
}

export function removeFromLibrary(id) {
  return writeJson(LIBRARY_KEY, loadLibrary().filter((x) => x.id !== id));
}

// --- Liens de partage (#s=…) ---

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function shareUrl(state) {
  const song = songOf(state);
  const compact = {
    ...song,
    chords: song.chords.map(({ id, ...rest }) => rest),
    melody: { ...song.melody, notes: song.melody.notes.map((n) => ({ ...n, start: +n.start.toFixed(3), dur: +n.dur.toFixed(3), vel: +n.vel.toFixed(2) })) },
  };
  const base = `${location.origin}${location.pathname}`;
  return `${base}#s=${toBase64Url(JSON.stringify(compact))}`;
}

export function songFromHash(hash) {
  const match = /^#s=([A-Za-z0-9_-]+)$/.exec(hash ?? '');
  if (!match) return null;
  try {
    return sanitizeSong(JSON.parse(fromBase64Url(match[1])));
  } catch {
    return null;
  }
}
