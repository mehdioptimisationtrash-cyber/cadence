// Transforme l'état (progression + réglages) en une liste de notes datées.
import { chordPitchClasses } from '../theory/chords.js';
import { voiceProgression, bassNote } from '../theory/voicing.js';
import { chordEvents, bassEvents, applySwing } from './patterns.js';

export function chordStarts(chords) {
  let t = 0;
  return chords.map((c) => {
    const start = t;
    t += c.beats;
    return start;
  });
}

export const totalBeats = (chords) => chords.reduce((s, c) => s + c.beats, 0);

/** Basse calculée depuis le motif choisi (temps non swingués). */
export function patternBassNotes(state, { blockChords = false } = {}) {
  const { chords, arrangement } = state;
  if (arrangement.bassPattern === 'off') return [];
  const starts = chordStarts(chords);
  const nextPlayed = (i) => {
    for (let k = 1; k <= chords.length; k += 1) {
      const c = chords[(i + k) % chords.length];
      if (!c.rest) return c;
    }
    return chords[i];
  };
  return chords.flatMap((chord, i) => {
    if (chord.rest) return [];
    const next = nextPlayed(i);
    return bassEvents(blockChords ? 'hold' : arrangement.bassPattern, bassNote(chord), {
      chordPcs: chordPitchClasses(chord), nextRoot: bassNote(next), beats: chord.beats,
    }).map((e) => ({ midi: e.midi, start: starts[i] + e.start, dur: e.dur, vel: e.vel }));
  });
}

/**
 * @param {object} state
 * @param {{ blockChords?: boolean }} [opts] blockChords : accords plaqués (export MIDI « éditable »)
 * @returns {Array<{track:'chords'|'bass', midi:number, start:number, dur:number, vel:number, chord:number}>}
 */
export function arrange(state, { blockChords = false } = {}) {
  const { chords, arrangement } = state;
  const bassLine = state.bassLine ?? { custom: false, notes: [] };
  if (!chords.length) return [];
  const voicings = voiceProgression(chords, arrangement.voicing);
  const starts = chordStarts(chords);
  const swing = arrangement.swing ?? 0;
  const events = [];
  chords.forEach((chord, i) => {
    const pattern = blockChords ? 'block' : arrangement.chordPattern;
    chordEvents(pattern, voicings[i], chord.beats).forEach((e) => events.push({
      track: 'chords', midi: e.midi, start: applySwing(starts[i] + e.start, swing), dur: e.dur, vel: e.vel, chord: i,
    }));
  });
  const end = totalBeats(chords);
  const chordAt = (t) => Math.max(0, starts.findLastIndex((s) => s <= t));
  // Basse écrite à la main : jouée EXACTEMENT comme dans l'éditeur, sans swing.
  // Le swing ne s'applique qu'aux motifs automatiques.
  const bass = bassLine.custom ? bassLine.notes : patternBassNotes(state, { blockChords });
  const bassSwing = bassLine.custom ? 0 : swing;
  bass.filter((n) => n.start < end).forEach((n) => events.push({
    track: 'bass', midi: n.midi, start: applySwing(n.start, bassSwing), dur: Math.min(n.dur, end - n.start), vel: n.vel, chord: chordAt(n.start),
  }));
  return events.sort((a, b) => a.start - b.start);
}

/** Voicing de chaque accord (pour l'affichage clavier et l'écoute d'un accord seul). */
export function voicingsFor(state) {
  return voiceProgression(state.chords, state.arrangement.voicing);
}
