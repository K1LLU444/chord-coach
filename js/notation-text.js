// Typing music instead of tapping it: "Bb4:1 C5:1 D5:1 | Eb5:3 D5:2 C5:1 | r:3 F4:3".
// A note is its letter, an optional ♭/♯ (b or #), its octave (middle C is C4), and ":" with its length in counts.
// Several keys on one count (a chord) are joined with + : C4+E4+G4:2. A rest is "r:" and a length.
// A length that is left out is the same as the one before. "|" starts the next bar.
// A "~" after a note holds it into the next bar (a tie): Bb4:1~ | Bb4:1 sounds once and lasts two counts.

import { noteName } from './theory.js';

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ONE = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/;
const REST = /^[rR](?::(\d+(?:\.\d+)?))?$/;

/**
 * Read typed music. Returns { bars: [[{ m, d }]], errors: [{ bar (1-based, within the text), message }], notes }.
 * `pulses` is how many counts a bar holds; a bar that is not full ends in silence. Nothing should be used when errors is not empty.
 */
export function parseNotation(text, pulses) {
  const bars = [[]];
  const errors = [];
  let length = 1;
  let notes = 0;
  const used = [0];
  const tokens = String(text).replace(/\|/g, ' | ').split(/\s+/).filter(Boolean);
  // a "|" at the very start or end only frames the music, it doesn't make an empty bar
  while (tokens[0] === '|') tokens.shift();
  while (tokens.at(-1) === '|') tokens.pop();
  const bad = message => errors.push({ bar: bars.length, message });
  for (const raw of tokens) {
    const tie = raw.length > 1 && raw.endsWith('~');
    const token = tie ? raw.slice(0, -1) : raw;
    if (token === '|') {
      bars.push([]);
      used.push(0);
      continue;
    }
    const rest = token.match(REST);
    if (tie && rest) {
      bad('A rest can’t be tied. Put the “~” after a note, like Bb4:2~.');
      continue;
    }
    const [body, ...lengthPart] = token.split(':');
    const keys = rest ? [] : body.split('+').map(k => k.match(ONE));
    if (!rest && (keys.some(k => !k) || lengthPart.length > 1)) {
      bad(`I can’t read “${token}”. A note looks like Bb4:2 (letter, octave, “:”, counts), several keys on one count like C4+E4+G4:2, and a rest like r:2.`);
      continue;
    }
    const given = rest ? rest[1] : lengthPart[0];
    if (given !== undefined) length = Number(given);
    if (!(length > 0) || Math.round(length * 2) !== length * 2) {
      bad(`“${token}” has a length of ${length}; use whole counts or half counts (1, 1.5, 2 …).`);
      continue;
    }
    let m = 0;
    let more = [];
    if (keys.length) {
      const midis = keys.map(k => (Number(k[3]) + 1) * 12 + PC[k[1].toUpperCase()] + (k[2] === '#' || k[2] === '♯' ? 1 : k[2] === 'b' || k[2] === '♭' ? -1 : 0));
      if (midis.some(x => x < 21 || x > 108)) {
        bad(`“${token}” is outside the piano (A0 to C8).`);
        continue;
      }
      const sorted = [...new Set(midis)].sort((a, b) => a - b);
      m = sorted[0];
      more = sorted.slice(1);
      notes++;
    }
    const at = bars.length - 1;
    used[at] += length;
    if (used[at] > pulses + 1e-9) {
      bad(`this bar has ${used[at]} counts but a bar holds ${pulses}.`);
      used[at] -= length;
      continue;
    }
    bars[at].push({ m, d: length, ...(more.length ? { with: more } : {}), ...(tie ? { tie: true } : {}) });
  }
  // trailing rests at the end of a bar are just silence
  for (const bar of bars) while (bar.length && bar.at(-1).m === 0) bar.pop();
  return { bars: tokens.length ? bars : [], errors: dedupe(errors), notes };
}

function dedupe(errors) {
  const seen = new Set();
  return errors.filter(e => {
    const key = `${e.bar}:${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Music as typed text again (to edit it): bars separated by “|”, a length written only when it changes. */
export function notationOf(bars, flats = false) {
  let length = 1;
  return bars.map(bar => bar.map(({ m, d, with: more, tie }) => {
    const name = m ? [m, ...(more ?? [])].map(k => `${noteName(k, flats)}${Math.floor(k / 12) - 1}`).join('+') : 'r';
    const out = d === length && m ? name : `${name}:${d}`;
    length = d;
    return tie && m ? `${out}~` : out;
  }).join(' ')).join(' | ');
}
