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

/**
 * The shape of a song: the order of its sections, and the distinct chord lines (sections with the same
 * chords are listed once, with all their names). Used for the printed song sheet.
 */
export function songForm(song) {
  const { chords, sections } = parseSong(song.text);
  const headings = [...sections].sort((a, b) => a.start - b.start);
  const parts = [];
  if (!headings.length) parts.push({ name: 'Song', start: 0 });
  else if (headings[0].start > 0) parts.push({ name: 'Start', start: 0 }); // chords written before the first heading
  parts.push(...headings.map(s => ({ name: s.name, start: s.start })));
  parts.forEach((part, i) => {
    part.chords = chords.slice(part.start, parts[i + 1]?.start ?? chords.length).map(c => c.symbol);
  });

  const filled = parts.filter(p => p.chords.length);
  const byChords = new Map();
  for (const part of filled) {
    const key = part.chords.join(' ');
    if (!byChords.has(key)) byChords.set(key, { names: [], chords: part.chords });
    const group = byChords.get(key);
    if (!group.names.includes(part.name)) group.names.push(part.name);
  }
  // Two lines that share a name but have different chords (a changed ending, say) are told apart with a number.
  const seen = new Map();
  const groups = [...byChords.values()].map(g => ({
    ...g,
    names: g.names.map(n => {
      const count = (seen.get(n) ?? 0) + 1;
      seen.set(n, count);
      return count > 1 ? `${n} (${count})` : n;
    }),
  }));
  return { order: filled.map(p => p.name), groups };
}
