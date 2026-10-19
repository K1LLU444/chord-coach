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
 * Returns [{ pulse, hand: 'lh' | 'rh', notes, velocity }] in time order.
 */
export function barEvents(plan, feel = DEFAULT_FEEL) {
  const { pulses, group } = feel;
  const half = pulses % 2 === 0 ? pulses / 2 : Math.floor(pulses / 2);
  const events = [];
  const add = (pulse, hand, notes, velocity) => events.push({ pulse, hand, notes, velocity });

  if (plan.style === 'strum') {
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
  } else {
    // Bass + chord: the bass notes are spread over the bar, the chord is struck at the start and mid-bar.
    const count = plan.lh.notes.length;
    plan.lh.notes.forEach((midi, i) => add(Math.round((i * pulses) / count), 'lh', [midi], 0.8));
    add(0, 'rh', plan.rh.notes, 0.7);
    if (pulses >= 4) add(half, 'rh', plan.rh.notes, 0.55);
  }
  return events.sort((a, b) => a.pulse - b.pulse || (a.hand < b.hand ? -1 : 1));
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
