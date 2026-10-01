// Palette : accords de la gamme, suggestions « et ensuite ? », emprunts, dominantes secondaires.
import { h, sym, icon, mount, segmented, section, toggle } from './dom.js';
import {
  LEVELS, FUNCTIONS, diatonicChords, borrowedChords, secondaryDominants, tritoneSubstitutions, suggestNext,
} from '../theory/harmony.js';
import { addChord } from '../actions.js';
import { slashGroups } from '../theory/slash.js';
import { toast } from './dom.js';

function chordChip(ctx, chord, { caption = null, strength = null } = {}) {
  const fn = ctx.fn(chord);
  const s = ctx.state;
  const add = () => {
    ctx.set((st) => addChord(st, { root: chord.root, quality: chord.quality, bass: chord.bass ?? null }));
    toast(`${ctx.label(chord)} ajouté`);
  };
  return h('div', { class: `chip fn-${fn}` },
    h('button', {
      class: 'chip-play',
      title: `${FUNCTIONS[fn].label} — écouter`,
      onClick: () => {
        ctx.audition(chord);
        if (s.ui.tapToAdd) add();
      },
    },
    h('span', { class: 'chip-roman' }, caption ?? ctx.roman(chord)),
    h('span', { class: 'chip-sym' }, sym(ctx.label(chord)))),
    h('button', { class: 'chip-add', 'aria-label': `Ajouter ${ctx.label(chord)}`, onClick: add }, icon('plus')),
    strength != null ? h('span', { class: 'strength', style: { width: `${Math.round(strength * 100)}%` } }) : null);
}

function suggestions(ctx) {
  const s = ctx.state;
  const ref = s.chords.find((c) => c.id === s.selected) ?? s.chords[s.chords.length - 1] ?? null;
  const list = suggestNext(ref, s.key, s.level, 6);
  const insertAt = ref && s.selected ? s.chords.findIndex((c) => c.id === s.selected) + 1 : null;
  return section(ref ? `Après ${ctx.label(ref)}` : 'Pour commencer', 'les plus naturels d’abord',
    h('div', { class: 'suggest-list' }, list.map((sg) => {
      const fn = ctx.fn(sg.chord);
      const add = () => {
        ctx.set((st) => addChord(st, sg.chord, insertAt));
        toast(`${ctx.label(sg.chord)} ajouté`);
      };
      return h('div', { class: `suggest fn-${fn}` },
        h('span', { class: 'meter', style: { width: `${Math.round(sg.strength * 100)}%` } }),
        h('span', { class: 's-sym' }, sym(ctx.label(sg.chord))),
        h('div', { class: 's-meta' }, h('div', { class: 's-roman' }, ctx.roman(sg.chord)), h('div', { class: 's-reason' }, sg.reason)),
        h('div', { class: 'row-actions' },
          h('button', { class: 'icon-btn small', 'aria-label': `Écouter ${ctx.label(sg.chord)}`, onClick: () => ctx.audition(sg.chord, {}) }, icon('ear')),
          h('button', { class: 'icon-btn small', 'aria-label': `Ajouter ${ctx.label(sg.chord)}`, onClick: add }, icon('plus'))));
    })));
}

export function renderPalette(container, ctx) {
  const s = ctx.state;
  const diatonic = diatonicChords(s.key, s.level);
  const borrowed = borrowedChords(s.key, s.level);
  const secondary = secondaryDominants(s.key, s.level);
  const subs = tritoneSubstitutions(s.key, s.level);

  mount(container,
    h('h2', { class: 'panel-title' }, 'Accords en ', h('em', {}, ctx.keyName())),
    h('p', { class: 'panel-sub' }, 'Touche pour écouter, + pour ajouter à la progression.'),
    segmented(LEVELS, s.level, (level) => ctx.set((st) => ({ ...st, level }), { history: false }), { full: true, label: 'Complexité' }),
    section('Dans la gamme', `${diatonic.length} accords`, h('div', { class: 'chips' }, diatonic.map((c) => chordChip(ctx, c)))),
    suggestions(ctx),
    borrowed.length ? h('details', { class: 'fold', open: true },
      h('summary', {}, 'Emprunts aux modes voisins'),
      h('div', { class: 'fold-body' }, borrowed.slice(0, 4).map((g) => section(g.name, null, h('div', { class: 'chips' }, g.chords.slice(0, 7).map((c) => chordChip(ctx, c))))))) : null,
    h('details', { class: 'fold', open: true },
      h('summary', {}, 'Accords sur une autre basse'),
      h('div', { class: 'fold-body' },
        h('p', { class: 'panel-sub' }, 'La basse joue une autre note que la fondamentale : lignes de basse qui glissent, suspensions, pédales.'),
        slashGroups(s.key, s.level).map((grp) => section(grp.title, grp.hint, h('div', { class: 'chips' },
          grp.chords.map((c) => chordChip(ctx, c, { caption: grp.id === 'colors' ? c.label : null }))))))),
    secondary.length ? h('details', { class: 'fold' },
      h('summary', {}, 'Dominantes secondaires'),
      h('div', { class: 'fold-body' }, h('p', { class: 'panel-sub' }, 'Un accord de tension qui « tire » vers un degré de la gamme.'),
        h('div', { class: 'chips' }, secondary.map((c) => chordChip(ctx, c, { caption: c.label }))))) : null,
    subs.length ? h('details', { class: 'fold' },
      h('summary', {}, 'Substitutions tritoniques'),
      h('div', { class: 'fold-body' }, h('p', { class: 'panel-sub' }, 'Le remplaçant jazz d’une dominante, à un triton.'),
        h('div', { class: 'chips' }, subs.map((c) => chordChip(ctx, c, { caption: c.label }))))) : null,
    h('div', { class: 'section' }, toggle('Toucher = ajouter', Boolean(s.ui.tapToAdd), (v) => ctx.setUi({ tapToAdd: v }), 'chaque accord touché rejoint la progression')),
    h('div', { class: 'section legend-fn' }, Object.entries(FUNCTIONS).map(([id, f]) => h('span', { class: `fn-${id}` }, f.label))));
}
