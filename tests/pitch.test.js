import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, freqToNote, median, foldIntoRange } from '../js/audio/pitch.js';

const RATE = 48000;
function tone(freq, { harmonics = [1], noise = 0, size = 2048, amp = 0.4 } = {}) {
  const out = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    let v = 0;
    harmonics.forEach((h, k) => { v += (h * Math.sin((2 * Math.PI * freq * (k + 1) * i) / RATE)); });
    out[i] = amp * v + noise * (Math.random() * 2 - 1);
  }
  return out;
}

test('detects whistle, voice and bass-range pitches', () => {
  for (const f of [110, 196, 261.63, 440, 880, 1567.98]) {
    const r = detectPitch(tone(f), RATE);
    assert.ok(r, `rien pour ${f}`);
    assert.ok(Math.abs(freqToNote(r.freq).exact - freqToNote(f).exact) < 0.1, `${f} → ${r.freq}`);
  }
});

test('voice-like harmonics do not trigger octave errors', () => {
  const r = detectPitch(tone(220, { harmonics: [0.6, 1, 0.5, 0.3] }), RATE);
  assert.equal(freqToNote(r.freq).midi, 57);
});

test('silence and pure noise give nothing', () => {
  assert.equal(detectPitch(new Float32Array(2048), RATE), null);
  assert.equal(detectPitch(tone(440, { amp: 0, noise: 0.3 }), RATE), null);
});

test('note naming helpers', () => {
  assert.deepEqual(freqToNote(440), { midi: 69, cents: 0, exact: 69 });
  assert.equal(freqToNote(452).cents, 47);
  assert.equal(median([1, 9, 3, 2, 8]), 3);
  assert.equal(foldIntoRange(93), 81);
  assert.equal(foldIntoRange(40), 52);
});
