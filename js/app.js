// Point d'entrée : assemble l'état, l'audio et l'interface.
import {
  DEFAULT_SONG, sanitizeSong, createStore, loadSession, saveSession, songFromHash,
} from './state.js';
import { insertChord, removeChord } from './actions.js';
import { diatonicChord } from './theory/harmony.js';
import { Synth } from './audio/synth.js';
import { Player } from './audio/player.js';
import { MidiOut } from './midi/webmidi.js';
import { createContext } from './ui/context.js';
import { h, icon, mount, toast } from './ui/dom.js';
import { renderTopbar } from './ui/topbar.js';
import { renderStageHead, renderTimeline, paintPlayhead, insertionBanner } from './ui/timeline.js';
import { renderInspector } from './ui/inspector.js';
import { renderPalette } from './ui/palette.js';
import { renderGeneratePanel } from './ui/generatePanel.js';
import { renderSoundPanel } from './ui/soundPanel.js';
import { renderToolsPanel } from './ui/toolsPanel.js';
import { renderKeySheet } from './ui/keysheet.js';
import { createKeybed } from './ui/keybed.js';
import { createTuner } from './ui/tuner.js';
import { createPianoRoll } from './ui/pianoroll.js';
import { createNoteEditor } from './ui/noteEditor.js';

const $ = (id) => document.getElementById(id);
const desktop = window.matchMedia('(min-width: 1100px)');

const TABS = [
  { id: 'palette', label: 'Accords', icon: 'palette' },
  { id: 'generate', label: 'Générer', icon: 'sparkle' },
  { id: 'sound', label: 'Son', icon: 'sliders' },
  { id: 'tools', label: 'Outils', icon: 'tools' },
];

function initialState() {
  const shared = songFromHash(location.hash);
  if (shared) history.replaceState(null, '', location.pathname);
  const session = shared ? null : loadSession();
  const song = shared ?? session ?? sanitizeSong(DEFAULT_SONG);
  return {
    state: {
      ...song,
      selected: null,
      ui: { tab: 'palette', tapToAdd: false, keyOptions: { transposeAll: true, adaptMode: true } },
    },
    shared: Boolean(shared),
  };
}

const { state: start, shared } = initialState();
const store = createStore(start);
const synth = new Synth();
const midiOut = new MidiOut();
const player = new Player(synth, midiOut);
player.state = start;
const ctx = createContext({ store, player, synth, midiOut });

// --- Disposition : palette à gauche sur grand écran, onglet sur téléphone ---

function placePalette() {
  const palette = $('panel-palette');
  if (desktop.matches) {
    $('side-left').append(palette);
    palette.classList.remove('in-right');
  } else {
    $('side-right').insertBefore(palette, $('panel-generate'));
    palette.classList.add('in-right');
  }
}

function activeTab(state) {
  const tab = state.ui.tab ?? 'palette';
  return desktop.matches && tab === 'palette' ? 'generate' : tab;
}

function renderTabs(state) {
  const current = activeTab(state);
  const make = (list) => list.map((t) => h('button', {
    class: 'tab', role: 'tab', 'aria-selected': String(t.id === current),
    onClick: () => ctx.setUi({ tab: t.id }),
  }, icon(t.icon), t.label));
  $('tabbar').replaceChildren(...make(TABS));
  $('tabs-desktop').replaceChildren(...make(TABS.filter((t) => t.id !== 'palette')));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === current));
}

// --- Rendu ---

const keybed = createKeybed($('keybed'), ctx, { openTuner: () => tuner.open() });
const tuner = createTuner($('tuner'), $('tuner-scrim'), ctx, { addNote: (m) => keybed.addNote(m) });
const roll = createPianoRoll($('roll'), $('roll-wrap'), ctx);
const editor = createNoteEditor($('note-editor'), ctx);
let sheetOpen = false;

function openKeySheet() {
  sheetOpen = true;
  renderSheet();
}
function closeKeySheet() {
  sheetOpen = false;
  renderSheet();
}
function renderSheet() {
  $('keysheet').classList.toggle('is-open', sheetOpen);
  $('sheet-scrim').classList.toggle('is-open', sheetOpen);
  if (sheetOpen) renderKeySheet($('keysheet'), ctx, { close: closeKeySheet });
}

function renderRollHead() {
  mount($('roll-head'),
    h('span', { class: 'eyebrow' }, 'Arrangement'),
    h('div', { class: 'roll-legend' },
      h('span', {}, h('i', { style: { background: 'var(--fn-T)' } }), 'accords'),
      h('span', {}, h('i', { style: { background: 'var(--trk-bass)' } }), 'basse')),
    h('div', { class: 'spacer' }),
    h('button', { class: 'pill edit-pill', onClick: () => ctx.startEdit('bass'), title: 'Modifier la basse note par note' }, icon('edit'), ' Basse'));
}

const PANELS = {
  palette: renderPalette,
  generate: renderGeneratePanel,
  sound: renderSoundPanel,
  tools: renderToolsPanel,
};

