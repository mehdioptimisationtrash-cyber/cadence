// Lecteur : programme les notes un peu à l'avance (horloge audio) et boucle la progression.
import { arrange, totalBeats } from '../gen/arrange.js';

const LOOKAHEAD = 0.28;
const TICK_MS = 25;

export class Player {
  constructor(synth, midiOut) {
    this.synth = synth;
    this.midiOut = midiOut;
    this.playing = false;
    this.state = null;
    this.events = [];
    this.length = 0;
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this.playing));
  }

  secondsPerBeat() {
    return 60 / (this.state?.tempo ?? 100);
  }

  /** Met à jour la musique en cours de lecture (prise en compte au prochain passage). */
  update(state) {
    const pos = this.position();
    this.state = state;
    this.events = arrange(state);
    this.length = totalBeats(state.chords);
    if (!this.playing) return;
    if (!this.length) {
      this.stop();
      return;
    }
    // Ré-ancre l'horloge : la lecture continue au même endroit, au nouveau tempo.
    const spb = this.secondsPerBeat();
    const here = (pos ?? 0) % this.length;
    this.startTime = this.synth.now() - here * spb;
    this.loopIndex = 0;
    const scheduledUntil = here + LOOKAHEAD / spb;
    const next = this.events.findIndex((e) => e.start > scheduledUntil);
    this.cursor = next === -1 ? this.events.length : next;
  }

  start(state) {
    this.update(state);
    if (!this.length) return;
    this.synth.ensure();
    this.playing = true;
    this.startTime = this.synth.now() + 0.08;
    this.startBeat = 0;
    this.cursor = 0;
    this.loopIndex = 0;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
    this.emit();
  }

  stop() {
    if (!this.playing) return;
    clearInterval(this.timer);
    this.playing = false;
    this.previewing = null;
    this.synth.panic();
    this.midiOut?.allOff();
    this.emit();
  }

  /** Fin naturelle (sans boucle) : on laisse sonner la queue des notes. */
  finish() {
    clearInterval(this.timer);
    this.playing = false;
    this.previewing = null;
    this.emit();
  }

  toggle(state) {
    if (this.playing) this.stop();
    else this.start(state);
  }

  /** Position actuelle en temps depuis le début de la boucle. */
  position() {
    if (!this.playing) return null;
    const beats = (this.synth.now() - this.startTime) / this.secondsPerBeat();
    if (beats < 0) return 0;
    return this.state.loop ? beats % this.length : Math.min(beats, this.length);
  }

  tick() {
    const spb = this.secondsPerBeat();
    const horizon = this.synth.now() + LOOKAHEAD;
    for (;;) {
      if (this.cursor >= this.events.length) {
        if (!this.state.loop) {
          const endTime = this.startTime + (this.loopIndex + 1) * this.length * spb;
          if (this.synth.now() > endTime) this.finish();
          return;
        }
        this.loopIndex += 1;
        this.cursor = 0;
        continue;
      }
      const e = this.events[this.cursor];
      const when = this.startTime + (this.loopIndex * this.length + e.start) * spb;
      if (when > horizon) return;
      this.cursor += 1;
      if (when < this.synth.now() - 0.05) continue;
      this.trigger(e, when, e.dur * spb);
    }
  }

  trigger(e, when, dur) {
    const { instruments, internalSound } = this.state.arrangement;
    if (internalSound !== false) this.synth.play(e.track, instruments[e.track], e.midi, when, dur, e.vel);
    this.midiOut?.send(e.track, e.midi, e.vel, when - this.synth.now(), dur);
  }

  /** Écoute immédiate d'un accord ou de quelques notes. */
  audition(notes, { track = 'chords', dur = 1.4, bass = null } = {}) {
    this.synth.ensure();
    const { instruments, internalSound } = this.state.arrangement;
    const t = this.synth.now() + 0.02;
    notes.forEach((m, i) => {
      if (internalSound !== false) this.synth.play(track, instruments[track], m, t + i * 0.012, dur, 0.68);
      this.midiOut?.send(track, m, 0.68, 0.02, dur);
    });
    if (bass != null) {
      if (internalSound !== false) this.synth.play('bass', instruments.bass, bass, t, dur, 0.7);
      this.midiOut?.send('bass', bass, 0.7, 0.02, dur);
    }
  }
}
