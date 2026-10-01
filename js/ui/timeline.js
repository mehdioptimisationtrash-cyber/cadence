// Frise de la progression : cartes d'accords, sélection, glisser pour réordonner.
import { h, sym, icon, iconButton, mount, toast } from './dom.js';
import { moveChord, clearProgression, transpose, addChord } from '../actions.js';
import { totalBeats } from '../gen/arrange.js';

const beatsLabel = (b) => (b === 4 ? '1 mes.' : b === 8 ? '2 mes.' : b === 6 ? '1½ mes.' : `${b} t.`);

export function renderStageHead(container, ctx) {
  const s = ctx.state;
  const beats = totalBeats(s.chords);
  const bars = beats / 4;
  mount(container,
    h('span', { class: 'eyebrow' }, 'Progression'),
    h('span', { class: 'meta' }, s.chords.length ? `${s.chords.length} accords · ${Number.isInteger(bars) ? bars : bars.toFixed(1)} mes.` : 'vide'),
    h('div', { class: 'spacer' }),
    iconButton('undo', 'Annuler', () => ctx.store.undo(), { class: 'small', attrs: { disabled: !ctx.store.canUndo() } }),
    iconButton('redo', 'Rétablir', () => ctx.store.redo(), { class: 'small', attrs: { disabled: !ctx.store.canRedo() } }),
    iconButton('arrowLeft', 'Transposer −1 demi-ton', () => ctx.set((st) => transpose(st, -1)), { class: 'small' }),
    iconButton('arrowRight', 'Transposer +1 demi-ton', () => ctx.set((st) => transpose(st, 1)), { class: 'small' }),
    iconButton('trash', 'Tout effacer', () => {
      if (!s.chords.length) return;
      ctx.player.stop();
      ctx.set(clearProgression);
      toast('Progression effacée — ⌘Z pour annuler');
    }, { class: 'small', attrs: { disabled: !s.chords.length } }));
}

