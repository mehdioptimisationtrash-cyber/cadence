// Générateur par ambiance + bibliothèque de progressions célèbres.
import { h, sym, icon, mount, segmented, section, slider, toggle, toast } from './dom.js';
import { MOODS, GENRES, TEMPLATES, templateChords, generateProgression } from '../gen/progressions.js';
import { getScale } from '../theory/scales.js';
import { replaceProgression } from '../actions.js';
import { sanitizeSong } from '../state.js';

const LENGTHS = [3, 4, 6, 8].map((v) => ({ value: v, label: String(v) }));
const BEATS = [{ value: 2, label: '½ mes.' }, { value: 4, label: '1 mes.' }, { value: 8, label: '2 mes.' }];

export function renderGeneratePanel(container, ctx) {
  const s = ctx.state;
  const g = s.generator;
  const setGen = (patch) => ctx.set((st) => ({ ...st, generator: { ...st.generator, ...patch } }), { history: false });
  const run = () => {
    const result = generateProgression({
      key: s.key, level: s.level, moodId: g.mood, length: g.length, beatsPerChord: g.beatsPerChord,
      audace: g.audace, startOnTonic: g.startOnTonic, adaptScale: g.adaptScale, smoothBass: g.smoothBass, seed: Date.now(),
    });
    ctx.set((st) => replaceProgression(st, result.chords, result.scale));
    const after = ctx.state;
    if (ctx.player.playing) ctx.player.update(after);
    toast(`${MOODS.find((m) => m.id === g.mood).label} · ${after.chords.map((c) => ctx.label(c)).join(' – ')}`);
  };
  const genre = s.ui.genre ?? GENRES[0];
  const previewing = s.ui.previewing ?? null;

  const useTemplate = (t) => {
    ctx.player.stop();
    const scale = getScale(t.mode).id;
    ctx.set((st) => replaceProgression({ ...st, ui: { ...st.ui, previewing: null } }, templateChords(t, st.key.root), scale));
    toast(`« ${t.name} » chargée`);
  };
  const preview = (t) => {
    if (previewing === t.id) {
      ctx.player.stop();
      ctx.setUi({ previewing: null });
      return;
    }
    const temp = sanitizeSong({
      ...s, key: { ...s.key, scale: t.mode }, chords: templateChords(t, s.key.root), loop: false, bassLine: { custom: false, notes: [] },
    });
    ctx.player.stop();
    ctx.player.start({ ...temp, ui: s.ui, selected: null });
    ctx.player.previewing = t.id;
    ctx.setUi({ previewing: t.id });
  };

  const list = TEMPLATES.filter((t) => t.genre === genre).map((t) => {
    const chords = templateChords(t, s.key.root);
    const keyForLabel = { ...s, key: { ...s.key, scale: t.mode } };
    return h('div', { class: `template${previewing === t.id ? ' is-previewing' : ''}` },
      h('div', { style: { minWidth: 0 } },
        h('div', { class: 'template-name' }, t.name, h('span', { class: 'template-prog' }, ` · ${t.prog}`)),
        h('div', { class: 'template-chords' }, sym(chords.map((c) => ctx.label(c, keyForLabel)).join('  ')))),
      h('div', { class: 'row-actions' },
        h('button', { class: 'icon-btn small', 'aria-label': previewing === t.id ? 'Arrêter l’aperçu' : `Écouter ${t.name}`, onClick: () => preview(t) }, icon(previewing === t.id ? 'stop' : 'play')),
        h('button', { class: 'btn', onClick: () => useTemplate(t) }, 'Utiliser')));
  });

  mount(container,
    h('h2', { class: 'panel-title' }, 'Générer'),
    h('p', { class: 'panel-sub' }, 'Choisis une ambiance, lance les dés. ⌘Z pour revenir en arrière.'),
    section('Ambiance', null, h('div', { class: 'moods' }, MOODS.map((m) => h('button', {
      class: 'mood', 'aria-pressed': String(m.id === g.mood), onClick: () => setGen({ mood: m.id }),
    }, h('span', { class: 'glyph' }, m.glyph), m.label)))),
    section('Nombre d’accords', null, segmented(LENGTHS, g.length, (length) => setGen({ length }), { full: true })),
    section('Durée de chaque accord', null, segmented(BEATS, g.beatsPerChord, (beatsPerChord) => setGen({ beatsPerChord }), { full: true })),
    slider({ label: 'Audace harmonique', value: g.audace, ends: ['Sage', 'Aventureux'], onCommit: (audace) => setGen({ audace }) }),
    slider({ label: 'Basse fluide (renversements)', value: g.smoothBass, ends: ['Fondamentales', 'Pas à pas'], onCommit: (smoothBass) => setGen({ smoothBass }) }),
    h('div', { class: 'section' },
      toggle('Adapter la gamme à l’ambiance', g.adaptScale, (adaptScale) => setGen({ adaptScale }), `ex. Épique → ${getScale(MOODS.find((m) => m.id === 'epique').scale).name.toLowerCase()}`),
      toggle('Commencer sur la tonique', g.startOnTonic, (startOnTonic) => setGen({ startOnTonic }))),
    h('div', { class: 'section' }, h('button', { class: 'btn primary big', onClick: run }, icon('dice'), 'Générer une progression')),
    section('Progressions célèbres', `en ${ctx.note(s.key.root)}`,
      h('div', { class: 'pills', style: { marginBottom: '10px' } }, GENRES.map((gn) => h('button', {
        class: 'pill', 'aria-pressed': String(gn === genre), onClick: () => ctx.setUi({ genre: gn }),
      }, gn))),
      h('div', { class: 'template-list' }, list)));
}
