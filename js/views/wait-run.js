// Glue for "wait for me": runs the falling notes on the real piano's time, not the clock's.

import { createWait } from '../wait-mode.js';
import { piano } from '../midi.js';
import { pulseSeconds } from '../rhythm.js';

/**
 * Start a wait-for-the-keys run. fall = the falling view, timeline = from buildTimeline (already limited to the hands
 * being practised), feel/bpm give the pace. onBar(i) says which bar of the run is current, onStatus(text) says what
 * it is waiting for, onDone(stats) runs at the end (never when looping). Returns { stop, pulse }.
 */
export function startWaitRun({ fall, timeline, feel, bpm, countIn = true, loop = false, onBar, onStatus, onDone, label = m => String(m) }) {
  const secondsPerPulse = pulseSeconds(feel, bpm);
  const make = () => createWait({ notes: timeline.notes, pulses: timeline.pulses, total: timeline.total, countIn: countIn ? 1 : 0 });
  let wait = make();
  let round = 0;
  let last = performance.now();
  let raf = 0;
  let lastBar = -1;
  let stopped = false;
  const totals = { clean: 0, steps: 0, wrong: 0 };

  fall.load(timeline);
  fall.setLive({ pressed: new Set(piano.pressed.keys()), required: new Set() });

  const text = () => {
    if (wait.pulse < 0) return 'Count-in… the notes will wait for you at the first note';
    if (wait.waiting) return `Waiting for: ${[...wait.required].filter(m => !wait.got.has(m)).sort((a, b) => a - b).map(label).join(' + ')}`;
    return `Playing… ${wait.stats.clean} of ${wait.stats.steps} first try so far`;
  };

  const frame = now => {
    if (stopped) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    wait.advance(dt / secondsPerPulse);
    const bar = Math.max(0, Math.floor(wait.pulse / timeline.pulses + 1e-9));
    if (bar !== lastBar && wait.pulse >= 0) { lastBar = bar; onBar?.(Math.min(bar, timeline.labels.length - 1), round); }
    fall.setLive({ required: wait.waiting ? wait.required : new Set(), pressed: new Set(piano.pressed.keys()) });
    onStatus?.(text());
    if (wait.done) {
      totals.clean += wait.stats.clean;
      totals.steps += wait.stats.steps;
      totals.wrong += wait.stats.wrong;
      if (loop) {
        wait = make();
        round++;
        lastBar = -1;
      } else {
        onDone?.(totals);
        return;
      }
    }
    raf = requestAnimationFrame(frame);
  };

  const off = piano.on(e => {
    if (e.type !== 'on' || stopped) return;
    wait.press(e.midi);
    fall.setLive({ required: wait.waiting ? wait.required : new Set(), pressed: new Set(piano.pressed.keys()) });
  });

  fall.run(() => wait.pulse);
  raf = requestAnimationFrame(frame);

  return {
    pulse: () => wait.pulse,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      off();
      fall.setLive({ required: new Set(), pressed: new Set() });
    },
  };
}
