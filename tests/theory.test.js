import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSpeller } from '../js/theory/notes.js';
import { getScale } from '../js/theory/scales.js';
import { chordSymbol, detectChords, qualityFromIntervals } from '../js/theory/chords.js';
import {
  diatonicChords, romanNumeral, chordFunction, borrowedChords, secondaryDominants, suggestNext, parseRoman, romanToChord, chordVariants,
} from '../js/theory/harmony.js';

const names = (key, level) => {
  const sp = makeSpeller(key.root, getScale(key.scale));
  return diatonicChords(key, level).map((c) => chordSymbol(c, sp));
};

test('spells keys with correct letters', () => {
  assert.deepEqual(getScale('major').iv.map((iv) => makeSpeller(2, getScale('major')).name(2 + iv)), ['D', 'E', 'F♯', 'G', 'A', 'B', 'C♯']);
  assert.deepEqual(getScale('minor').iv.map((iv) => makeSpeller(1, getScale('minor')).name(1 + iv)), ['C♯', 'D♯', 'E', 'F♯', 'G♯', 'A', 'B']);
  assert.equal(makeSpeller(5, getScale('major')).name(10), 'B♭');
  assert.equal(makeSpeller(0, getScale('major')).name(8), 'A♭');
  assert.equal(makeSpeller(4, getScale('harmonicMinor')).name(3), 'D♯');
  assert.equal(makeSpeller(0, getScale('major')).name(0, 'fr'), 'Do');
});

test('builds diatonic triads and sevenths', () => {
  assert.deepEqual(names({ root: 0, scale: 'major' }, 3), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
  assert.deepEqual(names({ root: 0, scale: 'major' }, 4), ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7♭5']);
  assert.deepEqual(names({ root: 9, scale: 'harmonicMinor' }, 4), ['Am(maj7)', 'Bm7♭5', 'Cmaj7♯5', 'Dm7', 'E7', 'Fmaj7', 'G♯dim7']);
});

test('extensions fall back gracefully', () => {
  assert.deepEqual(names({ root: 0, scale: 'major' }, 5), ['Cmaj9', 'Dm9', 'Em7', 'Fmaj9', 'G9', 'Am9', 'Bm7♭5']);
  const thirteen = names({ root: 0, scale: 'major' }, 7);
  assert.equal(thirteen[0], 'Cmaj13');
  assert.equal(thirteen[4], 'G13');
  assert.equal(thirteen[1], 'Dm13');
});

test('pentatonic scales give fitting chords', () => {
  const list = names({ root: 0, scale: 'majorPentatonic' }, 3);
  assert.ok(list.includes('C'));
  assert.ok(list.length >= 3);
});

test('roman numerals and functions', () => {
  const key = { root: 0, scale: 'major' };
  assert.equal(romanNumeral({ root: 7, quality: '7' }, key), 'V7');
  assert.equal(romanNumeral({ root: 9, quality: 'min' }, key), 'vi');
  assert.equal(romanNumeral({ root: 8, quality: 'maj' }, key), '♭VI');
  assert.equal(romanNumeral({ root: 11, quality: 'm7b5' }, key), 'viiø7');
  assert.equal(romanNumeral({ root: 8, quality: 'maj' }, { root: 0, scale: 'minor' }), 'VI');
  assert.equal(chordFunction({ root: 7, quality: '7' }, key), 'D');
  assert.equal(chordFunction({ root: 2, quality: '7' }, key), 'sec');
  assert.equal(chordFunction({ root: 5, quality: 'min' }, key), 'borrow');
  assert.equal(chordFunction({ root: 9, quality: 'min' }, key), 'T');
});

test('borrowed and secondary chords', () => {
  const key = { root: 0, scale: 'major' };
  const minor = borrowedChords(key, 3)[0];
  assert.equal(minor.source, 'minor');
  assert.ok(minor.chords.some((c) => c.root === 5 && c.quality === 'min'));
  const sec = secondaryDominants(key, 4);
  assert.ok(sec.some((c) => c.root === 2 && c.label === 'V7/V'));
});

test('suggestions favour strong resolutions', () => {
  const key = { root: 0, scale: 'major' };
  const afterV = suggestNext({ root: 7, quality: '7' }, key, 4);
  assert.equal(afterV[0].chord.root, 0);
  assert.equal(afterV[0].reason, 'Cadence parfaite');
  const start = suggestNext(null, key, 3);
  assert.equal(start[0].chord.root, 0);
  const afterD7 = suggestNext({ root: 2, quality: '7' }, key, 4);
  assert.equal(afterD7[0].chord.root, 7);
});

test('roman parsing', () => {
  assert.deepEqual(parseRoman('bVII'), { semis: 10, quality: 'maj', bassSemis: null });
  assert.deepEqual(parseRoman('iiø7'), { semis: 2, quality: 'm7b5', bassSemis: null });
  assert.deepEqual(romanToChord('vi7', 0), { root: 9, quality: 'm7', bass: null });
  assert.deepEqual(romanToChord('IV/I', 0), { root: 5, quality: 'maj', bass: 0 });
  assert.equal(parseRoman('Xyz'), null);
});

test('chord detection', () => {
  assert.deepEqual(detectChords([60, 64, 67])[0], { root: 0, quality: 'maj', bass: null, score: 13 });
  const inv = detectChords([64, 67, 72])[0];
  assert.equal(inv.root, 0);
  assert.equal(inv.bass, 4);
  assert.equal(detectChords([57, 60, 64, 67])[0].quality, 'm7');
  assert.equal(qualityFromIntervals([0, 4, 7, 10]), '7');
});

test('variants exist', () => {
  const v = chordVariants({ root: 0, quality: 'maj' }, { root: 0, scale: 'major' }, 3);
  assert.ok(v.length > 5);
  assert.ok(v.some((x) => x.chord.root === 9));
});
