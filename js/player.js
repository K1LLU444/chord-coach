// Practice playback: a metronome, and a sample of the song played in the chosen style.
// Sounds are scheduled on the audio clock a little ahead of time; the callbacks (for the screen) use ordinary timers.

import { click, createSession, playEvents } from './audio.js';
import { barEvents, clickLevel, pulseSeconds } from './rhythm.js';

const LEAD = 0.12; // seconds before the first sound, so nothing is scheduled in the past
const AHEAD = 2.5; // how far ahead (in seconds) bars are lined up; keeps long songs light for the phone
const clock = () => performance.now() / 1000;

/**
 * Play `bars` one after another, one bar each: [{ plan }] (plans come from handPlan).
 * Bars are lined up a couple of seconds at a time, so a whole song doesn't create thousands of sounds at once.
 * onBar(i) fires as bar i starts, onPulse(pulse, countIn) on every count, onEnd() when finished.
 * Returns { stop }.
 */
export function playSample({ bars, feel, bpm, metronome = true, everyPulse = true, countIn = true, onBar, onPulse, onEnd }) {
  const session = createSession();
  const step = pulseSeconds(feel, bpm);
  const barLength = feel.pulses * step;
  const lead = countIn ? 1 : 0;
  const total = lead + bars.length;
  const start = clock() + LEAD;
  const timers = new Set();
  const later = (seconds, fn) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, Math.max(0, seconds * 1000));
    timers.add(id);
  };

  const scheduleBar = k => {
    const isCount = k < lead;
    const delay = start + k * barLength - clock(); // seconds from now until this bar begins
    if (!isCount) {
      later(delay, () => onBar?.(k - lead));
      playEvents(barEvents(bars[k - lead].plan, feel), step, Math.max(0, delay), session.out);
    }
    for (let p = 0; p < feel.pulses; p++) {
      const level = clickLevel(feel, p, everyPulse);
      const at = delay + p * step;
      if (level != null && (metronome || isCount)) click(level, Math.max(0, at), session.out);
      later(at, () => onPulse?.(p, isCount));
    }
  };

  let next = 0;
  const pump = () => {
    while (next < total && start + next * barLength < clock() + AHEAD) scheduleBar(next++);
  };
  pump();
  const refill = setInterval(pump, 250);
  later(start + total * barLength + 0.4 - clock(), () => {
    clearInterval(refill);
    onEnd?.();
  });

  return {
    stop() {
      clearInterval(refill);
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
  let next = clock() + 0.08;
  const timers = new Set();

  const tick = setInterval(() => {
    const now = clock();
    while (next < now + 0.15) {
      const level = clickLevel(feel, pulse, everyPulse);
      const p = pulse;
      if (level != null) click(level, Math.max(0, next - now), session.out);
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
