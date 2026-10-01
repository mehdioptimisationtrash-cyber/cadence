// Piano roll (canvas) : accords, basse et mélodie dans le temps ; édition de la mélodie au doigt.
import { arrange, chordStarts, totalBeats } from '../gen/arrange.js';
import { pc } from '../theory/notes.js';
import { scalePitchClasses } from '../theory/scales.js';

const COLORS = {
  T: '#5fd3b0', SD: '#f2c14e', D: '#ff6b5a', sec: '#ff7ab8', borrow: '#a78bfa',
  melody: '#7ee3ff', bass: '#ffb547', grid: 'rgba(255,244,230,0.06)', bar: 'rgba(255,244,230,0.14)', text: 'rgba(244,237,227,0.75)',
};
const MIN_BEAT_PX = 26;

export function createPianoRoll(canvas, wrap, ctx) {
  const g = canvas.getContext('2d');
  let layout = null;
  let events = [];

  function measure() {
    const s = ctx.state;
    const beats = Math.max(4, totalBeats(s.chords));
    const height = window.matchMedia('(min-width: 1100px)').matches ? 230 : 150;
    const width = Math.max(wrap.clientWidth, beats * MIN_BEAT_PX);
    const notes = events.map((e) => e.midi);
    const lo = Math.min(48, ...notes) - 2;
    const hi = Math.max(84, ...notes) + 2;
    return { beats, width, height, lo, hi, header: 18 };
  }

  function draw(position = null) {
    if (!layout) return;
    const s = ctx.state;
    const { beats, width, height, lo, hi, header } = layout;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    const bx = width / beats;
    const rows = hi - lo;
    const ry = (height - header) / rows;
    const y = (m) => header + (hi - m - 1) * ry;
    const scale = new Set(scalePitchClasses(s.key.root, s.key.scale));

    for (let m = lo; m < hi; m += 1) {
      if (!scale.has(pc(m))) continue;
      g.fillStyle = pc(m) === s.key.root ? 'rgba(255,181,71,0.06)' : 'rgba(255,244,230,0.025)';
      g.fillRect(0, y(m), width, ry);
    }
    const starts = chordStarts(s.chords);
    s.chords.forEach((c, i) => {
      const fn = ctx.fn(c);
      const x = starts[i] * bx;
      const w = c.beats * bx;
      g.fillStyle = `${COLORS[fn]}14`;
      g.fillRect(x, header, w, height - header);
      g.fillStyle = `${COLORS[fn]}55`;
      g.fillRect(x + 1, 3, w - 2, header - 6);
      g.fillStyle = COLORS.text;
      g.font = '600 10px "Bricolage Grotesque", system-ui, sans-serif';
      g.textBaseline = 'middle';
      g.fillText(ctx.label(c), x + 6, header / 2, w - 10);
    });
    for (let b = 0; b <= beats; b += 1) {
      g.fillStyle = b % 4 === 0 ? COLORS.bar : COLORS.grid;
      g.fillRect(Math.round(b * bx), header, 1, height - header);
    }
    events.forEach((e) => {
      const owner = s.chords[e.chord];
      if (e.track === 'chords' && !owner) return; // progression raccourcie, notes pas encore recalculées
      const color = e.track === 'melody' ? COLORS.melody : e.track === 'bass' ? COLORS.bass : COLORS[ctx.fn(owner)];
      const x = e.start * bx;
      const w = Math.max(2, e.dur * bx - 1);
      const active = position != null && position >= e.start && position < e.start + e.dur;
      g.globalAlpha = e.track === 'chords' ? (active ? 0.95 : 0.55) : active ? 1 : 0.85;
      g.fillStyle = color;
      roundRect(g, x, y(e.midi) + 0.5, w, Math.max(2, ry - 1), Math.min(3, ry / 2));
      g.fill();
    });
    g.globalAlpha = 1;
    if (position != null) {
      g.fillStyle = '#fff';
      g.fillRect(position * bx, 0, 1.5, height);
    }
  }

  function refresh() {
    events = arrange(ctx.state);
    layout = measure();
    draw(ctx.player.playing && !ctx.player.previewing ? ctx.player.position() : null);
  }

  function hitTest(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const yy = ev.clientY - rect.top;
    const { beats, width, height, lo, hi, header } = layout;
    if (yy < header) return null;
    const beat = (x / width) * beats;
    const midi = hi - 1 - Math.floor((yy - header) / ((height - header) / (hi - lo)));
    return { beat, midi };
  }

  canvas.addEventListener('pointerdown', (ev) => {
    const s = ctx.state;
    if (!s.ui.editMelody || !layout) return;
    const hit = hitTest(ev);
    if (!hit) return;
    const notes = s.melody.notes;
    const existing = notes.findIndex((n) => hit.beat >= n.start && hit.beat < n.start + n.dur && Math.abs(n.midi - hit.midi) <= 0);
    if (existing >= 0) {
      ctx.set((st) => ({ ...st, melody: { ...st.melody, notes: notes.filter((_, i) => i !== existing) } }));
      return;
    }
    const len = s.ui.noteLength ?? 0.5;
    const start = Math.floor(hit.beat / 0.5) * 0.5;
    if (start >= totalBeats(s.chords)) return;
    let midi = hit.midi;
    if (s.ui.snapScale !== false) {
      const scale = new Set(scalePitchClasses(s.key.root, s.key.scale));
      while (!scale.has(pc(midi))) midi -= 1;
    }
    const note = { midi, start, dur: len * 0.95, vel: 0.78 };
    ctx.set((st) => ({ ...st, melody: { ...st.melody, enabled: true, notes: [...notes, note].sort((a, b) => a.start - b.start) } }));
    ctx.playNotes([midi], 'melody');
  });

  window.addEventListener('resize', () => refresh());
  return { refresh, draw };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
