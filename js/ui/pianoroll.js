// Piano roll (canvas) : vue d'ensemble des accords et de la basse.
// L'édition se fait dans l'éditeur plein écran (noteEditor.js) ; un toucher ici l'ouvre.
import { arrange, chordStarts, totalBeats } from '../gen/arrange.js';
import { pc } from '../theory/notes.js';
import { scalePitchClasses } from '../theory/scales.js';

const COLORS = {
  T: '#5fd3b0', SD: '#f2c14e', D: '#ff6b5a', sec: '#ff7ab8', borrow: '#a78bfa', rest: '#6f687a',
  bass: '#ffb547', grid: 'rgba(255,244,230,0.06)', bar: 'rgba(255,244,230,0.14)', text: 'rgba(244,237,227,0.75)',
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
    const ry = (height - header) / (hi - lo);
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
      const color = e.track === 'bass' ? COLORS.bass : COLORS[ctx.fn(owner)];
      const active = position != null && position >= e.start && position < e.start + e.dur;
      g.globalAlpha = e.track === 'chords' ? (active ? 0.95 : 0.55) : active ? 1 : 0.85;
      g.fillStyle = color;
      roundRect(g, e.start * bx, y(e.midi) + 0.5, Math.max(2, e.dur * bx - 1), Math.max(2, ry - 1), Math.min(3, ry / 2));
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

  // Un toucher (sans défilement) ouvre l'éditeur de la basse.
  canvas.addEventListener('click', () => ctx.startEdit('bass'));
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
