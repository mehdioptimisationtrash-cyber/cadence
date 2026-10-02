// Outils : export MIDI, bibliothèque, partage, détecteur d'accords, réglages, aide.
import { h, sym, icon, mount, section, segmented, toast } from './dom.js';
import { midiFromState } from '../midi/export.js';
import { loadLibrary, saveToLibrary, removeFromLibrary, shareUrl, sanitizeSong } from '../state.js';
import { APP_VERSION } from '../version.js';

function fileName(ctx, suffix = '') {
  const s = ctx.state;
  const key = ctx.keyName().replace(/♯/g, 'd').replace(/♭/g, 'b').replace(/\s+/g, '-');
  return `cadence-${key}-${s.tempo}bpm${suffix}.mid`.toLowerCase();
}

const EXPORTS = [
  { value: 'all', label: 'Tout', opts: {}, suffix: '', hint: 'accords et basse, tels qu’on les entend' },
  { value: 'block', label: 'Plaqués', opts: { blockChords: true }, suffix: '-plaque', hint: 'accords tenus, faciles à retravailler' },
  { value: 'chords', label: 'Accords', opts: { only: 'chords' }, suffix: '-accords', hint: 'les accords seuls, tels qu’on les entend' },
  { value: 'bass', label: 'Basse', opts: { only: 'bass' }, suffix: '-basse', hint: 'la ligne de basse seule' },
];

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;
// Le glisser-déposer d'un fichier vers le Finder ou un logiciel n'existe que dans Chrome / Edge.
const canDragOut = () => Boolean(navigator.userAgentData?.brands?.some((b) => /Chromium/.test(b.brand)));

function midiFile(ctx, kind) {
  const s = ctx.state;
  if (!s.chords.length) return null;
  const choice = EXPORTS.find((e) => e.value === kind) ?? EXPORTS[0];
  const bytes = midiFromState(s, choice.opts);
  return { bytes, name: fileName(ctx, choice.suffix) };
}

const asFile = ({ bytes, name }) => new File([bytes], name, { type: 'audio/midi' });

/** Menu de partage du système : AirDrop, Fichiers, Messages… (iPhone, et Safari sur Mac). */
async function shareFile(midi) {
  const file = asFile(midi);
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: midi.name });
  } catch (err) {
    if (err?.name !== 'AbortError') toast('Partage impossible — essaie « Enregistrer »');
  }
  return true;
}

function downloadFile(midi) {
  const url = URL.createObjectURL(asFile(midi));
  const a = h('a', { href: url, download: midi.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`${midi.name} enregistré`);
}

function toBase64(bytes) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function dragTile(ctx, kind) {
  const ok = canDragOut();
  const tile = h('div', {
    class: `drag-tile${ok ? '' : ' is-disabled'}`,
    draggable: ok ? 'true' : 'false',
    role: 'img',
    'aria-label': 'Fichier MIDI à glisser dans ton logiciel',
  },
  h('span', { class: 'drag-icon' }, icon('file')),
  h('div', {},
    h('b', {}, ok ? 'Glisse-moi dans Logic, Ableton…' : 'Glisser-déposer : ouvre Cadence dans Chrome'),
    h('small', {}, ok
      ? 'ou sur le Bureau pour créer le fichier .mid'
      : 'Safari ne permet pas de faire glisser un fichier hors de la page. Ici, utilise « Enregistrer » puis glisse le fichier depuis Téléchargements.')));
  tile.addEventListener('dragstart', (e) => {
    const midi = midiFile(ctx, kind);
    if (!midi) {
      e.preventDefault();
      toast('Rien à exporter pour l’instant');
      return;
    }
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('DownloadURL', `audio/midi:${midi.name}:data:audio/midi;base64,${toBase64(midi.bytes)}`);
    e.dataTransfer.setData('text/plain', midi.name);
    tile.classList.add('is-dragging');
  });
  tile.addEventListener('dragend', () => tile.classList.remove('is-dragging'));
  return tile;
}

function exportSection(ctx) {
  const kind = ctx.state.ui.exportKind ?? 'all';
  const choice = EXPORTS.find((e) => e.value === kind) ?? EXPORTS[0];
  const get = () => {
    const midi = midiFile(ctx, kind);
    if (!midi) toast('Rien à exporter pour l’instant');
    return midi;
  };
  const share = async () => {
    const midi = get();
    if (midi && !(await shareFile(midi))) downloadFile(midi);
  };
  const save = () => {
    const midi = get();
    if (midi) downloadFile(midi);
  };
  const canShareFiles = typeof navigator.canShare === 'function';
  const touch = isTouch();
  const shareBtn = h('button', { class: `btn${touch ? ' primary big' : ''}`, onClick: share }, icon('share'), touch ? 'Partager · AirDrop, Fichiers…' : 'Partager (AirDrop…)');
  return section('Exporter en MIDI', choice.hint,
    segmented(EXPORTS, kind, (exportKind) => ctx.setUi({ exportKind }), { full: true, label: 'Contenu du fichier' }),
    touch
      ? h('div', { class: 'export-actions' },
        shareBtn,
        h('button', { class: 'btn', onClick: save }, icon('download'), 'Enregistrer dans Fichiers'),
        h('p', { class: 'panel-sub' }, 'AirDrop envoie le fichier sur ton Mac (il arrive dans Téléchargements) ; « Enregistrer dans Fichiers » le garde sur l’iPhone pour GarageBand, Cubasis…'))
      : h('div', { class: 'export-actions' },
        dragTile(ctx, kind),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', onClick: save }, icon('download'), 'Enregistrer le .mid'),
          canShareFiles ? shareBtn : null)),
    h('p', { class: 'panel-sub', style: { marginTop: '8px' } }, 'Une piste pour les accords, une pour la basse, tempo inclus.'));
}

