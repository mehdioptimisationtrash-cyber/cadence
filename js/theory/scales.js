// Gammes et modes. spell = [décalage vers la tonalité majeure parente, degré de la tonique dans celle-ci].

export const SCALES = [
  { id: 'major', name: 'Majeur', hint: 'ionien · lumineux', group: 'Modes', iv: [0, 2, 4, 5, 7, 9, 11], spell: [0, 0] },
  { id: 'minor', name: 'Mineur', hint: 'éolien · mélancolique', group: 'Modes', iv: [0, 2, 3, 5, 7, 8, 10], spell: [3, 5] },
  { id: 'dorian', name: 'Dorien', hint: 'mineur soul, funky', group: 'Modes', iv: [0, 2, 3, 5, 7, 9, 10], spell: [10, 1] },
  { id: 'phrygian', name: 'Phrygien', hint: 'sombre, hispanique', group: 'Modes', iv: [0, 1, 3, 5, 7, 8, 10], spell: [8, 2] },
  { id: 'lydian', name: 'Lydien', hint: 'rêveur, cinéma', group: 'Modes', iv: [0, 2, 4, 6, 7, 9, 11], spell: [7, 3] },
  { id: 'mixolydian', name: 'Mixolydien', hint: 'rock, blues', group: 'Modes', iv: [0, 2, 4, 5, 7, 9, 10], spell: [5, 4] },
  { id: 'locrian', name: 'Locrien', hint: 'instable, tendu', group: 'Modes', iv: [0, 1, 3, 5, 6, 8, 10], spell: [1, 6] },
  { id: 'harmonicMinor', name: 'Mineur harmonique', hint: 'classique, dramatique', group: 'Mineurs & couleurs', iv: [0, 2, 3, 5, 7, 8, 11], spell: [3, 5] },
  { id: 'melodicMinor', name: 'Mineur mélodique', hint: 'jazz moderne', group: 'Mineurs & couleurs', iv: [0, 2, 3, 5, 7, 9, 11], spell: [3, 5] },
  { id: 'harmonicMajor', name: 'Majeur harmonique', hint: 'doux-amer', group: 'Mineurs & couleurs', iv: [0, 2, 4, 5, 7, 8, 11], spell: [0, 0] },
  { id: 'phrygianDominant', name: 'Phrygien dominant', hint: 'oriental, flamenco', group: 'Mineurs & couleurs', iv: [0, 1, 4, 5, 7, 8, 10], spell: [8, 2] },
  { id: 'lydianDominant', name: 'Lydien dominant', hint: 'fusion, Simpsons', group: 'Mineurs & couleurs', iv: [0, 2, 4, 6, 7, 9, 10], spell: [5, 4] },
  { id: 'doubleHarmonic', name: 'Double harmonique', hint: 'byzantin, mystique', group: 'Mineurs & couleurs', iv: [0, 1, 4, 5, 7, 8, 11], spell: [8, 2] },
  { id: 'hungarianMinor', name: 'Mineur hongrois', hint: 'tzigane, épique', group: 'Mineurs & couleurs', iv: [0, 2, 3, 6, 7, 8, 11], spell: [3, 5] },
  { id: 'majorPentatonic', name: 'Penta majeure', hint: 'folk, pop', group: 'Pentatoniques', iv: [0, 2, 4, 7, 9], letters: [0, 1, 2, 4, 5], spell: [0, 0] },
  { id: 'minorPentatonic', name: 'Penta mineure', hint: 'rock, hip-hop', group: 'Pentatoniques', iv: [0, 3, 5, 7, 10], letters: [0, 2, 3, 4, 6], spell: [3, 5] },
  { id: 'blues', name: 'Blues', hint: 'avec la blue note', group: 'Pentatoniques', iv: [0, 3, 5, 6, 7, 10], letters: [0, 2, 3, 4, 4, 6], spell: [3, 5] },
  { id: 'hirajoshi', name: 'Hirajoshi', hint: 'japonais', group: 'Pentatoniques', iv: [0, 2, 3, 7, 8], letters: [0, 1, 2, 4, 5], spell: [3, 5] },
  { id: 'insen', name: 'In-sen', hint: 'japonais, sombre', group: 'Pentatoniques', iv: [0, 1, 5, 7, 10], letters: [0, 1, 3, 4, 6], spell: [8, 2] },
];

const BY_ID = Object.fromEntries(SCALES.map((s) => [s.id, s]));

export function getScale(id) {
  return BY_ID[id] ?? BY_ID.major;
}

export const isHeptatonic = (scale) => scale.iv.length === 7;

// Une gamme sonne « mineure » si sa tierce est mineure.
export const isMinorScale = (scale) => scale.iv.includes(3) && !scale.iv.includes(4);

export function scalePitchClasses(root, scaleId) {
  return getScale(scaleId).iv.map((iv) => (root + iv) % 12);
}
