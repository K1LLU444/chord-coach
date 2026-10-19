// Looks at a song (its chords, plus the strumming pattern when it came from Ultimate Guitar)
// and suggests how to practise it: playing style, tempo, how to count, and easier chords to start with.

import { TYPE_BY_ID, makeChord, parseSong } from './theory.js';
import { DEFAULT_FEEL, signatureOf } from './rhythm.js';

/** The plain triad a chord can be played as while you are still learning (Bb7 → Bb, Ebm6 → Ebm). */
export function simplerChord(chord) {
  const iv = chord.type.intervals.map(i => i % 12);
  let type = 'maj';
  if (iv.includes(3) && iv.includes(6)) type = 'dim';
  else if (iv.includes(8) && iv.includes(4)) type = 'aug';
  else if (!iv.includes(3) && !iv.includes(4)) type = iv.includes(5) ? 'sus4' : 'sus2';
  else if (iv.includes(3)) type = 'min';
  return makeChord(chord.root, TYPE_BY_ID[type]);
}

/** "1-2-3  4-5-6": the counts of one bar, grouped by main beat. */
export function countText(feel) {
  const groups = [];
  for (let start = 0; start < feel.pulses; start += feel.group) {
    groups.push(Array.from({ length: feel.group }, (_, i) => start + i + 1).join('-'));
  }
  return groups.join('  ');
}

/**
 * What to suggest for a song. `song.meta.feel` (from the strumming pattern) is used when there is one.
 * Chart timing isn't included in chord charts, so a sample plays one chord per bar.
 */
export function analyzeSong(song) {
  const { chords } = parseSong(song.text);
  const feel = song.meta?.feel ?? null;
  const used = feel ?? DEFAULT_FEEL;

  const unique = [...new Map(chords.map(c => [c.symbol, c])).values()];
  const easier = unique
    .map(c => [c, simplerChord(c)])
    .filter(([c, simple]) => simple.symbol !== c.symbol)
    .map(([c, simple]) => ({ from: c.symbol, to: simple.symbol }));
  const starter = [...new Set(unique.map(c => simplerChord(c).symbol))];

  const hits = used.hits.filter(h => !h.rest).length;
  const style = feel && hits >= used.pulses / 2 ? 'strum' : 'bass';
  const why = feel
    ? `The chart's strumming pattern hits the chord on ${hits} of its ${used.pulses} counts, so on piano the right hand strikes the whole chord on those counts and the left hand adds the bass.`
    : 'This song came without a strumming pattern, so Bass + chord is a safe place to start.';

  return {
    chordCount: chords.length,
    unique: unique.map(c => c.symbol),
    easier,
    starter,
    hasPattern: Boolean(feel),
    feel: used,
    signature: signatureOf(used).join('/'),
    mainBeats: used.pulses / used.group,
    style,
    why,
    key: song.meta?.key || '',
  };
}
