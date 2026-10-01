// Choix de la tonalité : cercle des quintes, tonique, gamme / mode.
import { h, sym, icon, iconButton, mount, section, toggle } from './dom.js';
import { SCALES, getScale, isMinorScale } from '../theory/scales.js';
import { diatonicChords, chordFunction } from '../theory/harmony.js';
import { setKey } from '../actions.js';

const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const FN_COLOR = { T: '#5fd3b0', SD: '#f2c14e', D: '#ff6b5a', sec: '#ff7ab8', borrow: '#a78bfa' };
const SVG = 'http://www.w3.org/2000/svg';

function svg(tag, attrs, ...children) {
  const el = document.createElementNS(SVG, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  children.forEach((c) => el.append(c));
  return el;
}

function arc(cx, cy, r1, r2, a0, a1) {
  const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x1, y1] = p(r2, a0);
  const [x2, y2] = p(r2, a1);
  const [x3, y3] = p(r1, a1);
  const [x4, y4] = p(r1, a0);
  return `M${x1} ${y1}A${r2} ${r2} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 0 0 ${x4} ${y4}Z`;
}

/** Cercle des quintes : anneau extérieur = majeures, intérieur = mineures relatives. */
function circleOfFifths(ctx, heard, onPick) {
  const s = ctx.state;
  const minorKey = isMinorScale(getScale(s.key.scale));
  const tonicMajor = minorKey ? (s.key.root + 3) % 12 : s.key.root;
  const diatonic = diatonicChords(s.key, 3);
  const fnOf = (root, minor) => {
    const c = diatonic.find((d) => d.root === root && (minor ? ['min', 'dim'].includes(d.quality) : d.quality === 'maj'));
    return c ? chordFunction(c, s.key) : null;
  };
  const root = svg('svg', { viewBox: '0 0 300 300', class: 'circle', role: 'img', 'aria-label': 'Cercle des quintes' });
  const step = (Math.PI * 2) / 12;
  FIFTHS.forEach((maj, i) => {
    const a0 = -Math.PI / 2 + (i - 0.5) * step;
    const a1 = a0 + step;
    const minor = (maj + 9) % 12;
    const isKey = maj === tonicMajor;
    [[maj, false, 104, 146], [minor, true, 62, 102]].forEach(([p, isMin, r1, r2]) => {
      const fn = fnOf(p, isMin);
      const current = isKey && isMin === minorKey;
      const isHeard = heard && heard.root === p && (heard.scale === 'minor') === isMin;
      const path = svg('path', {
        d: arc(150, 150, r1, r2, a0 + 0.012, a1 - 0.012),
        fill: fn ? `${FN_COLOR[fn]}${current ? 'ff' : '40'}` : '#1a1621',
        stroke: isHeard ? '#ffb547' : current ? '#f4ede3' : 'rgba(255,244,230,0.08)',
        'stroke-width': isHeard ? 3 : current ? 2 : 1,
        class: isMin ? 'seg-minor' : 'seg-major',
        tabindex: 0,
        role: 'button',
        'aria-label': `Écouter ${ctx.note(p)} ${isMin ? 'mineur' : 'majeur'}`,
      });
      const pick = () => onPick(p, isMin ? 'minor' : 'major');
      path.addEventListener('click', pick);
      path.addEventListener('keydown', (e) => e.key === 'Enter' && pick());
      const mid = (a0 + a1) / 2;
      const r = (r1 + r2) / 2;
      const label = svg('text', {
        x: 150 + r * Math.cos(mid), y: 150 + r * Math.sin(mid) + (isMin ? 4 : 6),
        'text-anchor': 'middle', 'font-size': isMin ? 13 : 18,
        fill: current ? '#0d0b11' : fn ? '#f4ede3' : '#6f687a',
      });
      // Altération en petit exposant (la police d'affichage n'a pas de ♭/♯), puis retour à la ligne de base.
      const lift = isMin ? 3 : 5;
      let raised = false;
      `${ctx.note(p)}${isMin ? 'm' : ''}`.split(/([♭♯])/).filter(Boolean).forEach((part) => {
        const acc = /[♭♯]/.test(part);
        const span = svg('tspan', acc
          ? { 'font-family': 'Bricolage Grotesque, system-ui, sans-serif', 'font-size': isMin ? 9 : 12, dy: -lift, dx: 0.5 }
          : { dy: raised ? lift : 0 });
        span.textContent = part;
        label.append(span);
        raised = acc;
      });
      root.append(path, label);
    });
  });
  const center = svg('text', { x: 150, y: 156, 'text-anchor': 'middle', 'font-size': 15, fill: '#a69fae', 'font-style': 'italic' });
  center.textContent = 'quintes';
  root.append(center);
  return root;
}

