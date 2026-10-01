// Barre du haut : tonalité, tempo, lecture, boucle, annuler/rétablir.
import { h, icon, iconButton, mount } from './dom.js';

const LOGO = `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb547"/><stop offset="1" stop-color="#ff6b5a"/></linearGradient></defs><rect x="2" y="2" width="28" height="28" rx="9" fill="url(#lg)"/><rect x="8" y="17" width="3.4" height="8" rx="1.7" fill="#1d1305"/><rect x="14.3" y="11" width="3.4" height="14" rx="1.7" fill="#1d1305"/><rect x="20.6" y="7" width="3.4" height="18" rx="1.7" fill="#1d1305"/></svg>`;

export function renderTopbar(container, ctx, { openKeySheet }) {
  const s = ctx.state;
  const tempoInput = h('input', { type: 'number', min: 40, max: 220, value: s.tempo, inputmode: 'numeric', 'aria-label': 'Tempo (BPM)' });
  const setTempo = (v) => {
    const tempo = Math.max(40, Math.min(220, Math.round(Number(v) || s.tempo)));
    ctx.set((st) => ({ ...st, tempo }), { history: false });
  };
  tempoInput.addEventListener('change', () => setTempo(tempoInput.value));
  const playing = ctx.player.playing;

  mount(container,
    h('div', { class: 'brand', html: LOGO }, h('span', { class: 'brand-name' }, 'Cadence')),
    h('button', { class: 'key-pill', onClick: openKeySheet, 'aria-label': `Tonalité : ${ctx.keyName()}. Changer` },
      h('span', { class: 'k-label' }, 'Tonalité'),
      h('span', { class: 'k-value' }, ctx.keyName())),
    h('div', { class: 'spacer' }),
    h('div', { class: 'tempo hide-mobile-tempo' },
      iconButton('minus', 'Ralentir', () => setTempo(s.tempo - 2), { class: 'small' }),
      tempoInput,
      h('small', {}, 'bpm'),
      iconButton('plus', 'Accélérer', () => setTempo(s.tempo + 2), { class: 'small' })),
    iconButton('undo', 'Annuler (⌘Z)', () => ctx.store.undo(), { class: 'hide-mobile', attrs: { disabled: !ctx.store.canUndo() } }),
    iconButton('redo', 'Rétablir (⇧⌘Z)', () => ctx.store.redo(), { class: 'hide-mobile', attrs: { disabled: !ctx.store.canRedo() } }),
    iconButton('loop', 'Lecture en boucle', () => ctx.set((st) => ({ ...st, loop: !st.loop }), { history: false }), {
      class: 'hide-mobile', attrs: { 'aria-pressed': String(s.loop) },
    }),
    h('button', {
      class: `play-btn${playing ? ' is-playing' : ''}`,
      'aria-label': playing ? 'Arrêter (espace)' : 'Lire (espace)',
      onClick: () => ctx.player.toggle(ctx.state),
    }, icon(playing ? 'stop' : 'play')));
}
