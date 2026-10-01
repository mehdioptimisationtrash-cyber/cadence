// Clavier jouable du milieu de page : plusieurs doigts, nom de la note et de l'accord joués (à la Logic),
// mode « Maintenir » pour construire un accord note par note, saisie au clavier du Mac.
import { h, icon, iconButton, mount, sym, toast } from './dom.js';
import { midiLabel, pc } from '../theory/notes.js';
import { detectChords } from '../theory/chords.js';
import { insertChord } from '../actions.js';
import { createKeyboard } from './keyboard.js';

const MOBILE_SPAN = 24;
// Saisie musicale façon Logic, par position physique des touches (marche en AZERTY comme en QWERTY).
const TYPING = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14,
};

export function createKeybed(root, ctx, { openTuner }) {
  const bar = h('div', { class: 'kb-bar' });
  const scroller = h('div', { class: 'kb-wrap' });
  const keysEl = h('div', { class: 'keyboard', 'aria-label': 'Clavier' });
  scroller.append(keysEl);
  root.append(bar, scroller);
  const desktop = window.matchMedia('(min-width: 1100px)');
  const held = new Map(); // pointeur ou touche → { midi, voice }
  let lastChord = [];
  let range = null;
  let keyboard = null;
  let lit = {};
  let typingBase = 60;

  const ui = () => ctx.state.ui;
  const latch = () => Boolean(ui().kbLatch);
  const builder = () => ui().builder ?? [];
  const instrument = () => ctx.state.arrangement.instruments.chords;
  const heldNotes = () => [...new Set([...held.values()].map((x) => x.midi))].sort((a, b) => a - b);
  const shownNotes = () => (latch() ? builder() : held.size ? heldNotes() : lastChord);

  function setBuilder(notes) {
    ctx.setUi({ builder: [...new Set(notes)].sort((a, b) => a - b) });
  }

  function press(midi, id) {
    if (latch()) {
      const list = builder();
      const next = list.includes(midi) ? list.filter((m) => m !== midi) : [...list, midi];
      setBuilder(next);
      if (next.length) ctx.playNotes(next.sort((a, b) => a - b));
      return;
    }
    held.set(id, { midi, voice: ctx.synth.noteOn('chords', instrument(), midi) });
    ctx.midiOut?.send('chords', midi, 0.72, 0, 0.5);
    lastChord = heldNotes();
    renderBar();
  }

  function release(midi, id) {
    const entry = held.get(id);
    if (!entry) return;
    held.delete(id);
    ctx.synth.noteOff(entry.voice);
    renderBar();
  }

  function buildKeyboard() {
    const low = desktop.matches ? 36 : ui().kbLow ?? 48;
    const high = desktop.matches ? 84 : low + MOBILE_SPAN;
    if (range && range.low === low && range.high === high) return;
    range = { low, high };
    keyboard = createKeyboard(keysEl, { low, high, labels: true, onPress: press, onRelease: release });
    const s = ctx.state;
    keyboard.setScale(s.key.root, ctx.scalePcs());
    keyboard.light(lit);
  }

  function renderBar() {
    const notes = shownNotes();
    const found = notes.length >= 2 ? detectChords(notes) : [];
    const best = found[0] ?? null;
    let title;
    let sub;
    if (!notes.length) {
      title = h('span', { class: 'kb-idle' }, latch() ? 'Touche des notes pour construire un accord' : 'Joue des notes…');
      sub = latch() ? 'chaque touche ajoute ou retire une note' : 'plusieurs doigts à la fois : l’accord s’affiche ici';
    } else if (notes.length === 1) {
      title = h('span', { class: 'kb-name' }, midiLabel(notes[0], ctx.state.notation));
      sub = 'une note';
    } else {
      title = best ? h('span', { class: 'kb-name' }, sym(ctx.label(best))) : h('span', { class: 'kb-name dim' }, 'Accord inconnu');
      const alts = found.slice(1, 3).map((c) => ctx.label(c));
      sub = `${notes.map((m) => ctx.note(pc(m))).join(' · ')}${alts.length ? `   ou ${alts.join(', ')}` : ''}`;
    }
    const canAdd = Boolean(best);
    mount(bar,
      h('div', { class: 'kb-readout', 'aria-live': 'polite' },
        h('div', { class: 'kb-title' }, title, best ? h('span', { class: 'kb-roman' }, ctx.roman(best)) : null),
        h('div', { class: 'kb-sub' }, sub)),
      h('div', { class: 'kb-actions' },
        canAdd ? h('button', {
          class: 'btn primary kb-add',
          onClick: () => {
            ctx.set((st) => insertChord(st, { root: best.root, quality: best.quality, bass: best.bass }));
            toast(`${ctx.label(best)} ajouté à la progression`);
          },
        }, icon('plus'), 'Ajouter') : null,
        latch() && builder().length ? iconButton('ear', 'Écouter l’accord', () => ctx.playNotes(builder()), { class: 'small' }) : null,
        latch() && builder().length ? iconButton('trash', 'Vider', () => setBuilder([]), { class: 'small' }) : null,
        h('button', {
          class: 'pill kb-pill', 'aria-pressed': String(latch()), title: 'Maintenir : chaque touche ajoute ou retire une note',
          onClick: () => ctx.setUi({ kbLatch: !latch() }),
        }, 'Maintenir'),
        h('button', { class: 'pill kb-pill kb-mic', onClick: openTuner, title: 'Siffle ou chante une note' }, icon('mic'), 'Siffler'),
        desktop.matches ? null : h('div', { class: 'kb-oct' },
          iconButton('arrowLeft', 'Octave plus grave', () => ctx.setUi({ kbLow: Math.max(24, (ui().kbLow ?? 48) - 12) }), { class: 'small' }),
          iconButton('arrowRight', 'Octave plus aiguë', () => ctx.setUi({ kbLow: Math.min(84, (ui().kbLow ?? 48) + 12) }), { class: 'small' }))));
  }

  function typing(e, down) {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (down && e.code === 'KeyZ') { typingBase = Math.max(24, typingBase - 12); toast(`Clavier : octave ${Math.floor(typingBase / 12) - 1}`); return true; }
    if (down && e.code === 'KeyX') { typingBase = Math.min(96, typingBase + 12); toast(`Clavier : octave ${Math.floor(typingBase / 12) - 1}`); return true; }
    const offset = TYPING[e.code];
    if (offset == null) return false;
    const id = `key:${e.code}`;
    if (down) {
      if (!e.repeat && !held.has(id)) press(typingBase + offset, id);
    } else release(typingBase + offset, id);
    return true;
  }

  desktop.addEventListener('change', () => {
    range = null;
    sync();
  });

  function sync() {
    buildKeyboard();
    keyboard.setScale(ctx.state.key.root, ctx.scalePcs());
    renderBar();
  }

  return {
    sync,
    /** Allume les touches : lecture en cours + notes tenues + accord en construction. */
    light(fromPlayback) {
      const own = { pick: builder(), held: heldNotes() };
      lit = { ...fromPlayback, ...own };
      keyboard?.light(lit);
    },
    keydown: (e) => typing(e, true),
    keyup: (e) => typing(e, false),
    addNote(midi) {
      ctx.setUi({ kbLatch: true, builder: [...new Set([...builder(), midi])].sort((a, b) => a - b) });
    },
  };
}
