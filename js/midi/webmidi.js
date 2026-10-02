// Sortie MIDI en direct (Chrome / Edge sur Mac : vers Logic, Ableton… via le bus IAC).
const CHANNEL = { chords: 0, bass: 1 };

export class MidiOut {
  constructor() {
    this.access = null;
    this.output = null;
    this.active = new Set();
  }

  static supported() {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  async connect() {
    if (!MidiOut.supported()) throw new Error('MIDI non disponible dans ce navigateur (utilise Chrome sur Mac).');
    this.access = await navigator.requestMIDIAccess();
    return this.outputs();
  }

  outputs() {
    return this.access ? [...this.access.outputs.values()].map((o) => ({ id: o.id, name: o.name })) : [];
  }

  select(id) {
    this.allOff();
    this.output = id && this.access ? this.access.outputs.get(id) ?? null : null;
  }

  send(track, midi, vel, delaySec, durSec) {
    if (!this.output) return;
    const ch = CHANNEL[track] ?? 0;
    const at = performance.now() + Math.max(0, delaySec) * 1000;
    const velocity = Math.max(1, Math.min(127, Math.round(vel * 127)));
    this.output.send([0x90 | ch, midi, velocity], at);
    this.output.send([0x80 | ch, midi, 0], at + durSec * 1000);
    this.active.add(`${ch}:${midi}`);
  }

  allOff() {
    if (!this.output) return;
    if (typeof this.output.clear === 'function') this.output.clear();
    this.active.forEach((key) => {
      const [ch, midi] = key.split(':').map(Number);
      this.output.send([0x80 | ch, midi, 0]);
    });
    this.active.clear();
  }
}
