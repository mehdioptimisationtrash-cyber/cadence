// Écriture de fichiers MIDI standard (type 1) — glisser-déposer dans Logic, Ableton, FL Studio…
import { arrange } from '../gen/arrange.js';

const PPQ = 480;
const TRACK_INFO = {
  chords: { name: 'Accords', channel: 0, program: 4 },
  bass: { name: 'Basse', channel: 1, program: 33 },
  melody: { name: 'Mélodie', channel: 2, program: 80 },
};

function vlq(value) {
  let v = Math.max(0, Math.round(value));
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

const text = (s) => [...new TextEncoder().encode(s)];
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (id, data) => [...text(id), ...u32(data.length), ...data];
const meta = (type, data) => [0xff, type, ...vlq(data.length), ...data];

function encodeTrack(name, items) {
  const sorted = [...items].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const bytes = [0, ...meta(0x03, text(name))];
  let last = 0;
  sorted.forEach((it) => {
    bytes.push(...vlq(it.tick - last), ...it.data);
    last = it.tick;
  });
  bytes.push(0, ...meta(0x2f, []));
  return chunk('MTrk', bytes);
}

/**
 * @param {{ tempo:number, tracks: Array<{ name:string, channel:number, program:number,
 *   notes: Array<{midi:number, start:number, dur:number, vel:number}> }> }} song
 * @returns {Uint8Array}
 */
export function buildMidiFile({ tempo, tracks }) {
  const usPerBeat = Math.round(60000000 / tempo);
  const tempoTrack = encodeTrack('Cadence', [
    { tick: 0, order: 0, data: meta(0x51, [(usPerBeat >> 16) & 255, (usPerBeat >> 8) & 255, usPerBeat & 255]) },
    { tick: 0, order: 1, data: meta(0x58, [4, 2, 24, 8]) },
  ]);
  const noteTracks = tracks.map(({ name, channel, program, notes }) => {
    const items = [{ tick: 0, order: 0, data: [0xc0 | channel, program] }];
    notes.forEach((n) => {
      const on = Math.round(n.start * PPQ);
      const off = Math.max(on + 1, Math.round((n.start + n.dur) * PPQ));
      const vel = Math.max(1, Math.min(127, Math.round(n.vel * 127)));
      const note = Math.max(0, Math.min(127, n.midi));
      items.push({ tick: on, order: 2, data: [0x90 | channel, note, vel] });
      items.push({ tick: off, order: 1, data: [0x80 | channel, note, 0] });
    });
    return encodeTrack(name, items);
  });
  const header = chunk('MThd', [0, 1, 0, noteTracks.length + 1, (PPQ >> 8) & 255, PPQ & 255]);
  return new Uint8Array([...header, ...tempoTrack, ...noteTracks.flat()]);
}

/** Fichier MIDI depuis l'état de l'app ; `only` limite à une piste. */
export function midiFromState(state, { blockChords = false, only = null } = {}) {
  const events = arrange(state, { blockChords });
  const tracks = Object.entries(TRACK_INFO)
    .filter(([id]) => !only || only === id)
    .map(([id, info]) => ({ ...info, notes: events.filter((e) => e.track === id) }))
    .filter((t) => t.notes.length);
  return buildMidiFile({ tempo: state.tempo, tracks });
}
