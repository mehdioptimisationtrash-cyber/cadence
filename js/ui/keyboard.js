// Clavier de piano : affiche la gamme, les notes jouées, et sert de détecteur d'accords.
import { h } from './dom.js';
import { pc, isBlackKey, noteLabel } from '../theory/notes.js';

const BLACK_OFFSET = { 1: 0.62, 3: 0.72, 6: 0.6, 8: 0.68, 10: 0.76 };

/**
 * @param {HTMLElement} container
 * @param {{ low:number, high:number, onPress?: (midi:number, pointer:number)=>void,
 *   onRelease?: (midi:number, pointer:number)=>void, labels?: boolean }} opts
 */
export function createKeyboard(container, {
  low = 48, high = 84, onPress = null, onRelease = null, labels = false,
} = {}) {
  const keys = new Map();
  const whites = [];
  for (let m = low; m <= high; m += 1) if (!isBlackKey(m)) whites.push(m);
  const width = 100 / whites.length;
  const nodes = [];
  whites.forEach((m) => {
    const el = h('div', { class: 'key-w', 'data-midi': m }, labels && pc(m) === 0 ? h('span', { class: 'key-label' }, `C${Math.floor(m / 12) - 1}`) : null);
    keys.set(m, el);
    nodes.push(el);
  });
  for (let m = low; m <= high; m += 1) {
    if (!isBlackKey(m)) continue;
    const whiteIndex = whites.indexOf(m - 1);
    const el = h('div', { class: 'key-b', 'data-midi': m, style: { left: `${(whiteIndex + BLACK_OFFSET[pc(m)]) * width}%`, width: `${width * 0.62}%` } });
    keys.set(m, el);
    nodes.push(el);
  }
  container.replaceChildren(...nodes);
  if (onPress) {
    container.setAttribute('aria-hidden', 'false');
    container.style.touchAction = 'none';
    // Plusieurs doigts à la fois : chaque doigt tient sa touche jusqu'à ce qu'il se lève.
    const held = new Map();
    const release = (e) => {
      const m = held.get(e.pointerId);
      if (m == null) return;
      held.delete(e.pointerId);
      onRelease?.(m, e.pointerId);
    };
    keys.forEach((el, m) => {
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', noteLabel(m));
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try {
          el.setPointerCapture(e.pointerId);
        } catch { /* Safari peut refuser : la touche reste jouable */ }
        held.set(e.pointerId, m);
        onPress(m, e.pointerId);
      });
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
    });
  }

  let classes = new Map();
  return {
    setScale(rootPc, pcs) {
      const set = new Set(pcs);
      keys.forEach((el, m) => {
        el.classList.toggle('in-scale', set.has(pc(m)));
        el.classList.toggle('is-root', pc(m) === rootPc);
      });
    },
    /** notesByTrack : { chords: [...], melody: [...], bass: [...], pick: [...] } */
    light(notesByTrack) {
      const next = new Map();
      Object.entries(notesByTrack).forEach(([track, list]) => list.forEach((m) => {
        let midi = m;
        while (midi < low) midi += 12;
        while (midi > high) midi -= 12;
        next.set(midi, `on-${track}`);
      }));
      classes.forEach((cls, m) => {
        if (next.get(m) !== cls) keys.get(m)?.classList.remove(cls);
      });
      next.forEach((cls, m) => keys.get(m)?.classList.add(cls));
      classes = next;
    },
  };
}