function render() {
  const state = store.get();
  renderTopbar($('topbar'), ctx, { openKeySheet });
  renderStageHead($('stage-head'), ctx);
  renderTimeline($('timeline'), ctx);
  mount($('insert-banner'), insertionBanner(ctx));
  renderInspector($('inspector'), ctx, { scrim: $('scrim') });
  renderTabs(state);
  renderRollHead();
  editor.sync();
  const visible = new Set([activeTab(state)]);
  if (desktop.matches) visible.add('palette');
  visible.forEach((id) => PANELS[id]($(`panel-${id}`), ctx));
  keybed.sync();
  tuner.refresh();
  roll.refresh();
  renderSheet();
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

let saveTimer = null;
store.subscribe((state, prev) => {
  if (player.playing && !player.previewing && state !== prev) player.update(state);
  synth.setMix(state.arrangement.mix, state.arrangement.muted);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSession(store.get()), 400);
  scheduleRender();
});

player.onChange((playing) => {
  if (!playing && store.get().ui.previewing) ctx.setUi({ previewing: null });
  scheduleRender();
});

// --- Animation pendant la lecture : tête de lecture, clavier allumé ---

let flash = { notes: [], until: 0 };
ctx.onFlash((notes, ms) => {
  flash = { notes, until: performance.now() + ms };
});

function frame() {
  try {
    paintFrame();
  } finally {
    requestAnimationFrame(frame);
  }
}

function paintFrame() {
  const state = store.get();
  const pos = player.playing ? player.position() : null;
  const own = pos != null && !player.previewing;
  editor.paint(own ? pos : null);
  paintPlayhead($('timeline'), state.chords, own ? pos : null);
  if (pos != null) {
    roll.draw(own ? pos : null);
    const lit = { chords: [], bass: [] };
    player.events.forEach((e) => {
      if (pos >= e.start && pos < e.start + e.dur) lit[e.track].push(e.midi);
    });
    keybed.light(lit);
  } else if (performance.now() < flash.until) {
    keybed.light({ chords: flash.notes });
  } else {
    keybed.light({});
  }
}

// --- Clavier de l'ordinateur ---

const typing = (el) => el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);

document.addEventListener('keyup', (e) => {
  if (!typing(e.target) && !editor.isOpen()) keybed.keyup(e);
});

document.addEventListener('keydown', (e) => {
  if (typing(e.target)) return;
  if (tuner.isOpen()) {
    if (e.key === 'Escape') tuner.close();
    return;
  }
  if (editor.handleKey(e)) return;
  if (keybed.keydown(e)) return;
  const state = store.get();
  const meta = e.metaKey || e.ctrlKey;
  if (e.code === 'Space') {
    e.preventDefault();
    player.toggle(state);
  } else if (meta && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
  } else if (!meta && /^[1-7]$/.test(e.key)) {
    const chord = diatonicChord(state.key, Number(e.key) - 1, state.level);
    if (chord) {
      ctx.set((s) => insertChord(s, chord));
      ctx.audition(chord);
    }
  } else if ((e.key === 'Backspace' || e.key === 'Delete') && state.selected) {
    e.preventDefault();
    ctx.set((s) => removeChord(s, s.selected));
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    if (!state.chords.length) return;
    const idx = state.chords.findIndex((c) => c.id === state.selected);
    const next = e.key === 'ArrowRight' ? Math.min(state.chords.length - 1, idx + 1) : Math.max(0, idx === -1 ? 0 : idx - 1);
    ctx.set((s) => ({ ...s, selected: s.chords[next].id }), { history: false });
    ctx.auditionAt(next);
  } else if (e.key === 'Escape') {
    if (sheetOpen) closeKeySheet();
    else ctx.set((s) => ({ ...s, selected: null }), { history: false });
  }
});

// --- Démarrage ---

// Débloque l'audio au premier contact (obligatoire sur iPhone).
const unlock = () => {
  try {
    synth.ensure();
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Audio indisponible');
  }
};
// iOS ne compte que certains gestes (touchend, click) : on retente à chaque geste tant que l'audio dort.
['pointerdown', 'touchend', 'click', 'keydown'].forEach((type) => window.addEventListener(type, () => {
  if (!synth.ctx || synth.ctx.state !== 'running') unlock();
}, { capture: true, passive: true }));

$('scrim').addEventListener('click', () => ctx.set((s) => ({ ...s, selected: null }), { history: false }));
$('sheet-scrim').addEventListener('click', closeKeySheet);
desktop.addEventListener('change', () => {
  placePalette();
  render();
});
// Quand on quitte l'app : sauvegarde, arrêt de la lecture et abandon du moteur audio (iOS le casse en arrière-plan).
const leave = () => {
  saveSession(store.get());
  player.stop();
  synth.reset();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) leave();
});
window.addEventListener('pagehide', leave);
window.addEventListener('pageshow', (e) => {
  if (e.persisted) synth.reset();
});
// Diagnostic lisible depuis les tests automatiques.
window.cadenceAudio = () => ({ state: synth.ctx?.state ?? 'none', generation: synth.generation ?? 0 });

placePalette();
render();
requestAnimationFrame(frame);
if (shared) toast('Progression partagée chargée');

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
