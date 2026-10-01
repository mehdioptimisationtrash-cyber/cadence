// Piano roll (canvas) : accords, basse et mélodie dans le temps.
// En mode édition (mélodie ou basse) : toucher le vide ajoute une note, toucher une note la supprime,
// glisser une note la déplace (hauteur et position).
import { arrange, chordStarts, totalBeats } from '../gen/arrange.js';
import { pc, midiLabel } from '../theory/notes.js';
import { scalePitchClasses } from '../theory/scales.js';
import { trackNotes, setTrackNotes } from '../actions.js';

const COLORS = {
  T: '#5fd3b0', SD: '#f2c14e', D: '#ff6b5a', sec: '#ff7ab8', borrow: '#a78bfa',
  melody: '#7ee3ff', bass: '#ffb547', grid: 'rgba(255,244,230,0.06)', bar: 'rgba(255,244,230,0.14)', text: 'rgba(244,237,227,0.75)',
};
const MIN_BEAT_PX = 26;
const EDIT_BEAT_PX = 44;
// Zone de hauteurs affichée pendant l'édition : assez serrée pour viser une note au doigt.
const EDIT_RANGE = { melody: [55, 88], bass: [28, 60] };
const SNAP = 0.25;
const DRAG_THRESHOLD_PX = 6;

