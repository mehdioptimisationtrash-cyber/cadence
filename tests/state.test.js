import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSong, DEFAULT_SONG, createStore } from '../js/state.js';
import { addChord, removeChord, moveChord, transpose, setKey, duplicateChord } from '../js/actions.js';
import { buildMidiFile, midiFromState } from '../js/midi/export.js';
import { arrange } from '../js/gen/arrange.js';

const fresh = () => ({ ...sanitizeSong(DEFAULT_SONG), selected: null, ui: {} });

test('sanitize rejects junk and keeps valid data', () => {
  const s = sanitizeSong({ tempo: 9999, key: { root: 40, scale: 'nope' }, chords: [{ root: 2, quality: 'm7', beats: 4 }, { root: 1, quality: 'bogus' }, null], melody: { notes: [{ midi: 60, start: 0, dur: 1, vel: 0.8 }, { midi: 'x' }] } });
  assert.equal(s.tempo, 220);
  assert.equal(s.key.root, 11);
  assert.equal(s.key.scale, 'major');
  assert.equal(s.chords.length, 1);
  assert.equal(s.chords[0].bass, null);
  assert.equal(s.melody, undefined);
  assert.equal(sanitizeSong(null).chords.length, 4);
});

test('chord actions are immutable', () => {
  const s = fresh();
  const added = addChord(s, { root: 0, quality: 'maj' });
  assert.equal(s.chords.length, 4);
  assert.equal(added.chords.length, 5);
  assert.equal(added.selected, null);
  assert.equal(addChord(s, { root: 0, quality: 'maj' }, null, { select: true }).selected !== null, true);
  const moved = moveChord(added, 4, 0);
  assert.equal(moved.chords[0].root, 0);
  const removed = removeChord(moved, moved.chords[0].id);
  assert.equal(removed.chords.length, 4);
  assert.equal(duplicateChord(s, s.chords[1].id).chords[2].root, s.chords[1].root);
});

test('transpose and mode change', () => {
  const s = fresh();
  const up = transpose(s, 2);
  assert.equal(up.key.root, 2);
  assert.equal(up.chords[0].root, 7);
  const minor = setKey(s, { root: 0, scale: 'minor' });
  assert.deepEqual(minor.chords.map((c) => [c.root, c.quality]), [[5, 'm7'], [7, 'm7'], [3, 'maj7'], [8, 'maj7']]);
  const keyChange = setKey(s, { root: 7, scale: 'major' });
  assert.equal(keyChange.chords[0].root, 0);
});

test('store undo / redo', () => {
  const store = createStore(fresh());
  store.set((st) => addChord(st, { root: 0, quality: 'maj' }));
  assert.equal(store.get().chords.length, 5);
  store.undo();
  assert.equal(store.get().chords.length, 4);
  store.redo();
  assert.equal(store.get().chords.length, 5);
});

test('arrangement and MIDI file', () => {
  const s = fresh();
  const events = arrange(s);
  assert.ok(events.some((e) => e.track === 'chords'));
  assert.ok(events.some((e) => e.track === 'bass'));
  assert.ok(events.every((e) => e.track === 'chords' || e.track === 'bass'));
  const bytes = midiFromState(s);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'MThd');
  assert.equal(bytes[11], 3); // tempo + accords + basse
  const tiny = buildMidiFile({ tempo: 120, tracks: [{ name: 'x', channel: 0, program: 0, notes: [{ midi: 60, start: 0, dur: 1, vel: 1 }] }] });
  assert.ok(tiny.length > 40);
});

test('undo does not revert settings kept out of history', () => {
  const store = createStore(fresh());
  store.set((st) => addChord(st, { root: 0, quality: 'maj' }));
  store.set((st) => ({ ...st, notation: 'fr' }), { history: false });
  store.undo();
  assert.equal(store.get().chords.length, 4);
  assert.equal(store.get().notation, 'fr');
});

test('bass line can be frozen, edited by hand and released', async () => {
  const { freezeBass, releaseBass, setTrackNotes, trackNotes, transpose: tr } = await import('../js/actions.js');
  const s = fresh();
  const frozen = freezeBass(s);
  assert.equal(frozen.bassLine.custom, true);
  assert.ok(frozen.bassLine.notes.length >= 4);
  const edited = setTrackNotes(frozen, 'bass', [{ midi: 30, start: 0, dur: 1, vel: 0.8 }]);
  const bass = arrange(edited).filter((e) => e.track === 'bass');
  assert.deepEqual(bass.map((e) => e.midi), [30]);
  assert.equal(trackNotes(tr(edited, 2), 'bass')[0].midi, 32);
  assert.equal(addChord(edited, { root: 0, quality: 'maj' }).bassLine.stale, true);
  const back = releaseBass(edited, 'pump');
  assert.equal(back.bassLine.custom, false);
  assert.ok(arrange(back).filter((e) => e.track === 'bass').length > 8);
  assert.equal(sanitizeSong({ ...edited }).bassLine.notes.length, 1);
});
