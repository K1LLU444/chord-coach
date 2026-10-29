// A piece made in the Maker tab: your own music, bar by bar, with no chord chart behind it.
// { id, title, key, bpm, pulses, group, sub, bars, rh: [[{ m, d }]], lh: [[{ m, d }]], chords: [text], updated }
// m = key number (0 = a rest), d = length in counts (pulses). The time signature is chosen once, then the bars are free.

import { cleanMelody } from './rhythm.js';
import { fingerBars } from './fingering.js';

/** The time signatures the Maker offers: how many counts in a bar and how they group (see js/rhythm.js). */
export const METERS = [
  { id: '4/4', label: '4/4 (four quarter-note counts)', pulses: 4, group: 1 },
  { id: '3/4', label: '3/4 (waltz: three counts)', pulses: 3, group: 1 },
  { id: '2/4', label: '2/4 (two counts)', pulses: 2, group: 1 },
  { id: '6/4', label: '6/4 (six counts, each with an “&”: 1 & 2 & 3 & 4 & 5 & 6 &)', pulses: 6, group: 1 },
  { id: '6/8', label: '6/8 (1-2-3 4-5-6)', pulses: 6, group: 3 },
  { id: '9/8', label: '9/8 (1-2-3 4-5-6 7-8-9)', pulses: 9, group: 3 },
  { id: '12/8', label: '12/8 (four groups of three)', pulses: 12, group: 3 },
  { id: '3/8', label: '3/8 (three eighth-note counts)', pulses: 3, group: 3 },
];

