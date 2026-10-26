// Rhythm: how a bar is split into pulses, and what each hand plays on each pulse.
// No sound or screen code lives here, so it can be tested on its own.

/**
 * A "feel" describes one bar:
 *   bpm    main beats per minute
 *   pulses strums (or clicks) in one bar
 *   group  pulses per main beat: 3 = triplet feel (like 6/8), 2 = eighth notes, 1 = quarter notes
 *   hits   one entry per pulse: { accent, soft, rest }
 */
export const DEFAULT_FEEL = Object.freeze({
  bpm: 80,
  pulses: 4,
  group: 1,
  hits: Object.freeze([{ accent: true }, {}, {}, {}]),
});

/**
 * Turn the strumming pattern of an Ultimate Guitar song into a feel (null when it has none).
 * Measure codes: 1 = down strum and 3 = accented down strum (both seen in the chart for "Until I Found You");
 * 2 = up strum, 4 = accented up strum and 0 = rest are assumed. Any other code is played as a plain hit.
 */
export function feelFromStrumming(strumming) {
  const codes = (strumming?.measures ?? []).map(m => Number(m?.measure));
  if (codes.length < 2 || codes.length > 16) return null;
  const hits = codes.map(code => ({ accent: code === 3 || code === 4, soft: code === 2, rest: code === 0 }));
  if (hits.every(hit => hit.rest)) return null;

  const denominator = Number(strumming.denuminator ?? strumming.denominator) || 8; // Ultimate Guitar misspells the key
  let group = strumming.is_triplet ? 3 : Math.max(1, Math.round(denominator / 4));
  if (hits.length % group !== 0) group = 1;
  const bpm = Math.min(200, Math.max(30, Math.round(Number(strumming.bpm)) || DEFAULT_FEEL.bpm));
  return { bpm, pulses: hits.length, group, hits };
}

/** Seconds from one pulse to the next at a given tempo (main beats per minute). */
export const pulseSeconds = (feel, bpm = feel.bpm) => 60 / bpm / feel.group;

/** Time signature as [top, bottom] for the music sheet. */
export function signatureOf(feel) {
  const { pulses, group } = feel;
  if (group === 3) return [pulses, 8];
  if (group === 2) return [pulses / 2, 4];
  if (group === 4) return [pulses / 4, 4];
  return [pulses, 4];
}

/** How to count a bar out loud: "1 2 3 4 5 6" with the main beats first in each group. */
export const countOf = feel => Array.from({ length: feel.pulses }, (_, i) => i + 1);

/**
 * What each hand plays during one bar. `plan` comes from handPlan (it names the playing style).
 * `tune` (optional) is the song's melody for this bar, [{ m, d }] (m = key number or 0 for a rest, d = length in pulses).
 * With a tune the right hand plays it instead of the chord and the left hand keeps the style's bass.
 * `bass` (optional) is the song's own bass line for this bar, in the same form: the left hand plays it instead of the style's bass.
 * Returns [{ pulse, hand: 'lh' | 'rh', notes, velocity, len? }] in time order (len = how long to hold, in pulses).
 */
