import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, freqToNote, median, foldIntoRange, createPitchTracker } from '../js/audio/pitch.js';

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

test('tracker shows a quiet whistle within ~80 ms, without wrong notes', () => {
  const tr = createPitchTracker(RATE);
  const sig = new Float32Array(RATE);
  for (let i = 0; i < sig.length; i += 1) sig[i] = 0.008 * Math.sin((2 * Math.PI * 1318.5 * i) / RATE) + 0.002 * (Math.random() * 2 - 1);
  let firstMs = null;
  const seen = new Set();
  for (let end = 2048; end < sig.length; end += 800) {
    const r = tr.push(sig.subarray(end - 2048, end));
    if (r) { seen.add(r.midi); if (firstMs == null) firstMs = (end / RATE) * 1000; }
  }
  assert.ok(firstMs != null && firstMs < 80, `première note à ${firstMs} ms`);
  assert.deepEqual([...seen], [88]);
});

test('tracker holds the note through short dropouts and releases after silence', () => {
  const tr = createPitchTracker(RATE);
  const on = tone(440);
  tr.push(on); tr.push(on);
  assert.equal(tr.push(on).midi, 69);
  assert.equal(tr.push(new Float32Array(2048)).midi, 69);
  for (let i = 0; i < 12; i += 1) tr.push(new Float32Array(2048));
  assert.equal(tr.push(new Float32Array(2048)), null);
});