function librarySection(ctx, rerender) {
  const items = loadLibrary();
  const input = h('input', { class: 'text', placeholder: 'Nom de l’idée (ex. Refrain nuit)', maxlength: 80 });
  const save = () => {
    const name = input.value.trim() || `${ctx.keyName()} · ${new Date().toLocaleDateString('fr-FR')}`;
    toast(saveToLibrary(name, ctx.state) ? `« ${name} » sauvegardé` : 'Sauvegarde impossible (stockage plein ?)');
    rerender();
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
  return section('Mes idées', `${items.length} sauvegardées sur cet appareil`,
    h('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } }, input, h('button', { class: 'btn primary', onClick: save }, 'Sauver')),
    items.map((it) => h('div', { class: 'lib-item' },
      h('div', {}, h('div', { class: 'lib-name' }, it.name),
        h('div', { class: 'lib-meta' }, `${it.song.chords.length} accords · ${it.song.tempo} bpm · ${new Date(it.savedAt).toLocaleDateString('fr-FR')}`)),
      h('div', { class: 'row-actions', style: { display: 'flex', gap: '4px' } },
        h('button', {
          class: 'btn',
          onClick: () => {
            ctx.player.stop();
            ctx.set((st) => ({ ...st, ...sanitizeSong(it.song), selected: null }));
            toast(`« ${it.name} » chargé`);
          },
        }, 'Ouvrir'),
        h('button', {
          class: 'icon-btn small', 'aria-label': `Supprimer ${it.name}`,
          onClick: () => {
            removeFromLibrary(it.id);
            rerender();
          },
        }, icon('trash'))))));
}

function shareSection(ctx) {
  const share = async () => {
    const url = shareUrl(ctx.state);
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ url, title: 'Ma progression Cadence' });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Lien copié');
    } catch {
      window.prompt('Copie ce lien :', url);
    }
  };
  return section('Partager', 'le lien contient toute la musique',
    h('button', { class: 'btn', onClick: share }, icon('share'), 'Lien de partage'));
}

const HELP = [
  ['Construire', 'Dans <b>Accords</b>, touche un accord pour l’écouter et + pour l’ajouter. La section « Après… » propose les enchaînements les plus naturels, avec la raison musicale.'],
  ['Couleurs', '<b>Vert</b> = tonique (repos), <b>jaune</b> = sous-dominante (élan), <b>rouge</b> = dominante (tension), <b>rose</b> = dominante secondaire, <b>violet</b> = emprunt à un autre mode.'],
  ['Modifier', 'Touche une carte de la progression : durée, renversement, basse, qualité, variantes. Glisse la poignée ⋮⋮ pour réordonner.'],
  ['Générer', 'Dans <b>Générer</b>, choisis une ambiance et lance les dés, ou pars d’une progression célèbre. Change la tonalité en haut : les accords suivent.'],
  ['Basse', 'Le bouton ✎ Basse au-dessus du piano roll ouvre l’éditeur : glisse pour te déplacer, pince pour zoomer, crayon pour ajouter, touche une note pour la modifier.'],
  ['Clavier', 'Joue sur le clavier du milieu (plusieurs doigts) : la note et l’accord s’affichent, « Ajouter » le met dans la progression. <b>Maintenir</b> construit un accord note par note ; <b>Siffler</b> ouvre l’accordeur micro. Sur Mac, les touches Q/A S D F G H J K jouent les notes (W/Z X pour l’octave).'],
  ['Exporter', 'Dans <b>Outils</b> : sur iPhone, « Partager » envoie le fichier MIDI par AirDrop ou dans Fichiers ; sur Mac (Chrome), glisse la tuile directement dans Logic, Ableton, FL Studio…'],
  ['Raccourcis Mac', '<b>Espace</b> lecture · <b>1–7</b> ajoute le degré · <b>⌘Z / ⇧⌘Z</b> annuler / rétablir · <b>Suppr</b> retire l’accord sélectionné · <b>← →</b> sélection.'],
];

export function renderToolsPanel(container, ctx) {
  const rerender = () => renderToolsPanel(container, ctx);
  mount(container,
    h('h2', { class: 'panel-title' }, 'Outils'),
    exportSection(ctx),
    librarySection(ctx, rerender),
    shareSection(ctx),
    section('Nom des notes', null, segmented([{ value: 'en', label: 'C D E' }, { value: 'fr', label: 'Do Ré Mi' }], ctx.state.notation,
      (notation) => ctx.set((st) => ({ ...st, notation }), { history: false }), { full: true })),
    h('details', { class: 'fold help' }, h('summary', {}, 'Mode d’emploi'),
      h('div', { class: 'fold-body' }, HELP.map(([title, text]) => h('p', { html: `<b>${title}.</b> ${text}` })))),
    h('div', { class: 'version' }, `Cadence · version ${APP_VERSION} · fonctionne hors ligne`));
}
