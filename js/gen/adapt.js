// Quand un accord change, la mélodie et la basse écrites se recalent sur le nouvel accord,
// pour que ce qu'on entend corresponde toujours aux accords affichés.
import { pc } from '../theory/notes.js';
import { getScale } from '../theory/scales.js';
import { chordPitchClasses, isRest } from '../theory/chords.js';

const sameHarmony = (a, b) => Boolean(a && b) && Boolean(a.rest) === Boolean(b.rest)
  && (a.rest || (a.root === b.root && a.quality === b.quality && (a.bass ?? null) === (b.bass ?? null)));

function timeline(chords) {
  let t = 0;
  return chords.map((c) => {
    const item = { chord: c, start: t, end: t + c.beats };
    t += c.beats;
    return item;
  });
}

const chordAt = (line, t) => line.find((x) => t >= x.start - 1e-6 && t < x.end - 1e-6)?.chord ?? null;

/**
 * Notes « permises » sur un accord : ses notes, plus les notes de la gamme qui ne frottent pas
 * d'un demi-ton contre une note de l'accord étrangère à la gamme (ex. le la sur Fm en do majeur).
 */
export function allowedPitchClasses(chord, key) {
  const tones = chordPitchClasses(chord);
  const scale = getScale(key.scale).iv.map((iv) => pc(key.root + iv));
  const foreign = tones.filter((p) => !scale.includes(p));
  const clash = (p) => foreign.some((f) => pc(p - f) === 1 || pc(f - p) === 1);
  return [...new Set([...tones, ...scale.filter((p) => !clash(p))])];
}

function nearest(midi, pcs, maxDist = 6) {
  for (let d = 0; d <= maxDist; d += 1) {
    if (pcs.includes(pc(midi - d))) return midi - d;
    if (pcs.includes(pc(midi + d))) return midi + d;
  }
  return midi;
}

const isStrong = (start) => Math.abs(start - Math.round(start)) < 1e-6 && Math.round(start) % 2 === 0;

/** Mélodie : notes fortes sur une note de l'accord, autres notes sans frottement. */
export function adaptMelody(notes, oldChords, newChords, key) {
  const before = timeline(oldChords);
  const after = timeline(newChords);
  return notes.map((n) => {
    const now = chordAt(after, n.start);
    if (!now || isRest(now) || sameHarmony(chordAt(before, n.start), now)) return n;
    const tones = chordPitchClasses(now);
    const target = isStrong(n.start) ? tones : allowedPitchClasses(now, key);
    return target.includes(pc(n.midi)) ? n : { ...n, midi: nearest(n.midi, target) };
  });
}

/** Basse écrite à la main : suit le mouvement de la basse de l'accord, puis se pose sur l'accord. */
export function adaptBass(notes, oldChords, newChords) {
  const before = timeline(oldChords);
  const after = timeline(newChords);
  return notes.map((n) => {
    const was = chordAt(before, n.start);
    const now = chordAt(after, n.start);
    if (!now || isRest(now) || sameHarmony(was, now)) return n;
    let midi = n.midi;
    if (was && !isRest(was)) {
      const move = pc((now.bass ?? now.root) - (was.bass ?? was.root));
      midi += move > 6 ? move - 12 : move;
    }
    const tones = chordPitchClasses(now);
    return { ...n, midi: tones.includes(pc(midi)) ? midi : nearest(midi, tones) };
  });
}
