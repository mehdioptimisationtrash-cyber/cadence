// Instruments synthétisés avec Web Audio (aucun échantillon à télécharger : marche hors ligne).
import { midiToFreq } from '../theory/notes.js';

export const INSTRUMENTS = {
  chords: [
    { id: 'epiano', label: 'Piano électrique' },
    { id: 'piano', label: 'Piano doux' },
    { id: 'pad', label: 'Nappe' },
    { id: 'strings', label: 'Cordes' },
    { id: 'organ', label: 'Orgue' },
    { id: 'pluck', label: 'Pluck' },
  ],
  melody: [
    { id: 'bell', label: 'Cloche FM' },
    { id: 'lead', label: 'Lead synthé' },
    { id: 'flute', label: 'Flûte' },
    { id: 'pluck', label: 'Pluck' },
    { id: 'epiano', label: 'Piano électrique' },
    { id: 'piano', label: 'Piano doux' },
  ],
  bass: [
    { id: 'sub', label: 'Sub' },
    { id: 'synthbass', label: 'Basse synthé' },
    { id: 'upright', label: 'Contrebasse' },
  ],
};

const TRACKS = ['chords', 'melody', 'bass'];
const MOBILE = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
// Garde-fou : au-delà, les notes les plus anciennes s'éteignent en douceur.
const MAX_VOICES = 96;

function makeImpulse(ctx, seconds = 2.6, decay = 3.2) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
  return buffer;
}

function envelope(param, t, { peak, attack = 0.005, decay = 0.3, sustain = 0.6, end, release = 0.2 }) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.setTargetAtTime(Math.max(0.0001, peak * sustain), t + attack, decay / 3);
  param.setTargetAtTime(0.0001, Math.max(end, t + attack), release / 4);
}

function osc(ctx, type, freq, t, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.setValueAtTime(detune, t);
  return o;
}

