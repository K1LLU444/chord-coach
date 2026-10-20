// A song's tune: one list of notes per bar (one bar for each chord of the song), entered by the player.
// { pulses, group, bars: [[{ m, d }]] } where m is the key (MIDI number, 0 = a rest) and d the length in pulses.
// The tune is kept on this device (and in share links); nothing is uploaded.

import { tuneLength } from './rhythm.js';
import { noteName } from './theory.js';

/** An empty tune with a bar for each chord, in the same count (pulses per bar) as the song. */
export const newMelody = (feel, barCount) => ({
  pulses: feel.pulses,
  group: feel.group,
  bars: Array.from({ length: barCount }, () => []),
});

/** Make sure there is a bar for every chord (the song may have been edited since the tune was entered). */
export function fitBars(melody, barCount) {
  while (melody.bars.length < barCount) melody.bars.push([]);
  return melody;
}

/** How many pulses of a bar are still empty. */
export const roomIn = (melody, bar) => melody.pulses - tuneLength(melody.bars[bar] ?? []);

/** Add a note (or a rest, m = 0) to the end of a bar. Returns { ok: true, full } or { ok: false, room }. */
export function addNote(melody, bar, m, d) {
  const room = roomIn(melody, bar);
  if (d > room) return { ok: false, room };
  melody.bars[bar].push({ m, d });
  return { ok: true, full: roomIn(melody, bar) === 0 };
}

/** Take the last note off a bar. Returns what was removed, or null. */
export const undoNote = (melody, bar) => melody.bars[bar]?.pop() ?? null;

/** True when there is no sounding note in the tune or its bass line. */
export const isEmpty = melody => !melody || (!melody.bars.some(bar => bar.some(n => n.m)) && !hasBass(melody));

/** True when the song has a bass line of its own. */
export const hasBass = melody => Boolean(melody?.bass?.some(bar => bar.some(n => n.m)));

/** The bass line's bars, created (empty) when the song has none yet, with a bar for each of `count` chords. */
export function bassBars(melody, count) {
  melody.bass ??= [];
  while (melody.bass.length < count) melody.bass.push([]);
  return melody.bass;
}

/** "F4" for key 65. Flats (B♭) when asked, else sharps. */
export const keyName = (m, flats = false) => `${noteName(m, flats)}${Math.floor(m / 12) - 1}`;

/** A note as a short piece of text: "F4 · 2 counts", or "rest · 1 count". */
export function noteText({ m, d }, flats = false) {
  return `${m ? keyName(m, flats) : 'rest'} · ${d} count${d === 1 ? '' : 's'}`;
}

const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

/** Whether a song's key is written with flats (so tune notes are named B♭, not A♯). */
export const prefersFlats = key => FLAT_KEYS.has(String(key ?? '').trim().replace('♭', 'b').replace(/\s*(minor|min)$/i, 'm'));