export function barEvents(plan, feel = DEFAULT_FEEL, tune = null, bass = null) {
  const { pulses, group } = feel;
  const half = pulses % 2 === 0 ? pulses / 2 : Math.floor(pulses / 2);
  const events = [];
  const add = (pulse, hand, notes, velocity, len) => events.push(len == null ? { pulse, hand, notes, velocity } : { pulse, hand, notes, velocity, len });

  if (!plan) {
    // No playing style (a piece from the Maker): only the notes that were entered are played.
  } else if (plan.style === 'strum') {
    // Bass on the first count and its 5th at the middle of the bar; the chord is struck on every pulse.
    const [root, fifth] = plan.lh.notes;
    add(0, 'lh', [root], 0.85);
    if (fifth != null) add(half, 'lh', [fifth], 0.75);
    feel.hits.forEach((hit, i) => {
      if (!hit.rest) add(i, 'rh', plan.rh.notes, hit.accent ? 0.85 : hit.soft ? 0.45 : 0.6);
    });
  } else if (plan.style === 'broken') {
    // Left hand holds the chord (struck again mid-bar); right hand plays one chord note per pulse, round and round.
    add(0, 'lh', plan.lh.notes, 0.7);
    if (pulses >= 4) add(half, 'lh', plan.lh.notes, 0.55);
    for (let i = 0; i < pulses; i++) add(i, 'rh', [plan.rh.notes[i % plan.rh.notes.length]], i % group === 0 ? 0.75 : 0.55);
  } else if (plan.style === 'arpeggio') {
    // Arpeggio: one root held for the whole bar; the right hand rolls up the chord and back down, one note on every pulse.
    add(0, 'lh', [plan.lh.notes[0]], 0.8, pulses);
    const up = plan.rh.notes; // chord notes low to high, ending on the root an octave up
    const cycle = [...up, ...up.slice(1, -1).reverse()];
    for (let i = 0; i < pulses; i++) add(i, 'rh', [cycle[i % cycle.length]], i % group === 0 ? 0.75 : 0.55);
  } else if (plan.style === 'easy') {
    // Easy bass: one root held for the whole bar; the chord is struck at the start and mid-bar.
    add(0, 'lh', [plan.lh.notes[0]], 0.8, pulses);
    add(0, 'rh', plan.rh.notes, 0.7);
    if (pulses >= 4) add(half, 'rh', plan.rh.notes, 0.55);
  } else {
    // Bass + chord: the bass notes are spread over the bar, the chord is struck at the start and mid-bar.
    const count = plan.lh.notes.length;
    plan.lh.notes.forEach((midi, i) => add(Math.round((i * pulses) / count), 'lh', [midi], 0.8));
    add(0, 'rh', plan.rh.notes, 0.7);
    if (pulses >= 4) add(half, 'rh', plan.rh.notes, 0.55);
  }
  let all = events;
  if (bass) {
    all = all.filter(e => e.hand !== 'lh');
    let at = 0;
    for (const { m, d, with: extra } of bass) {
      if (m) all.push({ pulse: at, hand: 'lh', notes: [m, ...(extra ?? [])], velocity: 0.8, len: Math.max(0.25, d * 0.98), bass: true });
      at += d;
    }
  }
  if (tune) {
    all = all.filter(e => e.hand !== 'rh');
    let at = 0;
    for (const { m, d, with: extra } of tune) {
      if (m) all.push({ pulse: at, hand: 'rh', notes: [m, ...(extra ?? [])], velocity: 0.9, len: Math.max(0.25, d * 0.96), tune: true });
      at += d;
    }
  }
  return all.sort((a, b) => a.pulse - b.pulse || (a.hand < b.hand ? -1 : 1));
}

/** Volume of the metronome click for a pulse: bar start loudest, other main beats medium, the rest soft (or null). */
export function clickLevel(feel, pulse, everyPulse = true) {
  if (pulse === 0) return 1;
  if (pulse % feel.group === 0) return 0.7;
  return everyPulse ? 0.35 : null;
}

/** Check a feel that came from outside (a share link) and return a safe copy, or null. */
export function cleanFeel(feel) {
  if (!feel || !Array.isArray(feel.hits) || feel.hits.length < 2 || feel.hits.length > 16) return null;
  const pulses = feel.hits.length;
  const group = [1, 2, 3, 4].includes(feel.group) && pulses % feel.group === 0 ? feel.group : 1;
  const bpm = Math.min(200, Math.max(30, Math.round(Number(feel.bpm)) || DEFAULT_FEEL.bpm));
  const hits = feel.hits.map(h => ({ accent: Boolean(h?.accent), soft: Boolean(h?.soft), rest: Boolean(h?.rest) }));
  return hits.every(h => h.rest) ? null : { bpm, pulses, group, hits };
}

