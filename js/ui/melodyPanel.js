// Panneau mélodie : style, densité, syncope, répétition, registre, édition au doigt.
import { h, icon, mount, pills, segmented, section, slider, toggle, toast } from './dom.js';
import { MELODY_STYLES, REGISTERS, generateMelody, revoiceMelody } from '../gen/melody.js';
import { INSTRUMENTS } from '../audio/synth.js';

export function renderMelodyPanel(container, ctx) {
  const s = ctx.state;
  const m = s.melody;
  const setParams = (patch) => ctx.set((st) => ({ ...st, melody: { ...st.melody, params: { ...st.melody.params, ...patch } } }), { history: false });
  const setNotes = (notes, msg) => {
    ctx.set((st) => ({ ...st, melody: { ...st.melody, notes, stale: false, enabled: true } }));
    if (msg) toast(msg);
  };
  const generate = () => {
    if (!s.chords.length) {
      toast('Ajoute d’abord quelques accords');
      return;
    }
    setNotes(generateMelody({ chords: s.chords, key: s.key, params: m.params, seed: Date.now() }), 'Nouvelle mélodie');
  };
  const revoice = () => setNotes(revoiceMelody(m.notes, { chords: s.chords, key: s.key, params: m.params, seed: Date.now() }), 'Mêmes rythmes, autres notes');
  const shift = (semis) => setNotes(m.notes.map((n) => ({ ...n, midi: Math.max(36, Math.min(96, n.midi + semis)) })));

  mount(container,
    h('h2', { class: 'panel-title' }, 'Mélodie'),
    h('p', { class: 'panel-sub' }, 'Une ligne chantable posée sur tes accords : notes de l’accord sur les temps forts, notes de passage entre les deux.'),
    m.stale ? h('div', { class: 'callout' }, h('span', {}, 'Les accords ont changé.'), h('button', { class: 'btn primary', onClick: generate }, 'Recomposer')) : null,
    h('div', { class: 'section' }, toggle('Mélodie active', m.enabled, (enabled) => ctx.set((st) => ({ ...st, melody: { ...st.melody, enabled } }), { history: false }))),
    section('Style', MELODY_STYLES.find((x) => x.id === m.params.style)?.hint,
      pills(MELODY_STYLES.map((x) => ({ value: x.id, label: x.label })), m.params.style, (style) => setParams({ style }))),
    section('Registre', null, segmented(REGISTERS.map((r) => ({ value: r.id, label: r.label })), m.params.register, (register) => setParams({ register }), { full: true })),
    slider({ label: 'Densité', value: m.params.density, ends: ['Aérée', 'Bavarde'], onCommit: (density) => setParams({ density }) }),
    slider({ label: 'Syncope', value: m.params.syncopation, ends: ['Carrée', 'Décalée'], onCommit: (syncopation) => setParams({ syncopation }) }),
    slider({ label: 'Répétition du motif', value: m.params.repetition, ends: ['Libre', 'Obsédante'], onCommit: (repetition) => setParams({ repetition }) }),
    h('div', { class: 'section' }, h('button', { class: 'btn primary big', onClick: generate }, icon('sparkle'), m.notes.length ? 'Nouvelle mélodie' : 'Composer une mélodie')),
    m.notes.length ? h('div', { class: 'btn-row', style: { marginTop: '8px' } },
      h('button', { class: 'btn', onClick: revoice }, icon('dice'), 'Autres notes'),
      h('button', { class: 'btn', onClick: () => shift(-12) }, 'Octave −'),
      h('button', { class: 'btn', onClick: () => shift(12) }, 'Octave +'),
      h('button', { class: 'btn danger', onClick: () => setNotes([], 'Mélodie effacée') }, icon('trash'), 'Effacer')) : null,
    section('À la main', `${m.notes.length} notes`,
      h('button', { class: 'btn', onClick: () => ctx.startEdit(s.ui.editTrack === 'melody' ? null : 'melody') }, icon('edit'),
        s.ui.editTrack === 'melody' ? 'Terminer la modification' : 'Modifier la mélodie note par note')),
    section('Instrument', null, h('select', {
      class: 'select',
      onChange: (e) => ctx.set((st) => ({ ...st, arrangement: { ...st.arrangement, instruments: { ...st.arrangement.instruments, melody: e.target.value } } }), { history: false }),
    }, INSTRUMENTS.melody.map((i) => h('option', { value: i.id, selected: i.id === s.arrangement.instruments.melody }, i.label)))));
}
