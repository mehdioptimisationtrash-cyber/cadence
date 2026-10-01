// Accordeur par le micro, façon Ableton Tuner : siffle ou chante, l'aiguille montre l'écart,
// on valide la note (ou validation automatique quand c'est juste) et elle rejoint l'accord en construction.
import { h, icon, iconButton, mount, sym, toggle, toast } from './dom.js';
import { midiLabel, pc } from '../theory/notes.js';
import { detectChords } from '../theory/chords.js';
import { insertChord } from '../actions.js';
import { createPitchTracker, foldIntoRange } from '../audio/pitch.js';

const IN_TUNE_CENTS = 20;
const AUTO_HOLD_MS = 380;
const PAUSE_AFTER_CAPTURE_MS = 550;
const QUIET_LEVEL = 0.002;

export function createTuner(root, scrim, ctx, { addNote }) {
  let stream = null;
  let source = null;
  let analyser = null;
  let buffer = null;
  let raf = 0;
  let tracker = null;
  let current = null; // { midi, cents, freq }
  let inTuneSince = 0;
  let pausedUntil = 0;
  let lastCaptured = null;
  let error = '';
  let level = 0;

  const builder = () => ctx.state.ui.builder ?? [];
  const auto = () => ctx.state.ui.tunerAuto !== false;

  const needle = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  needle.setAttribute('viewBox', '0 0 300 170');
  needle.setAttribute('class', 'tn-gauge');
  needle.innerHTML = `
    <path d="M 30 150 A 120 120 0 0 1 270 150" fill="none" stroke="rgba(255,244,230,0.12)" stroke-width="14" stroke-linecap="round"/>
    <path d="M 128 32 A 120 120 0 0 1 172 32" fill="none" stroke="#5fd3b0" stroke-width="14" stroke-linecap="round" opacity="0.55"/>
    ${[-50, -25, 0, 25, 50].map((c) => {
    const a = ((c * 0.9 - 90) * Math.PI) / 180;
    return `<line x1="${150 + 104 * Math.cos(a)}" y1="${150 + 104 * Math.sin(a)}" x2="${150 + 92 * Math.cos(a)}" y2="${150 + 92 * Math.sin(a)}" stroke="rgba(255,244,230,0.4)" stroke-width="2"/>`;
  }).join('')}
    <g class="tn-needle"><line x1="150" y1="150" x2="150" y2="40" stroke-width="4" stroke-linecap="round"/><circle cx="150" cy="150" r="8"/></g>`;

  const els = {
    note: h('div', { class: 'tn-note' }, '—'),
    cents: h('div', { class: 'tn-cents' }, ''),
    hint: h('div', { class: 'tn-hint' }, ''),
    level: h('div', { class: 'tn-level' }, h('i')),
    validate: h('button', { class: 'btn primary big tn-validate', disabled: true }, 'Valider la note'),
    collected: h('div', { class: 'tn-collected' }),
  };
  els.validate.addEventListener('click', () => current && capture(current.midi));

  function capture(midi) {
    const folded = foldIntoRange(midi);
    addNote(folded);
    lastCaptured = { midi: folded, at: performance.now() };
    pausedUntil = performance.now() + PAUSE_AFTER_CAPTURE_MS;
    tracker?.reset();
    current = null;
    inTuneSince = 0;
    toast(`${midiLabel(folded, ctx.state.notation)} ajouté à l’accord`);
    renderCollected();
  }

  function renderCollected() {
    const notes = builder();
    const found = notes.length >= 2 ? detectChords(notes) : [];
    const best = found[0];
    mount(els.collected,
      h('div', { class: 'section-head' }, h('h3', {}, 'Accord en construction'), h('span', { class: 'note' }, `${notes.length} note${notes.length > 1 ? 's' : ''}`)),
      notes.length
        ? h('div', { class: 'pills' }, notes.map((m) => h('button', {
          class: 'pill tn-chip', title: 'Retirer cette note',
          onClick: () => ctx.setUi({ builder: notes.filter((x) => x !== m) }),
        }, midiLabel(m, ctx.state.notation), ' ×')))
        : h('p', { class: 'panel-sub' }, 'Valide une note : elle apparaît ici. À partir de deux ou trois notes, Cadence nomme l’accord.'),
      notes.length >= 2 ? h('div', { class: 'tn-chord' },
        h('div', { class: 'tn-chord-name' }, best ? sym(ctx.label(best)) : 'Accord inconnu'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', onClick: () => ctx.playNotes(notes) }, icon('ear'), 'Écouter'),
          best ? h('button', {
            class: 'btn primary',
            onClick: () => {
              ctx.set((st) => insertChord(st, { root: best.root, quality: best.quality, bass: best.bass }));
              toast(`${ctx.label(best)} ajouté à la progression`);
            },
          }, icon('plus'), 'Ajouter à la progression') : null,
          h('button', { class: 'btn ghost', onClick: () => ctx.setUi({ builder: [] }) }, 'Vider'))) : null);
  }

  function paint() {
    const n = current;
    const now = performance.now();
    els.level.firstChild.style.width = `${Math.min(100, level * 900)}%`;
    if (error) {
      els.note.textContent = '🎤';
      els.cents.textContent = '';
      els.hint.textContent = error;
      els.validate.disabled = true;
      return;
    }
    if (!n) {
      els.note.textContent = '—';
      els.cents.textContent = '';
      els.hint.textContent = now < pausedUntil ? 'Note ajoutée ✓'
        : level > 0 && level < QUIET_LEVEL ? 'Rapproche-toi du micro' : 'Siffle, chante ou fredonne une note tenue';
      needle.querySelector('.tn-needle').style.transform = 'rotate(0deg)';
      needle.classList.remove('is-tuned');
      els.validate.disabled = true;
      els.validate.textContent = 'Valider la note';
      return;
    }
    const tuned = Math.abs(n.cents) <= IN_TUNE_CENTS;
    els.note.replaceChildren(sym(ctx.note(pc(n.midi))), h('small', {}, String(Math.floor(n.midi / 12) - 1)));
    els.cents.textContent = `${n.cents > 0 ? '+' : ''}${n.cents} cents · ${n.freq.toFixed(1)} Hz`;
    els.hint.textContent = tuned ? 'Juste ! Valide la note' : n.cents < 0 ? 'Un peu plus haut ↑' : 'Un peu plus bas ↓';
    needle.querySelector('.tn-needle').style.transform = `rotate(${Math.max(-50, Math.min(50, n.cents)) * 0.9}deg)`;
    needle.classList.toggle('is-tuned', tuned);
    els.validate.disabled = false;
    els.validate.textContent = `Valider ${midiLabel(foldIntoRange(n.midi), ctx.state.notation)}`;
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 4) sum += buffer[i] * buffer[i];
    level = Math.sqrt(sum / (buffer.length / 4));
    const now = performance.now();
    current = now < pausedUntil ? null : tracker.push(buffer);

    const tuned = current && Math.abs(current.cents) <= IN_TUNE_CENTS;
    if (tuned && auto()) {
      if (!inTuneSince || current.midi !== inTuneSince.midi) inTuneSince = { midi: current.midi, at: now };
      const same = lastCaptured && foldIntoRange(current.midi) === lastCaptured.midi && now - lastCaptured.at < 2500;
      if (now - inTuneSince.at > AUTO_HOLD_MS && !same) capture(current.midi);
    } else inTuneSince = 0;
    paint();
  }

  async function start() {
    error = '';
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Micro indisponible sur ce navigateur.'), { name: 'Unsupported' });
      const ac = ctx.synth.ensure();
      if (navigator.audioSession) {
        try { navigator.audioSession.type = 'play-and-record'; } catch { /* ancien Safari */ }
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      source = ac.createMediaStreamSource(stream);
      analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      buffer = new Float32Array(analyser.fftSize);
      tracker = createPitchTracker(ac.sampleRate);
      source.connect(analyser);
    } catch (err) {
      error = err?.name === 'NotAllowedError'
        ? 'Micro refusé. Autorise-le : Réglages › Safari › Micro (ou l’icône aA de la barre d’adresse).'
        : err instanceof Error ? err.message : 'Impossible d’ouvrir le micro.';
    }
    cancelAnimationFrame(raf);
    loop();
  }

  function stop() {
    cancelAnimationFrame(raf);
    source?.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    source = null;
    analyser = null;
    current = null;
    tracker = null;
    if (navigator.audioSession) {
      try { navigator.audioSession.type = 'playback'; } catch { /* ancien Safari */ }
    }
  }

  function open() {
    ctx.player.stop();
    root.classList.add('is-open');
    scrim.classList.add('is-open');
    mount(root,
      h('div', { class: 'sheet-head' },
        h('h2', { class: 'panel-title' }, 'Siffle ', h('em', {}, 'une note')),
        iconButton('close', 'Fermer', close)),
      h('div', { class: 'tn-layout' },
        h('div', { class: 'tn-dial' }, needle, els.note, els.cents, els.hint, els.level),
        h('div', {},
          els.validate,
          toggle('Validation automatique', auto(), (tunerAuto) => ctx.setUi({ tunerAuto }), 'la note est ajoutée dès qu’elle est juste et tenue'),
          els.collected,
          h('p', { class: 'panel-sub tn-tip' }, 'Astuce : coupe la lecture et tiens la note une seconde. L’octave n’a pas d’importance, la note est placée sur le clavier.'))));
    renderCollected();
    paint();
    start();
  }

  function close() {
    stop();
    root.classList.remove('is-open');
    scrim.classList.remove('is-open');
  }

  scrim.addEventListener('click', () => root.classList.contains('is-open') && close());

  return {
    open,
    close,
    isOpen: () => root.classList.contains('is-open'),
    refresh: () => root.classList.contains('is-open') && renderCollected(),
  };
}