export function createPianoRoll(canvas, wrap, ctx) {
  const g = canvas.getContext('2d');
  let layout = null;
  let events = [];
  let drag = null;

  const desktop = () => window.matchMedia('(min-width: 1100px)').matches;

  function measure() {
    const s = ctx.state;
    const track = s.ui.editTrack ?? null;
    const beats = Math.max(4, totalBeats(s.chords));
    const height = track ? (desktop() ? 320 : 300) : desktop() ? 230 : 150;
    const width = Math.max(wrap.clientWidth, beats * (track ? EDIT_BEAT_PX : MIN_BEAT_PX));
    let lo;
    let hi;
    if (track) {
      const own = trackNotes(s, track).map((n) => n.midi);
      lo = Math.min(EDIT_RANGE[track][0], ...own) - 1;
      hi = Math.max(EDIT_RANGE[track][1], ...own) + 2;
    } else {
      const notes = events.map((e) => e.midi);
      lo = Math.min(48, ...notes) - 2;
      hi = Math.max(84, ...notes) + 2;
    }
    return { beats, width, height, lo, hi, header: 18, track, gutter: track ? 30 : 0 };
  }

  function draw(position = null) {
    if (!layout) return;
    const s = ctx.state;
    const { beats, width, height, lo, hi, header, track, gutter } = layout;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    const bx = (width - gutter) / beats;
    const xb = (b) => gutter + b * bx;
    const ry = (height - header) / (hi - lo);
    const y = (m) => header + (hi - m - 1) * ry;
    const scale = new Set(scalePitchClasses(s.key.root, s.key.scale));

    for (let m = lo; m < hi; m += 1) {
      if (!scale.has(pc(m))) continue;
      g.fillStyle = pc(m) === s.key.root ? 'rgba(255,181,71,0.07)' : 'rgba(255,244,230,0.03)';
      g.fillRect(gutter, y(m), width, ry);
    }
    if (track) {
      for (let m = lo; m < hi; m += 1) {
        g.fillStyle = 'rgba(255,244,230,0.05)';
        g.fillRect(gutter, Math.round(y(m)), width, 0.5);
        if (!scale.has(pc(m))) continue;
        g.fillStyle = pc(m) === s.key.root ? '#ffb547' : 'rgba(244,237,227,0.45)';
        g.font = `${pc(m) === s.key.root ? 700 : 500} 9px "Bricolage Grotesque", system-ui, sans-serif`;
        g.textBaseline = 'middle';
        g.fillText(midiLabel(m, s.notation === 'fr' ? 'fr' : 'en'), 2, y(m) + ry / 2, gutter - 4);
      }
    }
    const starts = chordStarts(s.chords);
    s.chords.forEach((c, i) => {
      const fn = ctx.fn(c);
      const x = xb(starts[i]);
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
    for (let b = 0; b <= beats; b += track ? 0.5 : 1) {
      g.fillStyle = b % 4 === 0 ? COLORS.bar : b % 1 === 0 ? COLORS.grid : 'rgba(255,244,230,0.025)';
      g.fillRect(Math.round(xb(b)), header, 1, height - header);
    }
    events.forEach((e) => {
      if (e.midi < lo || e.midi >= hi) return;
      const owner = s.chords[e.chord];
      if (e.track === 'chords' && !owner) return; // progression raccourcie, notes pas encore recalculées
      const color = e.track === 'melody' ? COLORS.melody : e.track === 'bass' ? COLORS.bass : COLORS[ctx.fn(owner)];
      const active = position != null && position >= e.start && position < e.start + e.dur;
      const edited = track === e.track;
      if (track) g.globalAlpha = edited ? 1 : 0.22;
      else g.globalAlpha = e.track === 'chords' ? (active ? 0.95 : 0.55) : active ? 1 : 0.85;
      g.fillStyle = color;
      roundRect(g, xb(e.start), y(e.midi) + 0.5, Math.max(2, e.dur * bx - 1), Math.max(2, ry - 1), Math.min(4, ry / 2));
      g.fill();
      if (edited) {
        g.strokeStyle = 'rgba(13,11,17,0.55)';
        g.lineWidth = 1;
        g.stroke();
      }
    });
    g.globalAlpha = 1;
    if (position != null) {
      g.fillStyle = '#fff';
      g.fillRect(xb(position), 0, 1.5, height);
    }
  }

  function refresh() {
    events = arrange(ctx.state);
    layout = measure();
    canvas.style.touchAction = layout.track ? 'none' : '';
    draw(ctx.player.playing && !ctx.player.previewing ? ctx.player.position() : null);
  }

  function hitTest(ev) {
    const rect = canvas.getBoundingClientRect();
    const { beats, width, height, lo, hi, header, gutter } = layout;
    const x = Math.max(gutter, ev.clientX - rect.left);
    const yy = Math.max(header, Math.min(height - 1, ev.clientY - rect.top));
    const beat = ((x - gutter) / (width - gutter)) * beats;
    const midi = hi - 1 - Math.floor((yy - header) / ((height - header) / (hi - lo)));
    return { beat, midi, x: ev.clientX, y: ev.clientY };
  }

  function snapToScale(midi, dir = -1) {
    const s = ctx.state;
    if (s.ui.snapScale === false) return midi;
    const scale = new Set(scalePitchClasses(s.key.root, s.key.scale));
    let m = midi;
    for (let i = 0; i < 12 && !scale.has(pc(m)); i += 1) m += dir;
    return m;
  }

  const findNote = (notes, hit) => notes.findIndex((n) => hit.beat >= n.start && hit.beat < n.start + n.dur && n.midi === hit.midi);

  canvas.addEventListener('pointerdown', (ev) => {
    const s = ctx.state;
    const track = s.ui.editTrack;
    if (!track || !layout) return;
    ev.preventDefault();
    const hit = hitTest(ev);
    const notes = trackNotes(s, track);
    const idx = findNote(notes, hit);
    canvas.setPointerCapture(ev.pointerId);
    if (idx >= 0) {
      drag = { track, idx, from: hit, original: notes[idx], preview: notes[idx], moved: false };
      return;
    }
    const end = totalBeats(s.chords);
    const start = Math.floor(hit.beat / 0.5) * 0.5;
    if (start >= end) return;
    const len = s.ui.noteLength ?? (track === 'bass' ? 1 : 0.5);
    const midi = snapToScale(hit.midi);
    const note = { midi, start, dur: Math.min(len, end - start) * 0.95, vel: 0.78 };
    ctx.set((st) => setTrackNotes(st, track, [...trackNotes(st, track), note]));
    ctx.playNotes([midi], track);
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const hit = hitTest(ev);
    if (!drag.moved && Math.hypot(hit.x - drag.from.x, hit.y - drag.from.y) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const s = ctx.state;
    const end = totalBeats(s.chords);
    const dBeat = Math.round((hit.beat - drag.from.beat) / SNAP) * SNAP;
    const dMidi = hit.midi - drag.from.midi;
    const start = Math.max(0, Math.min(end - SNAP, drag.original.start + dBeat));
    const midi = snapToScale(drag.original.midi + dMidi, dMidi >= 0 ? 1 : -1);
    if (midi !== drag.preview.midi) ctx.playNotes([midi], drag.track);
    drag.preview = { ...drag.original, start, midi };
    const notes = trackNotes(s, drag.track).map((n, i) => (i === drag.idx ? drag.preview : n));
    events = arrange(setTrackNotes(s, drag.track, notes));
    draw();
  });

  const endDrag = (ev) => {
    if (!drag) return;
    const { track, idx, preview, moved } = drag;
    drag = null;
    if (ev.type === 'pointercancel') {
      refresh();
      return;
    }
    ctx.set((st) => {
      const notes = trackNotes(st, track);
      return setTrackNotes(st, track, moved ? notes.map((n, i) => (i === idx ? preview : n)) : notes.filter((_, i) => i !== idx));
    });
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

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
