// A small Web Audio piano-ish synth. No samples to download, so it works offline.

import { barEvents, pulseSeconds } from './rhythm.js';

let ctx = null;
let out = null;

function ensure() {
  if (!ctx) {
    // Lets iPhone play sound even when the ring/silent switch is on silent (Safari 17+).
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    out = ctx.createGain();
    out.gain.value = 0.8;
    out.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state !== 'running') ctx.resume();
  return ctx;
}

/** iOS only allows audio after a tap, so call this from the first pointer event. */
export const unlock = () => ensure();

const PARTIALS = [
  [1, 1, 'triangle', 0],
  [2, 0.3, 'sine', 3],
  [3, 0.1, 'sine', -4],
  [1, 0.12, 'sawtooth', 5],
];

export function playNote(midi, delay = 0, dur = 1.8, velocity = 0.8, dest = null) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + 0.01 + delay;
  const f = 440 * 2 ** ((midi - 69) / 12);

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.28 * velocity, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.09 * velocity, t + 0.35);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(f * 9, 14000), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(f * 2.5, 500), t + dur * 0.6);
  lp.connect(env);
  env.connect(dest || out);

  for (const [mult, gain, type, detune] of PARTIALS) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f * mult;
    o.detune.value = detune;
    const g = c.createGain();
    g.gain.value = gain;
    o.connect(g);
    g.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** All notes together, with a tiny strum so it sounds less robotic. */
export function playChord(midis, delay = 0) {
  midis.forEach((m, i) => playNote(m, delay + i * 0.012, 2.2, 0.65));
}

/** Notes one after another (the left-hand pattern). */
export function playSequence(midis, delay = 0, gap = 0.34) {
  midis.forEach((m, i) => playNote(m, delay + i * gap, 1.5, 0.75));
}

/** Left-hand pattern with the right-hand chord on top. */
export function playBoth(lh, rh) {
  playSequence(lh);
  playChord(rh);
}

/** One hand: its notes together as a chord, or one after another. */
export function playHand(hand) {
  if (hand.together) playChord(hand.notes);
  else playSequence(hand.notes);
}

/** Both hands starting together, as described by `handPlan`. */
export function playPlan(plan) {
  if (plan.style === 'strum') {
    playEvents(barEvents(plan, plan.feel), pulseSeconds(plan.feel));
    return;
  }
  playHand(plan.lh);
  playHand(plan.rh);
}

/** Seconds on the audio clock (what sounds are scheduled against). */
export const audioNow = () => ensure()?.currentTime ?? 0;

/**
 * A volume knob for one stretch of playing (a sample or the metronome) that can be stopped at once,
 * even though its notes were scheduled ahead of time.
 */
export function createSession() {
  const c = ensure();
  if (!c) return { out: null, stop() {} };
  const gain = c.createGain();
  gain.connect(out);
  return {
    out: gain,
    stop() {
      gain.gain.cancelScheduledValues(c.currentTime);
      gain.gain.setTargetAtTime(0, c.currentTime, 0.03);
      setTimeout(() => gain.disconnect(), 500);
    },
  };
}

/** A short wood-block style tick. level 1 = first count (high and loud), lower = softer and lower. */
export function click(level = 1, delay = 0, dest = null) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + 0.01 + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.value = level >= 1 ? 1900 : level >= 0.7 ? 1400 : 1000;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32 * level + 0.05, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g);
  g.connect(dest || out);
  o.start(t);
  o.stop(t + 0.08);
}

/** Play bar events (see rhythm.js) starting `delay` seconds from now, one pulse every `pulseSec`. */
export function playEvents(events, pulseSec, delay = 0, dest = null) {
  for (const e of events) {
    const at = delay + e.pulse * pulseSec;
    const dur = e.hand === 'lh' ? Math.min(2.2, pulseSec * 4) : Math.min(1.6, pulseSec * 2.2);
    e.notes.forEach((midi, i) => playNote(midi, at + i * 0.012, Math.max(0.5, dur), e.velocity, dest));
  }
}
