// Édition de notes (mélodie, basse) : fonctions pures, sans chevauchement (pistes monophoniques).

export const MIN_DUR = 0.125;
const EPS = 1e-6;

export const noteEnd = (n) => n.start + n.dur;
export const overlaps = (a, b) => a.start < noteEnd(b) - EPS && b.start < noteEnd(a) - EPS;
export const sortNotes = (notes) => [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi);
export const sameNote = (a, b) => Boolean(a && b) && Math.abs(a.start - b.start) < EPS && a.midi === b.midi;

export function snapBeat(beat, grid) {
  return Math.round(beat / grid) * grid;
}

export function floorBeat(beat, grid) {
  return Math.floor(beat / grid + EPS) * grid;
}

export function clampNote(note, end) {
  const start = Math.max(0, Math.min(end - MIN_DUR, note.start));
  return {
    ...note,
    start,
    dur: Math.max(MIN_DUR, Math.min(end - start, note.dur)),
    midi: Math.max(0, Math.min(127, Math.round(note.midi))),
  };
}

/**
 * Pose une note : les notes qu'elle recouvre sont raccourcies (si elles commencent avant)
 * ou retirées (si elles commencent pendant). Renvoie { notes, note } avec la note posée.
 */
export function placeNote(notes, note, end) {
  const placed = clampNote(note, end);
  const kept = notes.flatMap((o) => {
    if (!overlaps(o, placed)) return [o];
    const room = placed.start - o.start;
    return o.start < placed.start && room >= MIN_DUR - EPS ? [{ ...o, dur: room }] : [];
  });
  return { notes: sortNotes([...kept, placed]), note: placed };
}

export function findNote(notes, target) {
  return notes.findIndex((n) => sameNote(n, target));
}

export function updateNote(notes, target, patch, end) {
  const idx = findNote(notes, target);
  if (idx < 0) return { notes, note: null };
  return placeNote(notes.filter((_, i) => i !== idx), { ...notes[idx], ...patch }, end);
}

export function removeNote(notes, target) {
  return notes.filter((n) => !sameNote(n, target));
}

export function duplicateNote(notes, target, end) {
  const idx = findNote(notes, target);
  if (idx < 0) return { notes, note: null };
  const src = notes[idx];
  if (noteEnd(src) + MIN_DUR > end + EPS) return { notes, note: src };
  return placeNote(notes, { ...src, start: noteEnd(src) }, end);
}

/** Hauteur voisine : par degré de la gamme (pcs fourni) ou par demi-ton. */
export function stepPitch(midi, dir, scalePcs = null) {
  if (!scalePcs) return midi + dir;
  const set = new Set(scalePcs);
  let m = midi + dir;
  for (let i = 0; i < 12 && !set.has(((m % 12) + 12) % 12); i += 1) m += dir;
  return m;
}