/**
 * Which bar of a sample is playing at timeline position k (0, 1, 2 …): `lead` count-in bars first, then the
 * `count` bars of the sample, and, when `loop` is on, the same bars again and again.
 * Returns { countIn: true } for a count-in bar, { countIn: false, index, pass } for a sample bar
 * (index within the sample, pass = 0 for the first time round), or null when a sample that isn't looping has finished.
 */
export function barAtPosition(k, { lead = 0, count, loop = false }) {
  if (k < lead) return { countIn: true };
  const n = k - lead;
  if (!loop && n >= count) return null;
  return { countIn: false, index: n % count, pass: Math.floor(n / count) };
}

/** How long a bar event sounds, in seconds (a tune note or a held bass note says its own length). */
export function eventSeconds(e, pulseSec) {
  if (e.len != null) return Math.max(0.12, e.len * pulseSec);
  const dur = e.hand === 'lh' ? Math.min(2.2, pulseSec * 4) : Math.min(1.6, pulseSec * 2.2);
  return Math.max(0.5, dur);
}

const NOTE_LENGTHS = [
  [1 / 16, 'sixteenth note'], [1 / 8, 'eighth note'], [3 / 16, 'dotted eighth'], [1 / 4, 'quarter note'],
  [3 / 8, 'dotted quarter'], [1 / 2, 'half note'], [3 / 4, 'dotted half'], [1, 'whole note'],
];

/** The note lengths that can be entered for a feel: [{ d (in pulses), name }], shortest first, none longer than a bar. */
export function lengthOptions(feel) {
  const whole = feel.group === 1 ? 1 / 4 : feel.group === 4 ? 1 / 16 : 1 / 8; // how much of a whole note one pulse is
  return NOTE_LENGTHS
    .map(([fraction, name]) => ({ d: fraction / whole, name, fraction }))
    .filter(({ d, fraction }) => (d >= 1 || fraction >= 1 / 8) && Number.isInteger(d * 2) && d <= feel.pulses) // no sixteenths unless a pulse is one
    .map(({ d, name }) => ({ d, name }));
}

/** Total length of a bar of the tune, in pulses. */
export const tuneLength = bar => bar.reduce((sum, n) => sum + n.d, 0);

/**
 * Check a melody that came from outside (a share link or storage): { pulses, group, bars: [[{ m, d }]] } or null.
 * Notes outside the piano, odd lengths and bars that run over are dropped.
 */
export function cleanMelody(melody) {
  if (!melody || !Array.isArray(melody.bars)) return null;
  const pulses = Math.round(Number(melody.pulses));
  const group = [1, 2, 3, 4].includes(melody.group) && pulses % melody.group === 0 ? melody.group : 1;
  if (!(pulses >= 2 && pulses <= 16)) return null;
  const cleanBars = lanes => lanes.slice(0, 400).map(bar => {
    const out = [];
    let used = 0;
    for (const n of Array.isArray(bar) ? bar : []) {
      const m = Math.round(Number(n?.m)) || 0;
      const d = Math.round(Number(n?.d) * 2) / 2;
      if (!(d >= 0.5) || used + d > pulses || (m !== 0 && (m < 21 || m > 108))) continue;
      // several keys on one count (a chord): m is the lowest key and `with` holds the others, low to high
      const keys = m && Array.isArray(n?.with) ? [...new Set([m, ...n.with.map(x => Math.round(Number(x))).filter(x => x >= 21 && x <= 108)])].sort((a, b) => a - b).slice(0, 6) : [m];
      out.push(keys.length > 1 ? { m: keys[0], d, with: keys.slice(1) } : { m, d });
      used += d;
    }
    return out;
  });
  const bars = cleanBars(melody.bars);
  const bass = Array.isArray(melody.bass) ? cleanBars(melody.bass) : null;
  const hasBass = bass?.some(bar => bar.some(n => n.m));
  if (!bars.some(bar => bar.some(n => n.m)) && !hasBass) return null;
  return { pulses, group, bars, ...(hasBass ? { bass } : {}) };
}