// Chaque voix renvoie la liste de ses oscillateurs et l'instant où elle se tait.
const VOICES = {
  epiano(ctx, out, f, t, dur, vel) {
    const amp = ctx.createGain();
    const end = t + dur;
    envelope(amp.gain, t, { peak: 0.3 * vel, attack: 0.003, decay: 1.6, sustain: 0.25, end, release: 0.35 });
    const car = osc(ctx, 'sine', f, t);
    const mod = osc(ctx, 'sine', f, t);
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(f * (1.2 + vel * 2.2), t);
    modGain.gain.setTargetAtTime(f * 0.25, t, 0.25);
    mod.connect(modGain).connect(car.frequency);
    const tine = osc(ctx, 'sine', f * 4, t);
    const tineGain = ctx.createGain();
    tineGain.gain.setValueAtTime(0.05 * vel, t);
    tineGain.gain.setTargetAtTime(0.0001, t, 0.08);
    car.connect(amp);
    tine.connect(tineGain).connect(amp);
    amp.connect(out);
    return { nodes: [car, mod, tine], stop: end + 0.5, amp };
  },
  piano(ctx, out, f, t, dur, vel) {
    const amp = ctx.createGain();
    const end = t + dur;
    const keyDecay = Math.max(0.6, 3.2 - Math.log2(f / 110) * 0.7);
    envelope(amp.gain, t, { peak: 0.28 * vel, attack: 0.002, decay: keyDecay, sustain: 0.05, end, release: 0.25 });
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(12000, f * (6 + vel * 10)), t);
    lp.frequency.setTargetAtTime(f * 3, t, 0.4);
    const parts = [['triangle', 1, 0.9], ['sine', 2, 0.35], ['sine', 3, 0.12], ['sine', 1.002, 0.4]];
    const nodes = parts.map(([type, ratio, g]) => {
      const o = osc(ctx, type, f * ratio, t);
      const gain = ctx.createGain();
      gain.gain.value = g;
      o.connect(gain).connect(lp);
      return o;
    });
    lp.connect(amp).connect(out);
    return { nodes, stop: end + 0.4, amp };
  },
  pad(ctx, out, f, t, dur, vel) {
    const amp = ctx.createGain();
    const end = t + dur;
    envelope(amp.gain, t, { peak: 0.11 * vel, attack: 0.45, decay: 1, sustain: 0.85, end, release: 1.2 });
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900 + vel * 900, t);
    lp.Q.value = 0.7;
    const nodes = [-9, 0, 8].map((d) => {
      const o = osc(ctx, 'sawtooth', f, t, d);
      o.connect(lp);
      return o;
    });
    lp.connect(amp).connect(out);
    return { nodes, stop: end + 1.6, amp };
  },
  strings(ctx, out, f, t, dur, vel) {
    const amp = ctx.createGain();
    const end = t + dur;
    envelope(amp.gain, t, { peak: 0.12 * vel, attack: 0.18, decay: 0.8, sustain: 0.8, end, release: 0.6 });
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t);
    const vib = osc(ctx, 'sine', 5.2, t);
    const vibGain = ctx.createGain();
    vibGain.gain.value = 6;
    vib.connect(vibGain);
    const nodes = [-6, 5].map((d) => {
      const o = osc(ctx, 'sawtooth', f, t, d);
      vibGain.connect(o.detune);
      o.connect(lp);
      return o;
    });
    lp.connect(amp).connect(out);
    return { nodes: [...nodes, vib], stop: end + 0.9, amp };
  },
  organ(ctx, out, f, t, dur, vel) {
    const amp = ctx.createGain();
    const end = t + dur;
    envelope(amp.gain, t, { peak: 0.1 * vel, attack: 0.012, decay: 0.2, sustain: 1, end, release: 0.08 });
    const nodes = [[1, 1], [2, 0.7], [3, 0.35], [4, 0.3], [0.5, 0.5]].map(([ratio, g]) => {
      const o = osc(ctx, 'sine', f * ratio, t);
      const gain = ctx.createGain();
      gain.gain.value = g;
      o.connect(gain).connect(amp);
      return o;
    });
    amp.connect(out);
    return { nodes, stop: end + 0.2, amp };
  },
  pluck(ctx, out, f, t, dur, vel) {
    const amp = ctx.createGain();
    const end = t + Math.min(dur, 1.2);
    envelope(amp.gain, t, { peak: 0.2 * vel, attack: 0.002, decay: 0.5, sustain: 0.08, end, release: 0.18 });
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(Math.min(14000, f * 10), t);
    lp.frequency.setTargetAtTime(f * 1.5, t, 0.09);
    const a = osc(ctx, 'sawtooth', f, t, -4);
    const b = osc(ctx, 'square', f, t, 5);
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    a.connect(lp);
    b.connect(bg).connect(lp);
    lp.connect(amp).connect(out);
    return { nodes: [a, b], stop: end + 0.3, amp };
  },
  bell(ctx, out, f, t, dur, vel) {
    const amp = ctx.createGain();
    const end = t + dur;
    envelope(amp.gain, t, { peak: 0.2 * vel, attack: 0.002, decay: 1.4, sustain: 0.2, end, release: 0.6 });
    const car = osc(ctx, 'sine', f, t);
    const mod = osc(ctx, 'sine', f * 3.5, t);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 2.4 * vel, t);
    mg.gain.setTargetAtTime(f * 0.2, t, 0.3);
    mod.connect(mg).connect(car.frequency);
    car.connect(amp).connect(out);
    return { nodes: [car, mod], stop: end + 0.8, amp };
  },
  lead(ctx, out, f, t, dur, vel) {
    const amp = ctx.createGain();
    const end = t + dur;
    envelope(amp.gain, t, { peak: 0.13 * vel, attack: 0.01, decay: 0.3, sustain: 0.7, end, release: 0.12 });
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 6, t);
    lp.frequency.setTargetAtTime(f * 3, t, 0.2);
    const vib = osc(ctx, 'sine', 5.5, t);
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(14, t + 0.35);
    vib.connect(vg);
    const a = osc(ctx, 'square', f, t, -5);
    const b = osc(ctx, 'sawtooth', f, t, 6);
    vg.connect(a.detune);
    vg.connect(b.detune);
    a.connect(lp);
    b.connect(lp);
    lp.connect(amp).connect(out);
    return { nodes: [a, b, vib], stop: end + 0.2, amp };
  },
  flute(ctx, out, f, t, dur, vel) {
    const amp = ctx.createGain();
    const end = t + dur;
    envelope(amp.gain, t, { peak: 0.22 * vel, attack: 0.06, decay: 0.4, sustain: 0.8, end, release: 0.15 });
    const vib = osc(ctx, 'sine', 4.8, t);
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(10, t + 0.4);
    vib.connect(vg);
    const a = osc(ctx, 'sine', f, t);
    const b = osc(ctx, 'triangle', f * 2, t);
    const bg = ctx.createGain();
    bg.gain.value = 0.12;
    vg.connect(a.detune);
    a.connect(amp);
    b.connect(bg).connect(amp);
    amp.connect(out);
    return { nodes: [a, b, vib], stop: end + 0.25, amp };
  },
  sub(ctx, out, f, t, dur, vel) {
    const amp = ctx.createGain();
    const end = t + dur;
    envelope(amp.gain, t, { peak: 0.42 * vel, attack: 0.006, decay: 0.6, sustain: 0.75, end, release: 0.08 });
    const a = osc(ctx, 'sine', f, t);
    const b = osc(ctx, 'triangle', f, t);
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    a.connect(amp);
    b.connect(bg).connect(amp);
    amp.connect(out);
    return { nodes: [a, b], stop: end + 0.15, amp };
  },
  synthbass(ctx, out, f, t, dur, vel) {
    const amp = ctx.createGain();
    const end = t + dur;
    envelope(amp.gain, t, { peak: 0.3 * vel, attack: 0.004, decay: 0.3, sustain: 0.6, end, release: 0.07 });
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 7;
    lp.frequency.setValueAtTime(f * 14, t);
    lp.frequency.setTargetAtTime(f * 2.5, t, 0.08);
    const a = osc(ctx, 'sawtooth', f, t);
    const s = osc(ctx, 'sine', f / 2, t);
    const sg = ctx.createGain();
    sg.gain.value = 0.5;
    a.connect(lp).connect(amp);
    s.connect(sg).connect(amp);
    amp.connect(out);
    return { nodes: [a, s], stop: end + 0.12, amp };
  },
  upright(ctx, out, f, t, dur, vel) {
    const amp = ctx.createGain();
    const end = t + dur;
    envelope(amp.gain, t, { peak: 0.45 * vel, attack: 0.004, decay: 0.7, sustain: 0.3, end, release: 0.1 });
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 8, t);
    lp.frequency.setTargetAtTime(f * 2, t, 0.06);
    const a = osc(ctx, 'triangle', f, t);
    const b = osc(ctx, 'sawtooth', f, t);
    const bg = ctx.createGain();
    bg.gain.value = 0.2;
    a.connect(lp);
    b.connect(bg).connect(lp);
    lp.connect(amp).connect(out);
    return { nodes: [a, b], stop: end + 0.15, amp };
  },
};