// Case de la roue écoutée en dernier (gardée quand la feuille se redessine).
let heard = null;
let timers = [];

function playLater(steps) {
  timers.forEach(clearTimeout);
  timers = steps.map(([ms, fn]) => setTimeout(fn, ms));
}

// Cadence I–IV–V7–I (ou i–iv–V7–i) : fait entendre la couleur d'une tonalité en 2 secondes.
function cadenceOf(root, scale) {
  const minor = scale === 'minor';
  return [
    { root, quality: minor ? 'min' : 'maj' },
    { root: (root + 5) % 12, quality: minor ? 'min' : 'maj' },
    { root: (root + 7) % 12, quality: '7' },
    { root, quality: minor ? 'min' : 'maj' },
  ];
}

function heardCard(ctx, apply) {
  if (!heard) return h('p', { class: 'panel-sub circle-hint' }, 'Touche une case de la roue pour entendre son accord.');
  const name = `${ctx.note(heard.root)} ${heard.scale === 'minor' ? 'mineur' : 'majeur'}`;
  const isCurrent = ctx.state.key.root === heard.root && ctx.state.key.scale === heard.scale;
  const listen = () => playLater(cadenceOf(heard.root, heard.scale).map((c, i) => [i * 620, () => ctx.audition(c)]));
  return h('div', { class: 'heard' },
    h('div', { class: 'heard-name' }, sym(name)),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onClick: listen }, icon('play'), 'Entendre la tonalité'),
      isCurrent
        ? h('span', { class: 'heard-current' }, 'Tonalité actuelle')
        : h('button', { class: 'btn primary', onClick: () => apply(heard.root, heard.scale) }, 'Choisir')));
}

function playScale(ctx, root, scaleId) {
  const notes = [...getScale(scaleId).iv, 12].map((iv) => 60 + root + iv);
  playLater(notes.map((m, i) => [i * 190, () => ctx.playNotes([m], 'melody')]));
}

export function renderKeySheet(container, ctx, { close }) {
  const s = ctx.state;
  const rerender = () => renderKeySheet(container, ctx, { close });
  const opts = s.ui.keyOptions ?? { transposeAll: true, adaptMode: true };
  const apply = (root, scale) => {
    ctx.set((st) => setKey(st, { root, scale }, opts));
    const next = ctx.state;
    if (ctx.player.playing) ctx.player.update(next);
  };
  const groups = [...new Set(SCALES.map((x) => x.group))];
  mount(container,
    h('div', { class: 'sheet-head' },
      h('h2', { class: 'panel-title' }, 'Tonalité · ', h('em', {}, ctx.keyName())),
      iconButton('close', 'Fermer', close)),
    h('div', { class: 'key-layout' },
      h('div', {},
        circleOfFifths(ctx, heard, (root, scale) => {
          heard = { root, scale };
          ctx.audition({ root, quality: scale === 'minor' ? 'min' : 'maj' });
          rerender();
        }),
        heardCard(ctx, apply),
        section('Tonique', null, h('div', { class: 'note-grid' }, Array.from({ length: 12 }, (_, p) => h('button', {
          'aria-pressed': String(p === s.key.root),
          onClick: () => apply(p, s.key.scale),
        }, ctx.note(p))))),
        h('div', { class: 'section' },
          toggle('Transposer la progression', opts.transposeAll, (transposeAll) => ctx.setUi({ keyOptions: { ...opts, transposeAll } }), 'les accords suivent la nouvelle tonique'),
          toggle('Adapter au nouveau mode', opts.adaptMode, (adaptMode) => ctx.setUi({ keyOptions: { ...opts, adaptMode } }), 'I–V–vi–IV devient i–v–VI–iv en mineur'))),
      h('div', {}, groups.map((gname) => section(gname, gname === groups[0] ? 'touche ▶ pour entendre la gamme' : null, h('div', { class: 'scale-list' }, SCALES.filter((x) => x.group === gname).map((sc) => h('div', { class: 'scale-item' },
        h('button', {
          class: 'scale-btn', 'aria-pressed': String(sc.id === s.key.scale), onClick: () => apply(s.key.root, sc.id),
        }, h('b', {}, sc.name), h('small', {}, sc.hint)),
        h('button', {
          class: 'scale-play', 'aria-label': `Écouter la gamme ${sc.name} en ${ctx.note(s.key.root)}`,
          onClick: () => playScale(ctx, s.key.root, sc.id),
        }, icon('play'))))))))));
}
