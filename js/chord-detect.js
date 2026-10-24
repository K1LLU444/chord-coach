// "What chord is this?": name the chord made by the keys that are down (pitch classes only; the lowest key is the bass).

import { CHORD_TYPES, ROOTS, makeChord, noteName } from './theory.js';

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const COMMON = ['maj', 'min', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug', '6', 'm6', 'add9', 'madd9', 'm7b5', 'dim7', '9', 'm9', 'maj9', '7sus4'];

/**
 * Chords whose notes are exactly the notes pressed. midis = key numbers. Returns [{ symbol, root, slash }] best first:
 * common chord types before rare ones, and a chord whose root is the lowest key before a slash chord.
 * Two or fewer different notes name no chord.
 */
export function identifyChord(midis) {
  const pcs = [...new Set(midis.map(m => ((m % 12) + 12) % 12))].sort((a, b) => a - b);
  if (pcs.length < 3) return [];
  const lowest = ((Math.min(...midis) % 12) + 12) % 12;
  const found = [];
  for (const root of ROOTS) {
    for (const id of COMMON) {
      const type = CHORD_TYPES.find(t => t.id === id);
      const chord = makeChord(root, type);
      const set = [...new Set(chord.pcs)].sort((a, b) => a - b);
      if (set.length === pcs.length && set.every((v, i) => v === pcs[i])) {
        found.push({ symbol: chord.symbol, root: chord.rootPc, slash: chord.rootPc === lowest ? null : NAMES[lowest], rank: COMMON.indexOf(id) + (chord.rootPc === lowest ? 0 : 40) });
      }
    }
  }
  return found.sort((a, b) => a.rank - b.rank).map(({ symbol, root, slash }) => ({ symbol: slash ? `${symbol}/${slash}` : symbol, root, slash }));
}

/** The names of the keys as text: "B♭3 D4 F4". */
export const keyList = (midis, flats = false) => [...midis].sort((a, b) => a - b)
  .map(m => `${noteName(m, flats).replace('#', '♯').replace('b', '♭')}${Math.floor(m / 12) - 1}`).join(' ');