export class Synth {
  constructor() {
    this.ctx = null;
    this.voices = new Set();
    this.keepAlive = false;
    this.mix = { chords: 0.8, melody: 0.75, bass: 0.8, reverb: 0.28 };
    this.muted = { chords: false, melody: false, bass: false };
  }

  /** À appeler sur un geste de l'utilisateur (obligatoire sur iPhone). */
  ensure() {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.generation = (this.generation ?? 0) + 1;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio indisponible sur ce navigateur');
      // iOS 17+ : joue même quand l'iPhone est en mode silencieux.
      if (navigator.audioSession) {
        try { navigator.audioSession.type = 'playback'; } catch { /* ancien Safari */ }
      }
      // « playback » : réserve audio plus grande sur iPhone, le son ne saute plus au moindre à-coup.
      this.ctx = new AC({ latencyHint: MOBILE ? 'playback' : 'interactive' });
      this.build();
      this.watchInterruptions();
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** iOS coupe le son (appel, notification, Siri) : on relance dès que possible pendant la lecture. */
  watchInterruptions() {
    const ctx = this.ctx;
    ctx.addEventListener('statechange', () => {
      if (this.keepAlive && ctx === this.ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    });
  }

  /**
   * Abandonne le moteur audio actuel. Après un passage en arrière-plan, iOS laisse souvent
   * un contexte audio muet qui se dit « running » : on en recrée un neuf au prochain toucher.
   */
  reset() {
    if (!this.ctx) return;
    const old = this.ctx;
    this.panic();
    this.ctx = null;
    this.voices.clear();
    old.close().catch(() => {});
  }

  build() {
    const { ctx } = this;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = this.mix.reverb;
    this.reverb.connect(this.reverbGain).connect(this.master);
    this.buses = {};
    TRACKS.forEach((track) => {
      const bus = ctx.createGain();
      bus.connect(this.master);
      const send = ctx.createGain();
      send.gain.value = track === 'bass' ? 0.05 : 1;
      bus.connect(send).connect(this.reverb);
      this.buses[track] = bus;
    });
    this.applyMix();
  }

  applyMix() {
    if (!this.ctx) return;
    TRACKS.forEach((track) => {
      this.buses[track].gain.setTargetAtTime(this.muted[track] ? 0 : this.mix[track], this.ctx.currentTime, 0.02);
    });
    this.reverbGain.gain.setTargetAtTime(this.mix.reverb, this.ctx.currentTime, 0.05);
  }

  setMix(mix, muted) {
    this.mix = { ...this.mix, ...mix };
    this.muted = { ...this.muted, ...muted };
    this.applyMix();
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /**
   * Joue une note. choke = { group, token } : au moment où elle démarre, elle étouffe les notes
   * du même groupe venant d'un autre accord (token différent) ou de même hauteur.
   * Avec mono: true, elle étouffe tout le groupe (mélodie, basse : une note à la fois).
   */
  play(track, instrument, midi, when, dur, vel = 0.7, choke = null) {
    if (!this.ctx) return;
    const voice = VOICES[instrument] ?? VOICES.epiano;
    const t = Math.max(when, this.ctx.currentTime);
    if (choke) {
      this.choke((v) => v.group === choke.group && (choke.mono || v.token !== choke.token || v.midi === midi), t);
    }
    const v = voice(this.ctx, this.buses[track], midiToFreq(midi), t, Math.max(0.05, dur), vel);
    v.nodes.forEach((node) => {
      node.start(t);
      node.stop(v.stop);
    });
    const entry = { nodes: v.nodes, stop: v.stop, amp: v.amp, midi, group: choke?.group ?? null, token: choke?.token ?? null };
    this.voices.add(entry);
    if (this.voices.size > MAX_VOICES) this.fade(this.voices.values().next().value, this.ctx.currentTime);
    v.nodes[0].onended = () => this.voices.delete(entry);
  }

  /** Éteint en douceur (≈15 ms, sans clic) les voix choisies, à l'instant t. */
  choke(predicate, t) {
    [...this.voices].filter(predicate).forEach((v) => this.fade(v, t));
  }

  fade(voice, t) {
    if (!voice) return;
    const gain = voice.amp?.gain;
    if (gain) {
      gain.cancelScheduledValues(t);
      gain.setTargetAtTime(0.0001, t, 0.012);
    }
    voice.nodes.forEach((n) => {
      try { n.stop(t + 0.09); } catch { /* déjà arrêtée */ }
    });
    this.voices.delete(voice);
  }

  /** Coupe immédiatement toutes les notes en cours ou programmées. */
  panic() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.voices.forEach((v) => v.nodes.forEach((n) => {
      try { n.stop(t + 0.02); } catch { /* déjà arrêtée */ }
    }));
    this.voices.clear();
  }
}