function attachDrag(card, grip, index, container, ctx) {
  grip.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const cards = [...container.querySelectorAll('.card')];
    const rects = cards.map((c) => c.getBoundingClientRect());
    const start = { x: ev.clientX, y: ev.clientY };
    let target = index;
    try {
      grip.setPointerCapture(ev.pointerId);
    } catch { /* Safari peut refuser la capture */ }
    card.classList.add('is-dragging');
    const move = (e) => {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      card.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
      const cx = rects[index].left + rects[index].width / 2 + dx;
      const cy = rects[index].top + rects[index].height / 2 + dy;
      target = rects.reduce((best, r, i) => {
        const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
        const bd = Math.hypot(rects[best].left + rects[best].width / 2 - cx, rects[best].top + rects[best].height / 2 - cy);
        return d < bd ? i : best;
      }, index);
      cards.forEach((c, i) => c.classList.toggle('drop-target', i === target && i !== index));
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      card.classList.remove('is-dragging');
      card.style.transform = '';
      if (target !== index) ctx.set((st) => moveChord(st, index, target));
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
}

/**
 * Point d'insertion entre deux cartes : « + » ouvre le choix Accord / Silence.
 * Choisir « Accord » place le curseur d'insertion : les accords touchés dans la palette s'ajoutent ici.
 */
function slot(ctx, index, { end = false } = {}) {
  const s = ctx.state;
  const open = s.ui.slotMenu === index;
  const active = s.ui.insertAt === index;
  if (open) {
    return h('div', { class: `slot-menu${end ? ' is-end' : ''}` },
      h('button', {
        class: 'btn primary',
        onClick: () => ctx.setUi({ slotMenu: null, insertAt: end ? null : index, tab: 'palette' }),
      }, icon('plus'), 'Accord'),
      h('button', {
        class: 'btn',
        onClick: () => {
          ctx.set((st) => ({ ...addChord(st, { rest: true, beats: st.generator.beatsPerChord }, index), ui: { ...st.ui, slotMenu: null } }));
        },
      }, 'Silence'),
      iconButton('close', 'Annuler', () => ctx.setUi({ slotMenu: null }), { class: 'small' }));
  }
  if (end) {
    return h('button', { class: 'card-add', 'aria-label': 'Ajouter à la fin', onClick: () => ctx.setUi({ slotMenu: index }) }, icon('plus'));
  }
  return h('button', {
    class: `slot${active ? ' is-active' : ''}`,
    'aria-label': index === 0 ? 'Insérer au début' : 'Insérer ici',
    title: 'Insérer un accord ou un silence ici',
    onClick: () => ctx.setUi({ slotMenu: index }),
  }, h('span', {}, '+'));
}

export function renderTimeline(container, ctx) {
  const s = ctx.state;
  if (!s.chords.length) {
    mount(container, h('div', { class: 'empty' },
      h('strong', {}, 'Une page blanche.'),
      'Touche un accord de la palette (+), ou laisse le générateur proposer une progression.'),
    slot(ctx, 0, { end: true }));
    return;
  }
  const items = [];
  s.chords.forEach((chord, i) => {
    items.push(slot(ctx, i));
    const fn = ctx.fn(chord);
    const grip = h('span', { class: 'card-grip', 'aria-label': 'Glisser pour déplacer' }, icon('grip'));
    const label = ctx.label(chord);
    const card = h('article', {
      class: `card fn-${fn}${chord.rest ? ' is-rest' : ''}${s.selected === chord.id ? ' is-selected' : ''}`,
      tabindex: 0,
      role: 'button',
      'data-index': i,
      'aria-label': `${label}, ${beatsLabel(chord.beats)}`,
      onClick: () => {
        ctx.set((st) => ({ ...st, selected: st.selected === chord.id ? null : chord.id }), { history: false });
        ctx.auditionAt(i);
      },
      onKeydown: (e) => {
        if (e.key === 'Enter') e.currentTarget.click();
      },
    },
    h('span', { class: 'card-roman' }, ctx.roman(chord)),
    h('span', { class: `card-sym${label.length > 6 ? ' is-long' : ''}` }, chord.rest ? h('span', { class: 'rest-mark' }, '𝄽 ', 'Silence') : sym(label)),
    h('div', { class: 'card-foot' }, h('span', {}, beatsLabel(chord.beats)), grip),
    h('div', { class: 'card-progress' }));
    card.style.setProperty('--w', chord.beats);
    attachDrag(card, grip, i, container, ctx);
    items.push(card);
  });
  items.push(slot(ctx, s.chords.length, { end: true }));
  mount(container, ...items);
}

/** Bandeau affiché pendant une insertion au milieu de la progression. */
export function insertionBanner(ctx) {
  const s = ctx.state;
  const at = s.ui.insertAt;
  if (at == null || at >= s.chords.length) return null;
  const before = s.chords[at - 1];
  const after = s.chords[at];
  const where = before ? `entre ${ctx.label(before)} et ${ctx.label(after)}` : `avant ${ctx.label(after)}`;
  return h('div', { class: 'insert-banner' },
    h('span', {}, icon('plus'), ` Ajout ${where} : touche + sur un accord de la palette`),
    h('button', { class: 'btn', onClick: () => ctx.setUi({ insertAt: null }) }, 'Terminé'));
}

/** Met en lumière l'accord joué (appelé à chaque image pendant la lecture). */
export function paintPlayhead(container, chords, position) {
  const cards = container.querySelectorAll('.card');
  let t = 0;
  cards.forEach((card, i) => {
    const beats = chords[i]?.beats ?? 4;
    const active = position != null && position >= t && position < t + beats;
    card.classList.toggle('is-playing', active);
    const bar = card.querySelector('.card-progress');
    if (bar) bar.style.width = active ? `${((position - t) / beats) * 100}%` : '0';
    t += beats;
  });
}
