// Contexte partagé : magasin, audio et petits utilitaires d'affichage musical.
import { makeSpeller } from '../theory/notes.js';
import { getScale } from '../theory/scales.js';
import { chordSymbol } from '../theory/chords.js';
import { romanNumeral, chordFunction } from '../theory/harmony.js';
import { voiceChord, bassNote } from '../theory/voicing.js';
import { freezeBass } from '../actions.js';

export function createContext({ store, player, synth, midiOut }) {
  let spellerKey = '';
  let speller = null;
  const flashListeners = new Set();

  const getSpeller = (key) => {
    const id = `${key.root}:${key.scale}`;
    if (id !== spellerKey) {
      speller = makeSpeller(key.root, getScale(key.scale));
      spellerKey = id;
    }
    return speller;
  };

  const ctx = {
    store,
    player,
    synth,
    midiOut,
    get state() {
      return store.get();
    },
    set: (fn, opts) => store.set(fn, opts),
    setUi: (patch) => store.set((s) => ({ ...s, ui: { ...s.ui, ...patch } }), { history: false }),
    /** Ouvre l'édition à la main d'une piste ('melody' | 'bass'), ou la ferme (null). */
    startEdit(track) {
      store.set((s) => {
        const next = { ...s, selected: null, ui: { ...s.ui, editTrack: track } };
        return track === 'bass' ? freezeBass(next) : next;
      }, { history: false });
    },
    note: (p, state = store.get()) => getSpeller(state.key).name(p, state.notation),
    label: (chord, state = store.get()) => chordSymbol(chord, getSpeller(state.key), state.notation),
    roman: (chord, state = store.get()) => romanNumeral(chord, state.key),
    fn: (chord, state = store.get()) => chordFunction(chord, state.key),
    keyName(state = store.get()) {
      const scale = getScale(state.key.scale);
      return `${ctx.note(state.key.root, state)} ${scale.name.toLowerCase()}`;
    },
    /** Joue un accord tout de suite et l'allume sur le clavier. */
    audition(chord, { prev = null } = {}) {
      const state = store.get();
      const notes = voiceChord(chord, { style: state.arrangement.voicing, prev });
      const bass = state.arrangement.bassPattern === 'off' ? null : bassNote(chord);
      player.state = player.state ?? state;
      player.audition(notes, { bass });
      ctx.flash([...notes, ...(bass == null ? [] : [bass])]);
    },
    playNotes(notes, track = 'chords') {
      player.state = player.state ?? store.get();
      player.audition(notes, { track, dur: 0.9 });
      ctx.flash(notes);
    },
    flash(notes, ms = 900) {
      flashListeners.forEach((fn) => fn(notes, ms));
    },
    onFlash(fn) {
      flashListeners.add(fn);
      return () => flashListeners.delete(fn);
    },
  };
  return ctx;
}
