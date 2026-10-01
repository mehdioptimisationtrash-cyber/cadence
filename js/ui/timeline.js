// Frise de la progression : cartes d'accords, sélection, glisser pour réordonner.
import { h, sym, icon, iconButton, mount, toast } from './dom.js';
import { moveChord, clearProgression, transpose } from '../actions.js';
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
    grip.setPointerCapture(ev.pointerId);
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

export function renderTimeline(container, ctx, { onAdd }) {
  const s = ctx.state;
  if (!s.chords.length) {
    mount(container, h('div', { class: 'empty' },
      h('strong', {}, 'Une page blanche.'),
      'Touche un accord de la palette (+), ou laisse le générateur proposer une progression.'),
    h('button', { class: 'card-add', 'aria-label': 'Ajouter un accord', onClick: onAdd }, icon('plus')));
    return;
  }
  const cards = s.chords.map((chord, i) => {
    const fn = ctx.fn(chord);
    const grip = h('span', { class: 'card-grip', 'aria-label': 'Glisser pour déplacer' }, icon('grip'));
    const card = h('article', {
      class: `card fn-${fn}${s.selected === chord.id ? ' is-selected' : ''}`,
      tabindex: 0,
      role: 'button',
      'data-index': i,
      'aria-label': `${ctx.label(chord)}, ${beatsLabel(chord.beats)}`,
      onClick: () => {
        ctx.set((st) => ({ ...st, selected: st.selected === chord.id ? null : chord.id }), { history: false });
        ctx.audition(chord);
      },
      onKeydown: (e) => {
        if (e.key === 'Enter') e.currentTarget.click();
      },
    },
    h('span', { class: 'card-roman' }, ctx.roman(chord)),
    h('span', { class: 'card-sym' }, sym(ctx.label(chord))),
    h('div', { class: 'card-foot' }, h('span', {}, beatsLabel(chord.beats)), grip),
    h('div', { class: 'card-progress' }));
    card.style.setProperty('--w', chord.beats);
    attachDrag(card, grip, i, container, ctx);
    return card;
  });
  mount(container, ...cards, h('button', { class: 'card-add', 'aria-label': 'Ajouter un accord', onClick: onAdd }, icon('plus')));
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
