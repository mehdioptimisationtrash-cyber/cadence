// Audit de la théorie musicale : chaque génération doit jouer exactement ce qui est affiché.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pc, makeSpeller } from '../js/theory/notes.js';
import { SCALES, getScale } from '../js/theory/scales.js';
import { QUALITY_LIST, chordPitchClasses, chordSymbol } from '../js/theory/chords.js';
import { diatonicChords, romanNumeral, suggestNext } from '../js/theory/harmony.js';
import { voiceChord, voiceProgression, VOICINGS } from '../js/theory/voicing.js';
import { TEMPLATES, templateChords, generateProgression, MOODS } from '../js/gen/progressions.js';
import { generateMelody } from '../js/gen/melody.js';
import { arrange } from '../js/gen/arrange.js';
import { allowedPitchClasses } from '../js/gen/adapt.js';
import { sanitizeSong, DEFAULT_SONG } from '../js/state.js';
import { setKey, updateChord, addChord } from '../js/actions.js';

const ROOTS = [...Array(12).keys()];
const scaleSet = (root, id) => new Set(getScale(id).iv.map((iv) => pc(root + iv)));
const chordAtTime = (chords, t) => {
  let s = 0;
  for (const c of chords) {
    if (t >= s && t < s + c.beats) return c;
    s += c.beats;
  }
  return null;
};
const song = (patch) => ({ ...sanitizeSong({ ...DEFAULT_SONG, ...patch }), selected: null, ui: {} });

test('chaque accord de chaque gamme reste dans la gamme (12 tonalités × 19 gammes × 5 niveaux)', () => {
  for (const scale of SCALES) for (const root of ROOTS) for (let level = 3; level <= 7; level += 1) {
    const set = scaleSet(root, scale.id);
    for (const c of diatonicChords({ root, scale: scale.id }, level)) {
      assert.ok(chordPitchClasses(c).every((p) => set.has(p)), `${scale.id} ${root} niveau ${level} : ${c.quality} sur ${c.root}`);
    }
  }
});

test('orthographe : 7 lettres différentes dans chaque gamme heptatonique', () => {
  for (const scale of SCALES.filter((s) => s.iv.length === 7)) for (const root of ROOTS) {
    const sp = makeSpeller(root, scale);
    const letters = scale.iv.map((iv) => sp.spelling(root + iv).letter);
    assert.equal(new Set(letters).size, 7, `${scale.id} sur ${root}`);
  }
});