// ---------- the "pick by count" grid ----------
// A bar is a row of counts; each count either starts a note (a key number), starts a rest (0) or carries on (null).

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The notes (0–11) of a song's key, as a Set. keyText like "Bb", "F#m" or "Gm"; without one, the major key that fits the song's chords best. */
export function keyScale(keyText, chords = []) {
  const m = String(keyText ?? '').trim().replace('♭', 'b').replace('♯', '#').match(/^([A-G])([b#]?)(m|min|minor)?$/i);
  const from = (tonic, steps) => new Set(steps.map(s => (tonic + s) % 12));
  if (m) {
    const tonic = (LETTER_PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? 11 : 0)) % 12;
    return from(tonic, m[3] ? MINOR : MAJOR);
  }
  const used = chords.flatMap(c => c.pcs);
  let best = 0;
  let bestScore = -1;
  for (let tonic = 0; tonic < 12; tonic++) {
    const scale = from(tonic, MAJOR);
    const score = used.filter(pc => scale.has(pc)).length;
    if (score > bestScore) {
      best = tonic;
      bestScore = score;
    }
  }
  return from(best, MAJOR);
}

/**
 * The keys to offer for a bar's chord from `low` to `high`: its chord notes and the notes of the key (with `all`, every key,
 * so notes outside the key such as a G♭ over B♭ can be used too). Highest first: [{ m, chordTone, inKey }].
 */
export function candidateRows(chord, scale, low, high, all = false) {
  const rows = [];
  for (let m = high; m >= low; m--) {
    const chordTone = chord.pcs.includes(m % 12);
    const inKey = scale.has(m % 12);
    if (all || chordTone || inKey) rows.push({ m, chordTone, inKey });
  }
  return rows;
}

/**
 * A bar's notes as cells: `sub` cells for each count (1 = a cell per count, 2 = half counts too), or null when the bar holds
 * notes that start or end between cells.
 */
export function barToGrid(bar, pulses, sub = 1) {
  const size = pulses * sub;
  const cells = Array(size).fill(null);
  let at = 0;
  for (const { m, d } of bar) {
    if (!Number.isInteger(at * sub) || !Number.isInteger(d * sub) || at * sub >= size) return null;
    cells[at * sub] = m;
    at += d;
  }
  if (at * sub < size && at > 0) cells[at * sub] = 0; // the empty end of the bar is a rest
  return cells;
}

/** The notes of a bar from its cells: each note lasts until the next one starts (or the bar ends). Trailing rests are left out. */
export function gridToBar(cells, sub = 1) {
  const onsets = cells.map((value, i) => (value === null ? null : i)).filter(i => i !== null);
  if (!onsets.length) return [];
  const bar = [];
  if (onsets[0] > 0) bar.push({ m: 0, d: onsets[0] / sub });
  onsets.forEach((at, k) => bar.push({ m: cells[at], d: ((onsets[k + 1] ?? cells.length) - at) / sub }));
  while (bar.length && bar.at(-1).m === 0) bar.pop();
  return bar;
}

// ---------- does the tune line up with the chords? ----------

/**
 * How well a tune sits on a list of chords: the share of strong-beat notes (the first note of each main beat)
 * that belong to the bar's chord. `shift` places tune bar i on chord i + shift.
 * Returns { fit: 0–1, notes: how many notes were counted }.
 */
export function chordFit(melody, chords, shift = 0) {
  let hits = 0;
  let notes = 0;
  melody.bars.forEach((bar, i) => {
    const chord = chords[i + shift];
    if (!chord) return;
    let at = 0;
    for (const { m, d } of bar) {
      if (m && at % melody.group === 0) {
        notes++;
        if (chord.pcs.includes(m % 12)) hits++;
      }
      at += d;
    }
  });
  return { fit: notes ? hits / notes : 0, notes };
}

/** How well one bar fits its chord: { fit: 0–1, notes }. */
export function barFit(melody, chords, i) {
  return chordFit({ ...melody, bars: [melody.bars[i] ?? []] }, [chords[i]], 0);
}

/**
 * Where the tune and the chords drift apart. Tries every bar as the place where the tune slips by up to ±range bars
 * (bars before it stay as they are) and keeps the choice that makes the most main-beat notes land on their chord.
 * shift > 0: the tune should sit later from there (insert empty bars); shift < 0: earlier (remove bars there).
 * Returns { at (bar index), shift, fitNow, fitBest (0–1) }, or null when nothing clearly helps.
 */
export function bestBreak(melody, chords, { range = 6, minGain = 0.08 } = {}) {
  const count = melody.bars.length;
  const one = (i, shift) => chordFit({ ...melody, bars: [melody.bars[i]] }, [chords[i + shift]], 0); // tune bar i against chord i + shift
  const at0 = Array.from({ length: count }, (_, i) => one(i, 0));
  const fitNow = at0.reduce((a, f) => ({ hits: a.hits + f.fit * f.notes, notes: a.notes + f.notes }), { hits: 0, notes: 0 });
  if (fitNow.notes < 10) return null;
  const now = fitNow.hits / fitNow.notes;
  let best = null;
  for (let shift = -range; shift <= range; shift++) {
    if (shift === 0) continue;
    const moved = Array.from({ length: count }, (_, i) => one(i, shift));
    for (let b = 0; b < count; b++) {
      let hits = 0;
      let notes = 0;
      for (let i = 0; i < count; i++) {
        if (shift < 0 && i >= b && i < b - shift) {
          notes += at0[i].notes; // a removed bar loses its notes, which counts against the move
          continue;
        }
        const f = i < b ? at0[i] : moved[i];
        hits += f.fit * f.notes;
        notes += f.notes;
      }
      if (notes < 10) continue;
      const fit = hits / notes;
      const better = !best || fit > best.fitBest + 1e-9 || (Math.abs(fit - best.fitBest) < 1e-9 && Math.abs(shift) < Math.abs(best.shift));
      if (better) best = { at: b, shift, fitNow: now, fitBest: fit };
    }
  }
  return best && best.fitBest >= now + minGain ? best : null;
}

/** Move the tune from bar `from` on by `shift` bars: positive inserts empty bars there, negative removes bars there. */
export function moveFrom(melody, from, shift) {
  const move = lanes => {
    const bars = [...lanes];
    if (shift > 0) bars.splice(from, 0, ...Array.from({ length: shift }, () => []));
    else bars.splice(from, -shift);
    return bars;
  };
  return { ...melody, bars: move(melody.bars), ...(melody.bass ? { bass: move(melody.bass) } : {}) };
}