export const MAX_BARS = 200;
export const KEYS = ['', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Am', 'Em', 'Bm', 'Dm', 'Gm', 'Cm', 'Fm'];

const clampBpm = v => Math.min(200, Math.max(30, Math.round(Number(v)) || 80));
const blankBars = n => Array.from({ length: n }, () => []);

/** A new, empty piece. */
export function newPiece({ id, title = 'My piece', meter = '4/4', bpm = 80, key = '', bars = 8 }) {
  const m = METERS.find(x => x.id === meter) ?? METERS[0];
  const count = Math.min(MAX_BARS, Math.max(1, Math.round(Number(bars)) || 8));
  return {
    id, title: String(title).trim().slice(0, 80) || 'My piece', key: KEYS.includes(key) ? key : '', bpm: clampBpm(bpm),
    pulses: m.pulses, group: m.group, sub: m.group === 1 ? 2 : 1, // quarter-note counts get half-count columns, so eighth notes can be placed
    bars: count, rh: blankBars(count), lh: blankBars(count), chords: Array(count).fill(''), updated: Date.now(),
  };
}

/** Check a piece read from storage and return a safe copy (or null). */
export function cleanPiece(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  const pulses = Math.round(Number(raw.pulses));
  const group = Number(raw.group);
  if (!METERS.some(m => m.pulses === pulses && m.group === group)) return null;
  const bars = Math.min(MAX_BARS, Math.max(1, Math.round(Number(raw.bars)) || 1));
  const lane = lanes => {
    const cleaned = cleanMelody({ pulses, group, bars: Array.isArray(lanes) ? lanes : [], bass: null })?.bars ?? [];
    return Array.from({ length: bars }, (_, i) => cleaned[i] ?? []);
  };
  // cleanMelody refuses a lane with no sounding notes, so an empty lane is rebuilt from scratch
  const empty = Array.isArray(raw.rh) || Array.isArray(raw.lh) ? null : blankBars(bars);
  return {
    id: raw.id, title: String(raw.title ?? 'My piece').slice(0, 80) || 'My piece', key: KEYS.includes(raw.key) ? raw.key : '', bpm: clampBpm(raw.bpm),
    pulses, group, sub: raw.sub === 2 ? 2 : 1, bars,
    rh: empty ?? lane(raw.rh), lh: empty ?? lane(raw.lh),
    chords: Array.from({ length: bars }, (_, i) => String(raw.chords?.[i] ?? '').slice(0, 12)),
    updated: Number(raw.updated) || Date.now(),
  };
}

/** Add `n` empty bars at the end (up to the limit). */
export function addBars(piece, n) {
  const count = Math.min(MAX_BARS, piece.bars + n);
  for (const lane of [piece.rh, piece.lh]) while (lane.length < count) lane.push([]);
  while (piece.chords.length < count) piece.chords.push('');
  piece.bars = count;
}

/** Remove the last bar (never the only one). Returns false when it still holds notes, so the caller can ask first. */
export function removeLastBar(piece, force = false) {
  if (piece.bars <= 1) return false;
  const last = piece.bars - 1;
  if (!force && (piece.rh[last].length || piece.lh[last].length)) return false;
  piece.rh.pop();
  piece.lh.pop();
  piece.chords.pop();
  piece.bars -= 1;
  return true;
}

/** Copy one bar's notes (both hands and the chord name) onto another bar. */
export function copyBar(piece, from, to) {
  piece.rh[to] = piece.rh[from].map(n => ({ ...n }));
  piece.lh[to] = piece.lh[from].map(n => ({ ...n }));
  piece.chords[to] = piece.chords[from];
}

const sameKeys = (a, b) => Boolean(a.m) && a.m === b.m && (a.with ?? []).join() === (b.with ?? []).join();

/**
 * A hand's bars with its ties worked out. A note marked `tie` that ends exactly at the bar line, and is followed by the same
 * key(s) at the start of the next bar, is one held note: the first gets `hold` (the counts it goes on for) and the next gets
 * `tieIn` (it is not struck again). A tie that doesn't fit that is dropped. The bars given are not changed.
 */
export function markTies(lane, pulses) {
  const bars = lane.map(bar => bar.map(n => ({ ...n })));
  bars.forEach((bar, i) => {
    const last = bar.at(-1);
    if (!last?.tie) return;
    const next = bars[i + 1]?.[0];
    if (bar.reduce((sum, n) => sum + n.d, 0) !== pulses || !next || !sameKeys(last, next)) delete last.tie;
    else next.tieIn = true;
  });
  for (let i = bars.length - 2; i >= 0; i--) {
    const last = bars[i].at(-1);
    if (last?.tie) last.hold = bars[i + 1][0].d + (bars[i + 1][0].tie ? bars[i + 1][0].hold ?? 0 : 0);
  }
  return bars;
}

/** After a bar was rebuilt from the grid: keep the tie on its last note when that note is still the same key(s). */
export function carryTie(before, after) {
  const was = before.at(-1);
  const now = after.at(-1);
  if (was?.tie && now && sameKeys(was, now)) now.tie = true;
}

/** The tune and bass of a piece as bars for playing and for the falling notes. */
export function pieceBars(piece) {
  // suggested fingers for each hand's line, one for each sounding note of a bar
  const long = piece.group === 1 ? 2 : 3; // counts in a note long enough to move the hand during it (a half note in 4/4, a dotted quarter in 6/8)
  const right = fingerBars(piece.rh, 'rh', piece.pulses, long);
  const left = fingerBars(piece.lh, 'lh', piece.pulses, long);
  const rh = markTies(piece.rh, piece.pulses);
  const lh = markTies(piece.lh, piece.pulses);
  const sounding = (notes, fingers, tied = false) => fingers.filter((_, j) => notes[j].m && (tied || !notes[j].tieIn));
  return Array.from({ length: piece.bars }, (_, i) => ({
    plan: null,
    tune: rh[i].some(n => n.m) ? rh[i] : null,
    bass: lh[i].some(n => n.m) ? lh[i] : null,
    tuneFingers: sounding(rh[i], right[i]),
    bassFingers: sounding(lh[i], left[i]),
    tuneFingersAll: sounding(rh[i], right[i], true), // used when a slice starts on a tied note, which is then struck
    bassFingersAll: sounding(lh[i], left[i], true),
    label: piece.chords[i] || '',
  }));
}

/** Bars `from` to `to` (0-based, inclusive) to play on their own: a note tied in from before the slice is struck, a tie out of it ends. */
export function sliceBars(bars, from, to) {
  const out = bars.slice(from, to + 1).map(bar => ({ ...bar }));
  const strip = (notes, keys) => (notes ? notes.map(n => Object.fromEntries(Object.entries(n).filter(([k]) => !keys.includes(k)))) : notes);
  if (out.length) {
    const first = out[0];
    first.tune = strip(first.tune, ['tieIn']);
    first.bass = strip(first.bass, ['tieIn']);
    first.tuneFingers = first.tuneFingersAll ?? first.tuneFingers;
    first.bassFingers = first.bassFingersAll ?? first.bassFingers;
    const last = out.at(-1);
    last.tune = strip(last.tune, ['tie', 'hold']);
    last.bass = strip(last.bass, ['tie', 'hold']);
  }
  return out;
}

/** How the piece is counted, in the form the player and the falling notes use. */
export const pieceFeel = piece => ({
  bpm: piece.bpm, pulses: piece.pulses, group: piece.group,
  hits: Array.from({ length: piece.pulses }, () => ({ accent: false, soft: false, rest: false })),
});

/** True when no hand has a sounding note anywhere. */
export const pieceIsEmpty = piece => ![...piece.rh, ...piece.lh].some(bar => bar.some(n => n.m));

/**
 * Change the time signature of a piece. Only safe when the music means the same thing afterwards: an empty piece can change to
 * anything; one with notes can only change to a time signature counted the same way (4/4 ↔ 3/4 ↔ 2/4, or 6/8 ↔ 9/8 ↔ 12/8 ↔ 3/8)
 * that is still long enough for every bar. Returns { ok: true } or { ok: false, message }.
 */
export function changeMeter(piece, meterId) {
  const meter = METERS.find(m => m.id === meterId);
  if (!meter) return { ok: false, message: 'That time signature is not available.' };
  if (!pieceIsEmpty(piece)) {
    if (meter.group !== piece.group) {
      return { ok: false, message: 'A count is a quarter note in 4/4 and an eighth note in 6/8, so changing between them would change the rhythm of the notes already entered. Start a new piece instead.' };
    }
    const longest = Math.max(0, ...[...piece.rh, ...piece.lh].map(bar => bar.reduce((a, n) => a + n.d, 0)));
    if (longest > meter.pulses) return { ok: false, message: `One of the bars has ${longest} counts, which doesn’t fit in ${meter.id} (${meter.pulses} counts).` };
  }
  piece.pulses = meter.pulses;
  piece.group = meter.group;
  piece.sub = meter.group === 1 ? 2 : 1;
  piece.updated = Date.now();
  return { ok: true };
}
