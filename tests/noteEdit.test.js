import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  placeNote, updateNote, removeNote, duplicateNote, stepPitch, snapBeat, floorBeat, clampNote, overlaps,
} from '../js/gen/noteEdit.js';

const n = (midi, start, dur) => ({ midi, start, dur, vel: 0.8 });
const noOverlap = (notes) => notes.every((a, i) => notes.every((b, j) => i === j || !overlaps(a, b)));

test('placing a note never leaves overlaps', () => {
  const base = [n(60, 0, 2), n(62, 2, 1), n(64, 3, 1)];
  const { notes, note } = placeNote(base, n(67, 1, 2.5), 16);
  assert.ok(noOverlap(notes));
  assert.deepEqual(notes.map((x) => [x.midi, x.start, x.dur]), [[60, 0, 1], [67, 1, 2.5]]);
  assert.equal(note.midi, 67);
});

test('note is clamped to the song length', () => {
  assert.deepEqual(clampNote(n(60, 15.5, 4), 16), n(60, 15.5, 0.5));
  assert.deepEqual(clampNote(n(60, -2, 1), 16), n(60, 0, 1));
});

test('move, resize, delete and duplicate', () => {
  const base = [n(60, 0, 1), n(62, 1, 1), n(64, 2, 1)];
  const moved = updateNote(base, base[0], { start: 1, midi: 65 }, 16);
  assert.ok(noOverlap(moved.notes));
  assert.deepEqual(moved.notes.map((x) => x.midi), [65, 64]);
  const resized = updateNote(base, base[0], { dur: 2 }, 16);
  assert.deepEqual(resized.notes.map((x) => [x.midi, x.dur]), [[60, 2], [64, 1]]);
  assert.equal(removeNote(base, base[1]).length, 2);
  const dup = duplicateNote([n(60, 0, 1)], n(60, 0, 1), 16);
  assert.deepEqual(dup.notes.map((x) => x.start), [0, 1]);
  assert.equal(updateNote(base, n(99, 9, 1), { dur: 2 }, 16).note, null);
});

test('pitch steps and grid snapping', () => {
  const cMajor = [0, 2, 4, 5, 7, 9, 11];
  assert.equal(stepPitch(64, 1, cMajor), 65);
  assert.equal(stepPitch(65, 1, cMajor), 67);
  assert.equal(stepPitch(60, -1, cMajor), 59);
  assert.equal(stepPitch(60, 1), 61);
  assert.equal(snapBeat(1.3, 0.5), 1.5);
  assert.equal(floorBeat(1.99, 0.5), 1.5);
  assert.equal(floorBeat(2, 0.5), 2);
});
