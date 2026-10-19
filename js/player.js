// Practice playback: a metronome, and a sample of the song played in the chosen style.
// Sounds are scheduled on the audio clock; the callbacks (for the screen) use ordinary timers.

import { audioNow, click, createSession, playEvents } from './audio.js';
import { barEvents, clickLevel, pulseSeconds } from './rhythm.js';

const LEAD = 0.12; // seconds before the first sound, so nothing is scheduled in the past

/**
 * Play `bars` one after another, one bar each: [{ plan }] (plans come from handPlan).
 * onBar(i) fires as bar i starts, onPulse(pulse, countIn) on every count, onEnd() when finished.
 * Returns { stop }.
 */
export function playSample({ bars, feel, bpm, metronome = true, everyPulse = true, countIn = true, onBar, onPulse, onEnd }) {
  const session = createSession();
  const step = pulseSeconds(feel, bpm);
  const barLength = feel.pulses * step;
  const timers = [];
  const later = (seconds, fn) => timers.push(setTimeout(fn, Math.max(0, seconds * 1000)));
  const lead = countIn ? 1 : 0;

  for (let k = 0; k < lead + bars.length; k++) {
    const isCount = k < lead;
    const barStart = LEAD + k * barLength;
    if (!isCount) {
      later(barStart, () => onBar?.(k - lead));
      playEvents(barEvents(bars[k - lead].plan, feel), step, barStart, session.out);
    }
    for (let p = 0; p < feel.pulses; p++) {
      const level = clickLevel(feel, p, everyPulse);
      const at = barStart + p * step;
      if (level != null && (metronome || isCount)) click(level, at, session.out);
      later(at, () => onPulse?.(p, isCount));
    }
  }
  later(LEAD + (lead + bars.length) * barLength + 0.4, () => onEnd?.());

  return {
    stop() {
      timers.forEach(clearTimeout);
      session.stop();
    },
  };
}

/**
 * A steady click, counting `feel.pulses` to a bar. Change the tempo any time with setBpm.
 * Returns { stop, setBpm }.
 */
export function startMetronome({ feel, bpm, everyPulse = true, onPulse }) {
  const session = createSession();
  let tempo = bpm;
  let pulse = 0;
  let next = audioNow() + 0.08;
  const timers = new Set();

  const tick = setInterval(() => {
    const now = audioNow();
    while (next < now + 0.15) {
      const level = clickLevel(feel, pulse, everyPulse);
      const p = pulse;
      if (level != null) click(level, next - now, session.out);
      const id = setTimeout(() => { timers.delete(id); onPulse?.(p); }, Math.max(0, (next - now) * 1000));
      timers.add(id);
      next += pulseSeconds(feel, tempo);
      pulse = (pulse + 1) % feel.pulses;
    }
  }, 25);

  return {
    setBpm(value) { tempo = value; },
    stop() {
      clearInterval(tick);
      timers.forEach(clearTimeout);
      session.stop();
    },
  };
}