test('chiffrage romain des degrés en majeur et en mineur', () => {
  assert.deepEqual(diatonicChords({ root: 2, scale: 'major' }, 3).map((c) => romanNumeral(c, { root: 2, scale: 'major' })), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  assert.deepEqual(diatonicChords({ root: 4, scale: 'minor' }, 3).map((c) => romanNumeral(c, { root: 4, scale: 'minor' })), ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
});

test('les voicings jouent exactement les notes de l’accord (37 qualités × 12 × 5 dispositions)', () => {
  for (const q of QUALITY_LIST) for (const root of ROOTS) for (const v of VOICINGS) {
    const chord = { root, quality: q.id };
    const notes = voiceChord(chord, { style: v.id });
    const want = new Set(chordPitchClasses(chord));
    const got = new Set(notes.map(pc));
    assert.ok([...got].every((p) => want.has(p)), `${q.id}/${root}/${v.id} : note étrangère`);
    assert.ok([...want].every((p) => got.has(p)), `${q.id}/${root}/${v.id} : note manquante`);
    assert.ok(notes.every((n) => n >= 30 && n <= 100), `${q.id}/${root}/${v.id} : hors tessiture ${notes}`);
  }
});

test('accords « slash » : la note de basse est bien la plus grave', () => {
  for (const root of ROOTS) for (const bass of ROOTS) for (const v of VOICINGS) {
    if (bass === root) continue;
    const notes = voiceChord({ root, quality: 'maj7', bass }, { style: v.id });
    assert.equal(pc(Math.min(...notes)), bass, `${root}/${bass} ${v.id}`);
  }
});

test('un accord sonne pareil quels que soient ses voisins', () => {
  const a = voiceProgression([{ root: 0, quality: 'maj' }, { root: 7, quality: '7' }, { root: 9, quality: 'm7' }], 'auto');
  const b = voiceProgression([{ root: 4, quality: 'm7b5' }, { root: 1, quality: '13' }, { root: 9, quality: 'm7' }], 'auto');
  assert.deepEqual(a[2], b[2]);
  assert.deepEqual(a[2], voiceChord({ root: 9, quality: 'm7' }, { style: 'auto' }));
});

test('progressions célèbres : bonnes fondamentales dans les 12 tonalités', () => {
  const find = (name) => TEMPLATES.find((t) => t.name === name);
  for (const root of ROOTS) {
    assert.deepEqual(templateChords(find('L’axe pop'), root).map((c) => pc(c.root - root)), [0, 7, 9, 5]);
    assert.deepEqual(templateChords(find('Andalouse'), root).map((c) => [pc(c.root - root), c.quality]), [[0, 'min'], [10, 'maj'], [8, 'maj'], [7, 'maj']]);
    assert.deepEqual(templateChords(find('ii–V–I'), root).map((c) => [pc(c.root - root), c.quality]), [[2, 'm7'], [7, '7'], [0, 'maj7'], [0, 'maj7']]);
  }
  const sp = makeSpeller(0, getScale('major'));
  assert.deepEqual(templateChords(find('Canon, basse qui descend'), 0).map((c) => chordSymbol(c, sp)), ['C', 'G/B', 'Am', 'Em/G', 'F', 'C/E', 'Dm/F', 'G']);
});

test('lecture : chaque note jouée appartient à l’accord affiché (générateur, 8 ambiances × 20 tirages)', () => {
  for (const mood of MOODS) for (let seed = 1; seed <= 20; seed += 1) {
    const key = { root: seed % 12, scale: 'major' };
    const gen = generateProgression({ key, moodId: mood.id, length: 6, seed, audace: 0.8, smoothBass: 0.7, adaptScale: true });
    const k = { root: key.root, scale: gen.scale };
    gen.chords.forEach((c, i) => {
      assert.ok(QUALITY_LIST.some((q) => q.id === c.quality), `qualité ${c.quality}`);
      if (i) assert.ok(!(c.root === gen.chords[i - 1].root && c.quality === gen.chords[i - 1].quality && c.bass === gen.chords[i - 1].bass), `${mood.id}/${seed} : accord répété`);
    });
    const melody = generateMelody({ chords: gen.chords, key: k, params: { style: 'chant' }, seed });
    const st = song({ key: k, chords: gen.chords, melody: { enabled: true, notes: melody }, arrangement: { ...DEFAULT_SONG.arrangement, bassPattern: 'rootFifth', chordPattern: 'arpUp' } });
    for (const e of arrange(st)) {
      const chord = st.chords[e.chord] ?? chordAtTime(st.chords, e.start);
      if (e.track === 'chords') {
        const ok = new Set([...chordPitchClasses(chord), ...(chord.bass == null ? [] : [chord.bass])]);
        assert.ok(ok.has(pc(e.midi)), `${mood.id}/${seed} : note ${e.midi} hors de ${chord.quality}`);
      }
      if (e.track === 'bass') {
        const b = chord.bass ?? chord.root;
        assert.ok([pc(b), pc(b + 7)].includes(pc(e.midi)), `${mood.id}/${seed} : basse ${e.midi} sur ${chord.root}/${chord.bass}`);
      }
      if (e.track === 'melody') {
        const c = chordAtTime(st.chords, e.start);
        assert.ok(allowedPitchClasses(c, k).includes(pc(e.midi)), `${mood.id}/${seed} : mélodie ${e.midi} frotte sur ${c.root} ${c.quality}`);
      }
    }
  }
});

test('changer un accord recale la mélodie et ne touche pas aux autres accords', () => {
  const chords = templateChords(TEMPLATES[0], 0);
  const melody = generateMelody({ chords, key: { root: 0, scale: 'major' }, seed: 4 });
  const st = song({ chords, melody: { enabled: true, notes: melody } });
  const changed = updateChord(st, st.chords[1].id, { root: 4, quality: '7' }); // G → E7
  assert.deepEqual(changed.chords.map((c) => c.root), [0, 4, 9, 5]);
  changed.melody.notes.filter((n) => n.start >= 4 && n.start < 8).forEach((n) => {
    assert.ok(allowedPitchClasses(changed.chords[1], changed.key).includes(pc(n.midi)), `note ${n.midi} frotte sur E7`);
  });
  const outside = (s) => s.melody.notes.filter((n) => n.start < 4 || n.start >= 8).map((n) => n.midi);
  assert.deepEqual(outside(changed), outside(st));
});

test('changement de mode aller-retour', () => {
  const st = song({});
  const back = setKey(setKey(st, { root: 0, scale: 'minor' }), { root: 0, scale: 'major' });
  assert.deepEqual(back.chords.map((c) => [c.root, c.quality]), st.chords.map((c) => [c.root, c.quality]));
});

test('silences : rien ne joue pendant un silence, la suite reste en place', () => {
  const st = addChord(song({}), { rest: true, beats: 4 }, 1);
  const events = arrange(st);
  assert.ok(events.filter((e) => e.track !== 'melody').every((e) => e.start < 4 || e.start >= 8));
  assert.equal(st.chords[1].rest, true);
  assert.equal(sanitizeSong(st).chords[1].rest, true);
});

test('suggestions valides dans toutes les tonalités', () => {
  for (const root of ROOTS) for (const scale of ['major', 'minor', 'dorian', 'harmonicMinor']) {
    const key = { root, scale };
    for (const prev of [null, ...diatonicChords(key, 4)]) {
      const list = suggestNext(prev, key, 4, 8);
      assert.ok(list.length > 0);
      list.forEach((s) => assert.ok(QUALITY_LIST.some((q) => q.id === s.chord.quality)));
    }
  }
});

test('ce que montre l’éditeur = ce que joue la tête de lecture (même avec du swing)', () => {
  const melody = [{ midi: 72, start: 0.5, dur: 0.5, vel: 0.8 }, { midi: 74, start: 1.5, dur: 1, vel: 0.8 }];
  const bass = [{ midi: 41, start: 0, dur: 1.5, vel: 0.8 }, { midi: 43, start: 4.5, dur: 1, vel: 0.8 }];
  const st = song({ melody: { enabled: true, notes: melody }, bassLine: { custom: true, notes: bass }, arrangement: { ...DEFAULT_SONG.arrangement, swing: 1 } });
  const ev = arrange(st);
  const pick = (t) => ev.filter((e) => e.track === t).map(({ midi, start, dur }) => ({ midi, start, dur }));
  assert.deepEqual(pick('melody'), melody.map(({ midi, start, dur }) => ({ midi, start, dur })));
  assert.deepEqual(pick('bass'), bass.map(({ midi, start, dur }) => ({ midi, start, dur })));
});
