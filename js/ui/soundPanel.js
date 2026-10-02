// Panneau son : jeu des accords, basse, voicing, groove, instruments, mixage, sortie MIDI.
import { h, icon, mount, pills, section, slider, toggle, toast } from './dom.js';
import { CHORD_PATTERNS, BASS_PATTERNS } from '../gen/patterns.js';
import { VOICINGS } from '../theory/voicing.js';
import { INSTRUMENTS } from '../audio/synth.js';
import { MidiOut } from '../midi/webmidi.js';
import { releaseBass } from '../actions.js';

const TRACKS = [
  { id: 'chords', label: 'Accords', color: 'var(--fn-T)' },
  { id: 'bass', label: 'Basse', color: 'var(--trk-bass)' },
];

export function renderSoundPanel(container, ctx) {
  const s = ctx.state;
  const a = s.arrangement;
  const setArr = (patch) => ctx.set((st) => ({ ...st, arrangement: { ...st.arrangement, ...patch } }), { history: false });

  const mixer = TRACKS.map((t) => h('div', { class: 'mixer-row' },
    h('div', { class: 'name' }, h('i', { style: { background: t.color } }), t.label),
    h('button', {
      class: 'icon-btn small',
      'aria-pressed': String(a.muted[t.id]),
      'aria-label': a.muted[t.id] ? `Réactiver ${t.label}` : `Couper ${t.label}`,
      onClick: () => setArr({ muted: { ...a.muted, [t.id]: !a.muted[t.id] } }),
    }, icon(a.muted[t.id] ? 'mute' : 'speaker')),
    h('div', { class: 'controls' },
      h('select', {
        class: 'select', 'aria-label': `Instrument ${t.label}`,
        onChange: (e) => setArr({ instruments: { ...a.instruments, [t.id]: e.target.value } }),
      }, INSTRUMENTS[t.id].map((i) => h('option', { value: i.id, selected: i.id === a.instruments[t.id] }, i.label))),
      slider({ label: 'Volume', value: a.mix[t.id], onCommit: (v) => setArr({ mix: { ...a.mix, [t.id]: v } }) }))));

  const midiSection = MidiOut.supported()
    ? section('Sortie MIDI', 'vers ton logiciel de musique',
      ctx.state.ui.midiOutputs
        ? h('select', {
          class: 'select',
          onChange: (e) => {
            ctx.midiOut.select(e.target.value || null);
            ctx.setUi({ midiOutput: e.target.value || null });
          },
        }, h('option', { value: '' }, 'Aucune'), ctx.state.ui.midiOutputs.map((o) => h('option', { value: o.id, selected: o.id === ctx.state.ui.midiOutput }, o.name)))
        : h('button', {
          class: 'btn',
          onClick: async () => {
            try {
              const outputs = await ctx.midiOut.connect();
              ctx.setUi({ midiOutputs: outputs });
              toast(outputs.length ? `${outputs.length} sortie(s) MIDI trouvée(s)` : 'Aucune sortie MIDI (active le bus IAC sur Mac)');
            } catch (err) {
              toast(err instanceof Error ? err.message : 'MIDI refusé');
            }
          },
        }, icon('link'), 'Activer la sortie MIDI'),
      toggle('Son interne', a.internalSound, (internalSound) => setArr({ internalSound }), 'coupe-le si ton logiciel joue les notes'))
    : null;

  mount(container,
    h('h2', { class: 'panel-title' }, 'Son & jeu'),
    h('p', { class: 'panel-sub' }, 'Comment la progression est jouée : rythme, disposition des notes, basse, instruments.'),
    section('Jeu des accords', null, pills(CHORD_PATTERNS.map((p) => ({ value: p.id, label: p.label })), a.chordPattern, (chordPattern) => setArr({ chordPattern }))),
    section('Ligne de basse', s.bassLine.custom ? 'modifiée à la main' : null,
      pills(BASS_PATTERNS.map((p) => ({ value: p.id, label: p.label })), s.bassLine.custom ? null : a.bassPattern, (bassPattern) => {
        if (s.bassLine.custom) ctx.set((st) => releaseBass(st, bassPattern));
        else setArr({ bassPattern });
      }),
      s.bassLine.custom
        ? h('div', { class: 'callout', style: { marginTop: '10px' } },
          h('span', {}, s.bassLine.stale ? 'Les accords ont changé : ta basse ne les suit plus.' : 'Basse jouée telle que tu l’as écrite.'),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn', onClick: () => ctx.startEdit('bass') }, icon('edit'), 'Modifier'),
            h('button', { class: 'btn', onClick: () => ctx.set((st) => releaseBass(st)) }, 'Revenir au motif')))
        : h('button', { class: 'btn', style: { marginTop: '10px' }, onClick: () => ctx.startEdit('bass') }, icon('edit'), 'Modifier la basse note par note')),
    section('Voicing', VOICINGS.find((v) => v.id === a.voicing)?.hint, pills(VOICINGS.map((v) => ({ value: v.id, label: v.label })), a.voicing, (voicing) => setArr({ voicing }))),
    slider({ label: 'Swing', value: a.swing, ends: ['Droit', 'Ternaire'], onCommit: (swing) => setArr({ swing }) }),
    slider({ label: 'Réverbération', value: a.mix.reverb, ends: ['Sec', 'Cathédrale'], onCommit: (reverb) => setArr({ mix: { ...a.mix, reverb } }) }),
    section('Instruments & volumes', null, mixer),
    midiSection);
}
