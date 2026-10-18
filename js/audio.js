// A small Web Audio piano-ish synth. No samples to download, so it works offline.

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

export function playNote(midi, delay = 0, dur = 1.8, velocity = 0.8) {
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
  env.connect(out);

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
