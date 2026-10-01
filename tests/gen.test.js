import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceChord, voiceProgression, bassNote } from '../js/theory/voicing.js';
import { chordEvents, bassEvents, applySwing, CHORD_PATTERNS, BASS_PATTERNS } from '../js/gen/patterns.js';
import { TEMPLATES, templateChords, generateProgression, MOODS } from '../js/gen/progressions.js';
import { generateMelody, revoiceMelody, MELODY_STYLES } from '../js/gen/melody.js';
import { getScale } from '../js/theory/scales.js';
import { pc } from '../js/theory/notes.js';

test('voicings stay in a playable range and keep chord tones', () => {
  for (const style of ['auto', 'close', 'open', 'drop2', 'piano']) {
    const v = voiceChord({ root: 7, quality: '7' }, { style });
    assert.ok(v.every((n) => n >= 30 && n <= 96), `${style} ${v}`);
    assert.ok([7, 11, 2, 5].every((p) => v.some((n) => pc(n) === p)), `${style} ${v}`);
  }
});

test('voice leading moves less than root position jumps', () => {
  const chords = [{ root: 0, quality: 'maj' }, { root: 5, quality: 'maj' }, { root: 7, quality: 'maj' }, { root: 0, quality: 'maj' }];
  const led = voiceProgression(chords, 'auto');
  const close = voiceProgression(chords, 'close');
  const move = (vs) => vs.slice(1).reduce((s, v, i) => s + Math.abs(v[0] - vs[i][0]), 0);
  assert.ok(move(led) <= move(close));
});

test('slash chords put the bass note at the bottom', () => {
  const v = voiceChord({ root: 0, quality: 'maj', bass: 4 }, { style: 'close' });
  assert.equal(pc(v[0]), 4);
  assert.equal(bassNote({ root: 0, quality: 'maj', bass: 4 }), 40);
});

test('every pattern produces events within the chord length', () => {
  for (const p of CHORD_PATTERNS) {
    const evs = chordEvents(p.id, [60, 64, 67, 71], 4);
    assert.ok(evs.length > 0, p.id);
    assert.ok(evs.every((e) => e.start >= 0 && e.start + e.dur <= 4.001), p.id);
  }
  for (const p of BASS_PATTERNS) {
    const evs = bassEvents(p.id, 36, { chordPcs: [0, 4, 7], nextRoot: 41, beats: 4 });
    assert.ok(p.id === 'off' ? evs.length === 0 : evs.length > 0, p.id);
  }
  assert.equal(applySwing(0.5, 1).toFixed(3), '0.667');
  assert.equal(applySwing(1, 1), 1);
});

test('all templates parse fully', () => {
  for (const t of TEMPLATES) {
    const chords = templateChords(t, 0);
    assert.equal(chords.length, t.prog.split(/\s+/).length, t.name);
  }
});

test('generator respects length and is reproducible', () => {
  for (const mood of MOODS) {
    const a = generateProgression({ key: { root: 2, scale: 'major' }, moodId: mood.id, length: 8, seed: 42, audace: 0.8 });
    const b = generateProgression({ key: { root: 2, scale: 'major' }, moodId: mood.id, length: 8, seed: 42, audace: 0.8 });
    assert.deepEqual(a, b);
    assert.ok(a.chords.length >= 8, mood.id);
    assert.equal(a.chords[0].root, 2, mood.id);
    a.chords.forEach((c, i) => i && assert.ok(!(c.root === a.chords[i - 1].root && c.quality === a.chords[i - 1].quality), `${mood.id} repeat`));
  }
  const penta = generateProgression({ key: { root: 0, scale: 'minorPentatonic' }, length: 4, seed: 1 });
  assert.equal(penta.chords.length, 4);
});

test('melody fits range, timeline and mostly the scale', () => {
  const key = { root: 0, scale: 'major' };
  const chords = templateChords(TEMPLATES[0], 0);
  const scalePcs = getScale('major').iv;
  for (const s of MELODY_STYLES) {
    const notes = generateMelody({ chords, key, params: { style: s.id }, seed: 7 });
    assert.ok(notes.length >= 6, s.id);
    assert.ok(notes.every((n) => n.start >= 0 && n.start + n.dur <= 16.001 && n.midi >= 55 && n.midi <= 88), s.id);
    assert.ok(notes.every((n) => scalePcs.includes(pc(n.midi))), s.id);
  }
  const notes = generateMelody({ chords, key, seed: 3 });
  const again = revoiceMelody(notes, { chords, key, seed: 9 });
  assert.deepEqual(again.map((n) => n.start), notes.map((n) => n.start));
});

test('slash chords: groups, smooth bass and stepwise suggestions', async () => {
  const { slashGroups, smoothBassLine } = await import('../js/theory/slash.js');
  const { suggestNext, romanNumeral } = await import('../js/theory/harmony.js');
  const key = { root: 0, scale: 'major' };
  const groups = slashGroups(key, 3);
  assert.ok(groups.find((g) => g.id === 'colors').chords.some((c) => c.root === 5 && c.bass === 7)); // F/G
  assert.ok(groups.every((g) => g.chords.every((c) => c.bass != null && c.bass !== c.root)));
  const smooth = smoothBassLine([{ root: 0, quality: 'maj' }, { root: 7, quality: 'maj' }, { root: 9, quality: 'min' }, { root: 5, quality: 'maj' }], 0.8);
  assert.equal(smooth[1].bass, 11); // G/B
  assert.equal(smooth[0].bass, null);
  assert.equal(romanNumeral({ root: 5, quality: 'maj', bass: 7 }, key), 'IV/V');
  assert.ok(suggestNext({ root: 0, quality: 'maj' }, key, 3, 8).some((s) => s.chord.bass != null));
  const gen = generateProgression({ key, length: 8, seed: 5, smoothBass: 1 });
  assert.equal(gen.chords.length >= 8, true);
});
