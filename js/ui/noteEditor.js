// Éditeur de notes plein écran (mélodie ou basse), pensé pour le doigt comme pour la souris.
// Gestes : glisser dans le vide = se déplacer · pincer = zoomer · toucher une note = la sélectionner ·
// glisser une note = la déplacer · poignée de droite = la durée · crayon (ou double-toucher) = ajouter.
import { h, icon, iconButton, segmented, mount } from './dom.js';
import { pc, midiLabel, isBlackKey } from '../theory/notes.js';
import { scalePitchClasses } from '../theory/scales.js';
import { chordPitchClasses } from '../theory/chords.js';
import { chordStarts, totalBeats } from '../gen/arrange.js';
import { trackNotes, setTrackNotes } from '../actions.js';
import {
  placeNote, updateNote, removeNote, duplicateNote, stepPitch, snapBeat, floorBeat, findNote, sameNote,
} from '../gen/noteEdit.js';

const RANGES = { melody: [48, 96], bass: [24, 64] };
const KEYS_W = 54;
const RULER_H = 34;
const MOVE_PX = 7;
const DOUBLE_TAP_MS = 320;
const GRIDS = [{ value: 1, label: '1/4' }, { value: 0.5, label: '1/8' }, { value: 0.25, label: '1/16' }];
const FN_COLOR = { T: '#5fd3b0', SD: '#f2c14e', D: '#ff6b5a', sec: '#ff7ab8', borrow: '#a78bfa' };
const TRACK_COLOR = { melody: '#7ee3ff', bass: '#ffb547' };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createNoteEditor(root, ctx) {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const toolbar = h('div', { class: 'ne-toolbar' });
  const stage = h('div', { class: 'ne-stage' });
  const canvas = h('canvas', { class: 'ne-canvas', 'aria-label': 'Grille de notes' });
  const selbar = h('div', { class: 'ne-selbar' });
  const hint = h('div', { class: 'ne-hint' });
  stage.append(canvas, hint);
  root.append(toolbar, stage, selbar);
  const g = canvas.getContext('2d');

  const view = { beatW: touch ? 64 : 56, rowH: touch ? 32 : 24, x: 0, y: 0 };
  let openTrack = null;
  let selected = null;
  let preview = null;
  let gesture = null;
  let dirty = true;
  let lastTap = { t: 0, x: 0, y: 0 };
  const pointers = new Map();

  // --- Données ---
  const state = () => ctx.state;
  const ui = () => state().ui;
  const grid = () => ui().editorGrid ?? 0.5;
  const fold = () => ui().editorFold !== false;
  const pencil = () => Boolean(ui().editorPencil);
  const end = () => Math.max(1, totalBeats(state().chords));
  const notes = () => preview ?? trackNotes(state(), openTrack);
  const scalePcs = () => scalePitchClasses(state().key.root, state().key.scale);

  function rows() {
    const [lo, hi] = RANGES[openTrack];
    const own = trackNotes(state(), openTrack).map((n) => n.midi);
    const top = Math.max(hi, ...own);
    const bottom = Math.min(lo, ...own);
    const set = new Set(scalePcs());
    const list = [];
    for (let m = top; m >= bottom; m -= 1) if (!fold() || set.has(pc(m))) list.push(m);
    return list;
  }
  let rowCache = [];
  const rowOf = (midi) => {
    const exact = rowCache.indexOf(midi);
    if (exact >= 0) return exact;
    return rowCache.reduce((best, m, i) => (Math.abs(m - midi) < Math.abs(rowCache[best] - midi) ? i : best), 0);
  };

  // --- Géométrie ---
  const size = () => ({ w: stage.clientWidth, hgt: stage.clientHeight });
  const x = (beat) => KEYS_W + beat * view.beatW - view.x;
  const y = (row) => RULER_H + row * view.rowH - view.y;
  const beatAt = (px) => (px - KEYS_W + view.x) / view.beatW;
  const rowAt = (py) => Math.floor((py - RULER_H + view.y) / view.rowH);

  function clampView() {
    const { w, hgt } = size();
    view.beatW = clamp(view.beatW, 18, 220);
    view.rowH = clamp(view.rowH, 14, 64);
    view.x = clamp(view.x, 0, Math.max(0, end() * view.beatW - (w - KEYS_W) + 40));
    view.y = clamp(view.y, 0, Math.max(0, rowCache.length * view.rowH - (hgt - RULER_H)));
  }

  function zoomAt(cx, cy, fx, fy, base = view) {
    const beat = (cx - KEYS_W + base.x) / base.beatW;
    const row = (cy - RULER_H + base.y) / base.rowH;
    view.beatW = clamp(base.beatW * fx, 18, 220);
    view.rowH = clamp(base.rowH * fy, 14, 64);
    view.x = KEYS_W + beat * view.beatW - cx;
    view.y = row * view.rowH - (cy - RULER_H);
    clampView();
    dirty = true;
  }

  function centerOnNotes() {
    rowCache = rows();
    const list = trackNotes(state(), openTrack);
    const { hgt } = size();
    const mid = list.length ? list.reduce((s, n) => s + n.midi, 0) / list.length : (RANGES[openTrack][0] + RANGES[openTrack][1]) / 2;
    view.x = 0;
    view.y = rowOf(Math.round(mid)) * view.rowH - (hgt - RULER_H) / 2;
    clampView();
  }

  // --- Dessin ---
  function paint(position = null) {
    if (!openTrack) return;
    if (!dirty && position == null) return;
    dirty = false;
    const { w, hgt } = size();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${hgt}px`;
    }
    const s = state();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#100d15';
    g.fillRect(0, 0, w, hgt);
    const total = end();
    const starts = chordStarts(s.chords);
    const root = s.key.root;
    const firstRow = Math.max(0, rowAt(RULER_H));
    const lastRow = Math.min(rowCache.length - 1, rowAt(hgt));

    // Lignes de hauteur, avec les notes de l'accord en cours teintées.
    for (let r = firstRow; r <= lastRow; r += 1) {
      const m = rowCache[r];
      g.fillStyle = !fold() && isBlackKey(m) ? '#0c0a10' : r % 2 ? '#15111b' : '#130f18';
      if (pc(m) === root) g.fillStyle = '#1d1720';
      g.fillRect(KEYS_W, y(r), w, view.rowH);
    }
    s.chords.forEach((c, i) => {
      const tones = new Set(chordPitchClasses(c));
      const color = FN_COLOR[ctx.fn(c)];
      const x0 = Math.max(KEYS_W, x(starts[i]));
      const x1 = x(starts[i] + c.beats);
      if (x1 < KEYS_W || x0 > w) return;
      g.fillStyle = `${color}1c`;
      for (let r = firstRow; r <= lastRow; r += 1) if (tones.has(pc(rowCache[r]))) g.fillRect(x0, y(r), x1 - x0, view.rowH);
    });
    for (let r = firstRow; r <= lastRow + 1; r += 1) {
      g.fillStyle = 'rgba(255,244,230,0.05)';
      g.fillRect(KEYS_W, Math.round(y(r)), w, 1);
    }
    // Grille temporelle.
    const step = grid();
    for (let b = Math.max(0, floorBeat(beatAt(KEYS_W), step)); b <= Math.min(total, beatAt(w)); b += step) {
      const px = Math.round(x(b));
      g.fillStyle = b % 4 === 0 ? 'rgba(255,244,230,0.22)' : b % 1 === 0 ? 'rgba(255,244,230,0.09)' : 'rgba(255,244,230,0.035)';
      g.fillRect(px, RULER_H, 1, hgt);
    }
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(x(total), RULER_H, w, hgt);

    // Repère : l'autre piste en fantôme.
    const other = openTrack === 'melody' ? 'bass' : 'melody';
    g.globalAlpha = 0.22;
    g.fillStyle = TRACK_COLOR[other];
    trackNotes(s, other).forEach((n) => {
      const r = rowOf(n.midi);
      if (rowCache[r] !== n.midi && fold() && Math.abs(rowCache[r] - n.midi) > 2) return;
      rounded(x(n.start), y(r) + view.rowH * 0.3, n.dur * view.beatW, view.rowH * 0.4, 3);
      g.fill();
    });
    g.globalAlpha = 1;

    // Notes de la piste éditée.
    const color = TRACK_COLOR[openTrack];
    g.font = `600 ${Math.min(12, view.rowH * 0.42)}px "Bricolage Grotesque", system-ui, sans-serif`;
    g.textBaseline = 'middle';
    notes().forEach((n) => {
      const r = rowOf(n.midi);
      const nx = x(n.start);
      const nw = Math.max(6, n.dur * view.beatW - 2);
      if (nx > w || nx + nw < KEYS_W) return;
      const isSel = sameNote(n, selected);
      const ny = y(r) + 2;
      const nh = view.rowH - 4;
      g.fillStyle = isSel ? '#ffffff' : color;
      rounded(nx + 1, ny, nw, nh, Math.min(7, nh / 2));
      g.fill();
      if (nw > 34 && nh > 14) {
        g.fillStyle = '#0d0b11';
        g.fillText(midiLabel(n.midi, s.notation), nx + 8, ny + nh / 2, nw - 14);
      }
      if (isSel) {
        g.fillStyle = color;
        rounded(nx + nw - 6, ny + nh * 0.2, 5, nh * 0.6, 2);
        g.fill();
      }
    });

    // Tête de lecture.
    if (position != null) {
      g.fillStyle = '#fff';
      g.fillRect(x(position), RULER_H, 2, hgt);
    }

    // Règle : mesures et accords.
    g.fillStyle = '#0d0b11';
    g.fillRect(0, 0, w, RULER_H);
    s.chords.forEach((c, i) => {
      const x0 = x(starts[i]);
      const cw = c.beats * view.beatW;
      if (x0 + cw < KEYS_W || x0 > w) return;
      const col = FN_COLOR[ctx.fn(c)];
      g.fillStyle = `${col}33`;
      g.fillRect(Math.max(KEYS_W, x0 + 1), 4, cw - 2, RULER_H - 8);
      g.fillStyle = col;
      g.fillRect(Math.max(KEYS_W, x0 + 1), RULER_H - 6, cw - 2, 2);
      g.fillStyle = '#f4ede3';
      g.font = '600 12px "Bricolage Grotesque", system-ui, sans-serif';
      g.fillText(ctx.label(c), Math.max(KEYS_W + 4, x0 + 7), RULER_H / 2 - 1, cw - 12);
    });

    // Colonne de touches (à gauche, par-dessus).
    g.fillStyle = '#0d0b11';
    g.fillRect(0, RULER_H, KEYS_W, hgt);
    for (let r = firstRow; r <= lastRow; r += 1) {
      const m = rowCache[r];
      const black = !fold() && isBlackKey(m);
      g.fillStyle = black ? '#26212d' : '#ece6dc';
      g.fillRect(2, y(r) + 1, KEYS_W - 6, view.rowH - 2);
      g.fillStyle = pc(m) === root ? '#d9861a' : black ? '#a69fae' : '#4a4352';
      g.font = `${pc(m) === root ? 700 : 600} ${Math.min(11, view.rowH * 0.4)}px "Bricolage Grotesque", system-ui, sans-serif`;
      g.fillText(midiLabel(m, s.notation), 8, y(r) + view.rowH / 2, KEYS_W - 12);
    }
    g.fillStyle = '#0d0b11';
    g.fillRect(0, 0, KEYS_W, RULER_H);
  }

  function rounded(rx, ry, rw, rh, rad) {
    const r = Math.min(rad, rw / 2, rh / 2);
    g.beginPath();
    g.moveTo(rx + r, ry);
    g.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
    g.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
    g.arcTo(rx, ry + rh, rx, ry, r);
    g.arcTo(rx, ry, rx + rw, ry, r);
    g.closePath();
  }

  // --- Modifications (une étape d'annulation par geste) ---
  const commit = (list, nextSelected) => {
    preview = null;
    selected = nextSelected;
    ctx.set((st) => setTrackNotes(st, openTrack, list));
  };
  const audition = (midi) => ctx.playNotes([midi], openTrack);
  const newLength = () => (openTrack === 'bass' ? Math.max(grid(), 1) : Math.max(grid(), 0.5));

  function addAt(px, py) {
    const r = clamp(rowAt(py), 0, rowCache.length - 1);
    const start = floorBeat(beatAt(px), grid());
    if (start < 0 || start >= end()) return null;
    return { midi: rowCache[r], start, dur: newLength(), vel: 0.8 };
  }

  function noteAtPoint(px, py) {
    const pad = touch ? 8 : 3;
    const list = notes();
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const n = list[i];
      const r = rowOf(n.midi);
      const nx = x(n.start);
      const nw = Math.max(6, n.dur * view.beatW);
      if (px >= nx - pad && px <= nx + nw + pad && py >= y(r) && py < y(r) + view.rowH) {
        const onHandle = sameNote(n, selected) && px >= nx + nw - (touch ? 22 : 12);
        return { note: n, onHandle };
      }
    }
    return null;
  }

  const local = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (!openTrack) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      preview = null;
      const [a, b] = [...pointers.values()];
      gesture = {
        type: 'pinch', base: { ...view }, dx: Math.abs(a.px - b.px), dy: Math.abs(a.py - b.py), cx: (a.px + b.px) / 2, cy: (a.py + b.py) / 2,
      };
      dirty = true;
      return;
    }
    if (pointers.size > 2) return;
    if (p.px < KEYS_W && p.py > RULER_H) {
      const r = rowAt(p.py);
      if (rowCache[r] != null) audition(rowCache[r]);
      gesture = { type: 'pan', from: p, base: { ...view }, moved: true };
      return;
    }
    const hit = p.py > RULER_H ? noteAtPoint(p.px, p.py) : null;
    if (hit) {
      const wasSelected = sameNote(hit.note, selected);
      selected = hit.note;
      gesture = { type: hit.onHandle ? 'resize' : 'press', from: p, note: hit.note, row: rowOf(hit.note.midi), moved: false, wasSelected };
      if (!wasSelected) audition(hit.note.midi);
      sync();
      return;
    }
    if (pencil() && p.py > RULER_H) {
      const note = addAt(p.px, p.py);
      if (note) {
        preview = placeNote(trackNotes(state(), openTrack), note, end()).notes;
        gesture = { type: 'create', from: p, note };
        audition(note.midi);
        dirty = true;
      }
      return;
    }
    gesture = { type: 'pan', from: p, base: { ...view }, moved: false };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (gesture.type === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const fx = (Math.abs(a.px - b.px) + 60) / (gesture.dx + 60);
      const fy = (Math.abs(a.py - b.py) + 60) / (gesture.dy + 60);
      const cx = (a.px + b.px) / 2;
      const cy = (a.py + b.py) / 2;
      zoomAt(gesture.cx, gesture.cy, fx, fy, gesture.base);
      view.x -= cx - gesture.cx;
      view.y -= cy - gesture.cy;
      clampView();
      return;
    }
    const dx = p.px - gesture.from.px;
    const dy = p.py - gesture.from.py;
    if (!gesture.moved && Math.hypot(dx, dy) < MOVE_PX) return;
    gesture.moved = true;
    const base = trackNotes(state(), openTrack);
    if (gesture.type === 'pan') {
      view.x = gesture.base.x - dx;
      view.y = gesture.base.y - dy;
      clampView();
      dirty = true;
    } else if (gesture.type === 'press') {
      const dBeat = snapBeat(dx / view.beatW, grid());
      const row = clamp(gesture.row + Math.round(dy / view.rowH), 0, rowCache.length - 1);
      const patch = { start: Math.max(0, gesture.note.start + dBeat), midi: rowCache[row] };
      const res = updateNote(base, gesture.note, patch, end());
      if (res.note && res.note.midi !== (gesture.last ?? gesture.note).midi) audition(res.note.midi);
      gesture.last = res.note;
      preview = res.notes;
      selected = res.note;
      dirty = true;
    } else {
      // Poignée de durée, ou glisser juste après avoir posé une note au crayon.
      const len = Math.max(grid(), snapBeat(beatAt(p.px) - gesture.note.start, grid()));
      const res = gesture.type === 'create'
        ? placeNote(base, { ...gesture.note, dur: len }, end())
        : updateNote(base, gesture.note, { dur: len }, end());
      preview = res.notes;
      selected = res.note;
      gesture.last = res.note;
      dirty = true;
    }
  });

  const finish = (e) => {
    pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.type === 'pinch') {
      if (pointers.size === 0) gesture = null;
      return;
    }
    const gst = gesture;
    gesture = null;
    if (e.type === 'pointercancel') {
      preview = null;
      dirty = true;
      return;
    }
    const p = local(e);
    if (gst.type === 'pan' && !gst.moved) {
      const now = performance.now();
      const isDouble = now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(p.px - lastTap.px, p.py - lastTap.py) < 24;
      lastTap = { t: now, px: p.px, py: p.py };
      if (isDouble && p.py > RULER_H) {
        const note = addAt(p.px, p.py);
        if (note) {
          const res = placeNote(trackNotes(state(), openTrack), note, end());
          audition(note.midi);
          commit(res.notes, res.note);
        }
        lastTap = { t: 0, px: 0, py: 0 };
      } else {
        selected = null;
        sync();
      }
      return;
    }
    if (gst.type === 'create') {
      const res = placeNote(trackNotes(state(), openTrack), gst.last ?? gst.note, end());
      commit(res.notes, res.note);
      return;
    }
    if ((gst.type === 'press' || gst.type === 'resize') && gst.moved && preview) {
      commit(preview, gst.last ?? selected);
      return;
    }
    preview = null;
    dirty = true;
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  canvas.addEventListener('wheel', (e) => {
    if (!openTrack) return;
    e.preventDefault();
    const p = local(e);
    if (e.ctrlKey || e.metaKey) {
      const f = Math.exp(-e.deltaY * 0.01);
      zoomAt(p.px, p.py, f, e.altKey ? f : 1);
      return;
    }
    view.x += e.shiftKey ? e.deltaY : e.deltaX;
    view.y += e.shiftKey ? 0 : e.deltaY;
    clampView();
    dirty = true;
  }, { passive: false });

  // --- Actions sur la note sélectionnée ---
  function editSelected(patchFn) {
    if (!selected) return;
    const base = trackNotes(state(), openTrack);
    const patch = patchFn(selected);
    const res = updateNote(base, selected, patch, end());
    if (!res.note) return;
    if (patch.midi != null) audition(res.note.midi);
    commit(res.notes, res.note);
  }
  const actions = {
    remove() {
      if (!selected) return;
      commit(removeNote(trackNotes(state(), openTrack), selected), null);
    },
    duplicate() {
      if (!selected) return;
      const res = duplicateNote(trackNotes(state(), openTrack), selected, end());
      commit(res.notes, res.note);
    },
    pitch(dir) {
      editSelected((n) => ({ midi: clamp(stepPitch(n.midi, dir, fold() ? scalePcs() : null), 0, 127) }));
    },
    octave(dir) {
      editSelected((n) => ({ midi: clamp(n.midi + 12 * dir, 0, 127) }));
    },
    length(dir) {
      editSelected((n) => ({ dur: Math.max(grid(), n.dur + dir * grid()) }));
    },
    nudge(dir) {
      editSelected((n) => ({ start: Math.max(0, n.start + dir * grid()) }));
    },
  };

  // --- Barres d'outils ---
  function renderToolbar() {
    const s = state();
    const playing = ctx.player.playing;
    mount(toolbar,
      h('div', { class: 'ne-row' },
        h('button', { class: 'btn primary ne-done', onClick: () => ctx.startEdit(null) }, 'Terminé'),
        segmented([{ value: 'melody', label: 'Mélodie' }, { value: 'bass', label: 'Basse' }], openTrack, (t) => ctx.startEdit(t), { label: 'Piste' }),
        h('div', { class: 'spacer' }),
        iconButton('undo', 'Annuler (⌘Z)', () => ctx.store.undo(), { attrs: { disabled: !ctx.store.canUndo() } }),
        iconButton('redo', 'Rétablir (⇧⌘Z)', () => ctx.store.redo(), { attrs: { disabled: !ctx.store.canRedo() } }),
        h('button', { class: `play-btn small${playing ? ' is-playing' : ''}`, 'aria-label': playing ? 'Arrêter' : 'Lire', onClick: () => ctx.player.toggle(ctx.state) }, icon(playing ? 'stop' : 'play'))),
      h('div', { class: 'ne-row' },
        h('button', {
          class: `ne-pencil${pencil() ? ' is-on' : ''}`, 'aria-pressed': String(pencil()), title: 'Crayon : toucher la grille ajoute une note (P)',
          onClick: () => ctx.setUi({ editorPencil: !pencil() }),
        }, icon('edit'), pencil() ? 'Crayon actif' : 'Crayon'),
        h('span', { class: 'ne-label' }, 'Grille'),
        segmented(GRIDS, grid(), (editorGrid) => ctx.setUi({ editorGrid }), { label: 'Grille' }),
        h('button', {
          class: 'pill', 'aria-pressed': String(fold()), title: 'N’afficher que les notes de la gamme',
          onClick: () => {
            ctx.setUi({ editorFold: !fold() });
            requestAnimationFrame(centerOnNotes);
          },
        }, 'Gamme seule'),
        h('div', { class: 'ne-zoom' },
          iconButton('minus', 'Dézoomer', () => { const { w, hgt } = size(); zoomAt(w / 2, hgt / 2, 0.8, 0.88); }, { class: 'small' }),
          iconButton('plus', 'Zoomer', () => { const { w, hgt } = size(); zoomAt(w / 2, hgt / 2, 1.25, 1.14); }, { class: 'small' }))));
    hint.textContent = trackNotes(s, openTrack).length === 0
      ? (pencil() ? 'Touche la grille pour poser une note.' : 'Active le crayon (ou touche deux fois la grille) pour poser une note.')
      : '';
    hint.hidden = !hint.textContent;
  }

  function renderSelbar() {
    const s = state();
    const current = selected && findNote(trackNotes(s, openTrack), selected) >= 0 ? selected : null;
    selected = current;
    selbar.classList.toggle('is-on', Boolean(current));
    if (!current) {
      mount(selbar, h('p', { class: 'ne-help' }, touch
        ? 'Glisse pour te déplacer · pince pour zoomer · touche une note pour la sélectionner'
        : 'Molette pour défiler · ⌘ + molette pour zoomer · clic pour sélectionner · P = crayon'));
      return;
    }
    const lenLabel = `${+current.dur.toFixed(2)} t`;
    const btn = (label, name, fn, cls = '') => h('button', { class: `ne-act ${cls}`, onClick: fn, title: label, 'aria-label': label }, icon(name), h('span', {}, label));
    mount(selbar,
      h('div', { class: 'ne-sel-title' }, h('b', {}, midiLabel(current.midi, s.notation)), h('span', {}, lenLabel)),
      h('div', { class: 'ne-actions' },
        btn('Plus bas', 'arrowDown', () => actions.pitch(-1)),
        btn('Plus haut', 'arrowUp', () => actions.pitch(1)),
        btn('Octave −', 'minus', () => actions.octave(-1)),
        btn('Octave +', 'plus', () => actions.octave(1)),
        btn('Plus courte', 'arrowLeft', () => actions.length(-1)),
        btn('Plus longue', 'arrowRight', () => actions.length(1)),
        btn('Dupliquer', 'copy', actions.duplicate),
        btn('Supprimer', 'trash', actions.remove, 'danger')));
  }

  function sync() {
    const s = state();
    const track = s.ui.editTrack ?? null;
    const opening = track && track !== openTrack;
    root.classList.toggle('is-open', Boolean(track));
    document.body.classList.toggle('editor-open', Boolean(track));
    if (!track) {
      openTrack = null;
      selected = null;
      preview = null;
      return;
    }
    openTrack = track;
    rowCache = rows();
    if (opening) {
      selected = null;
      requestAnimationFrame(() => {
        centerOnNotes();
        dirty = true;
      });
    }
    clampView();
    renderToolbar();
    renderSelbar();
    dirty = true;
  }

  /** Clavier du Mac. Renvoie true si la touche a été traitée par l'éditeur. */
  function handleKey(e) {
    if (!openTrack) return false;
    const meta = e.metaKey || e.ctrlKey;
    if (e.code === 'Space' || (meta && e.key.toLowerCase() === 'z')) return false;
    if (e.key === 'Escape') {
      if (selected) {
        selected = null;
        sync();
      } else ctx.startEdit(null);
    } else if (e.key === 'Backspace' || e.key === 'Delete') actions.remove();
    else if (e.key === 'ArrowUp') e.shiftKey ? actions.octave(1) : actions.pitch(1);
    else if (e.key === 'ArrowDown') e.shiftKey ? actions.octave(-1) : actions.pitch(-1);
    else if (e.key === 'ArrowLeft') e.shiftKey ? actions.length(-1) : actions.nudge(-1);
    else if (e.key === 'ArrowRight') e.shiftKey ? actions.length(1) : actions.nudge(1);
    else if (meta && e.key.toLowerCase() === 'd') actions.duplicate();
    else if (e.key.toLowerCase() === 'p') ctx.setUi({ editorPencil: !pencil() });
    else return true;
    e.preventDefault();
    return true;
  }

  window.addEventListener('resize', () => {
    clampView();
    dirty = true;
  });

  return {
    sync,
    paint,
    handleKey,
    isOpen: () => Boolean(openTrack),
  };
}

