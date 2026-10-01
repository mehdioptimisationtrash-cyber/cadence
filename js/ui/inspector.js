// Inspecteur de l'accord sélectionné : fondamentale, qualité, renversement, basse, durée, variantes.
import { h, sym, icon, iconButton, mount, segmented, section } from './dom.js';
import { QUALITY_LIST, QUALITY_GROUPS, getQuality } from '../theory/chords.js';
import { FUNCTIONS, chordVariants } from '../theory/harmony.js';
import { scalePitchClasses } from '../theory/scales.js';
import { updateChord, removeChord, duplicateChord } from '../actions.js';

const DURATIONS = [
  { value: 1, label: '1 t' }, { value: 2, label: '2 t' }, { value: 3, label: '3 t' },
  { value: 4, label: '1 mes' }, { value: 6, label: '1½' }, { value: 8, label: '2 mes' },
];

export function renderInspector(container, ctx, { scrim }) {
  const s = ctx.state;
  const chord = s.chords.find((c) => c.id === s.selected);
  container.classList.toggle('is-open', Boolean(chord));
  scrim.classList.toggle('is-open', Boolean(chord));
  if (!chord) {
    container.replaceChildren();
    return;
  }
  const fn = ctx.fn(chord);
  container.className = `inspector is-open fn-${fn}`;
  const close = () => ctx.set((st) => ({ ...st, selected: null }), { history: false });
  const edit = (patch, listen = true) => {
    ctx.set((st) => updateChord(st, chord.id, patch));
    if (listen) ctx.audition({ ...chord, ...patch });
  };
  const inScale = new Set(scalePitchClasses(s.key.root, s.key.scale));
  const size = getQuality(chord.quality).iv.length;
  const noteButtons = (value, onPick, withNone = false) => h('div', { class: 'note-grid' },
    withNone ? h('button', { 'aria-pressed': String(value == null), onClick: () => onPick(null) }, '—') : null,
    Array.from({ length: 12 }, (_, i) => (s.key.root + i) % 12).map((p) => h('button', {
      class: inScale.has(p) ? 'in-scale' : '',
      'aria-pressed': String(value === p),
      onClick: () => onPick(p),
    }, ctx.note(p))));

  const qualities = QUALITY_GROUPS.map((g) => [
    h('div', { class: 'q-group' }, g),
    h('div', { class: 'quality-grid' }, QUALITY_LIST.filter((q) => q.group === g).map((q) => h('button', {
      'aria-pressed': String(q.id === chord.quality),
      title: q.name,
      onClick: () => edit({ quality: q.id, inversion: null }),
    }, ctx.note(chord.root) + (q.sym || ' maj')))),
  ]);

  const variants = chordVariants(chord, s.key, s.level);
  const variantChips = h('div', { class: 'chips' }, variants.map((v) => {
    const vfn = ctx.fn(v.chord);
    return h('div', { class: `chip fn-${vfn}` },
      h('button', {
        class: 'chip-play',
        title: `${v.label} — toucher pour remplacer`,
        onClick: () => edit({ root: v.chord.root, quality: v.chord.quality, inversion: null }),
      }, h('span', { class: 'chip-roman' }, v.label), h('span', { class: 'chip-sym' }, sym(ctx.label(v.chord)))));
  }));

  const inversions = [{ value: null, label: 'Auto' }, ...Array.from({ length: Math.min(size, 4) }, (_, i) => ({
    value: i, label: ['Fond.', '1er', '2e', '3e'][i],
  }))];

  mount(container,
    h('div', { class: 'grabber' }),
    h('div', { class: 'insp-head' },
      h('div', { class: 'insp-sym' }, sym(ctx.label(chord))),
      h('div', { class: 'insp-meta' },
        h('div', { class: 'insp-roman' }, ctx.roman(chord)),
        h('div', { class: 'insp-fn' }, `${FUNCTIONS[fn].label} · ${FUNCTIONS[fn].hint}`)),
      iconButton('ear', 'Écouter', () => ctx.audition(chord)),
      iconButton('copy', 'Dupliquer', () => ctx.set((st) => duplicateChord(st, chord.id))),
      iconButton('trash', 'Supprimer', () => ctx.set((st) => removeChord(st, chord.id))),
      iconButton('close', 'Fermer', close)),
    section('Variantes & substitutions', 'toucher pour remplacer', variantChips),
    section('Durée', null, segmented(DURATIONS, chord.beats, (beats) => edit({ beats }, false), { full: true, label: 'Durée' })),
    section('Renversement', chord.inversion == null ? 'conduite des voix auto' : null,
      segmented(inversions, chord.inversion, (inversion) => edit({ inversion }), { label: 'Renversement' })),
    section('Octave', null, segmented([{ value: -1, label: 'Grave' }, { value: 0, label: 'Normal' }, { value: 1, label: 'Aigu' }], chord.octave ?? 0, (octave) => edit({ octave }), { label: 'Octave' })),
    section('Fondamentale', null, noteButtons(chord.root, (root) => edit({ root, inversion: null }))),
    section('Qualité', null, ...qualities),
    section('Basse (accord renversé « slash »)', null, noteButtons(chord.bass, (bass) => edit({ bass }), true)),
    h('div', { class: 'btn-row', style: { marginTop: '18px' } },
      h('button', { class: 'btn', onClick: close }, icon('close'), 'Fermer')));
}
