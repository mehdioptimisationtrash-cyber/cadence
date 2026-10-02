// Basse écrite face aux modifications de la progression.
// 1. Les notes suivent leur accord (insertion, suppression, déplacement, durée).
// 2. La basse écrite n'est JAMAIS retouchée, sauf si l'on choisit explicitement une autre basse
//    pour l'accord (renversement, accord « slash », retour à la fondamentale).
import { pc } from '../theory/notes.js';
import { getScale } from '../theory/scales.js';
import { chordPitchClasses, isRest } from '../theory/chords.js';

const EPS = 1e-6;

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

const slotAt = (line, t) => line.find((x) => t >= x.start - EPS && t < x.end - EPS) ?? null;

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

const isStrong = (start) => Math.abs(start - Math.round(start)) < EPS && Math.round(start) % 2 === 0;

/**
 * Déplace chaque note avec l'accord sous lequel elle se trouve. Les notes d'un accord supprimé
 * disparaissent ; une note qui dépasse un accord raccourci est coupée.
 * Renvoie { note, was, now } pour que l'appelant sache sur quel accord elle tombe.
 */
function follow(notes, oldChords, newChords) {
  const before = timeline(oldChords);
  const after = new Map(timeline(newChords).map((x) => [x.chord.id, x]));
  const shared = oldChords.some((c) => after.has(c.id));
  const afterLine = timeline(newChords);
  return notes.flatMap((n) => {
    const host = slotAt(before, n.start);
    if (!shared || !host) {
      // Progression entièrement remplacée (ou note après la fin) : la note reste à son temps.
      return [{ note: n, was: host?.chord ?? null, now: slotAt(afterLine, n.start)?.chord ?? null }];
    }
    const target = after.get(host.chord.id);
    if (!target) return [];
    const offset = n.start - host.start;
    if (offset >= target.chord.beats - EPS) return [];
    const start = target.start + offset;
    const fitted = noteEndWithin(n, host) ? Math.min(n.dur, target.end - start) : n.dur;
    return [{ note: { ...n, start, dur: Math.max(0.05, fitted) }, was: host.chord, now: target.chord }];
  });
}

const noteEndWithin = (n, host) => n.start + n.dur <= host.end + EPS;

/** Basse écrite : suit ses accords, mais ses notes ne changent que si on change la basse de l'accord. */
export function adaptBass(notes, oldChords, newChords) {
  return follow(notes, oldChords, newChords).map(({ note, was, now }) => {
    if (!was || !now || isRest(now) || isRest(was)) return note;
    if ((was.bass ?? null) === (now.bass ?? null)) return note;
    // Seules les notes posées sur l'ancienne basse de l'accord passent sur la nouvelle.
    if (pc(note.midi) !== pc(was.bass ?? was.root)) return note;
    const target = pc(now.bass ?? now.root);
    const move = pc(target - note.midi);
    return { ...note, midi: note.midi + (move > 6 ? move - 12 : move) };
  });
}
