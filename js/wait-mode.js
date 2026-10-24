// "Wait for me": the falling notes move on only when the right keys are pressed on the real piano.
// This is the logic only (no screen, no sound), so it can be tested. The caller moves time forward with advance()
// and tells it about key presses with press().

/**
 * notes = [{ midi, start, len }] with start in pulses from the beginning (only the hands being practised).
 * pulses = pulses in one bar, total = pulses in the whole run, countIn = bars of lead-in before the first note,
 * early = how many pulses before a note's time a key press already counts for it.
 */
export function createWait({ notes, pulses, total, countIn = 1, early = 1 }) {
  const byStart = new Map();
  for (const n of notes) {
    const key = Math.round(n.start * 1e6) / 1e6;
    if (!byStart.has(key)) byStart.set(key, new Set());
    byStart.get(key).add(n.midi);
  }
  const steps = [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([start, midis]) => ({ start, midis }));
  const stats = { steps: steps.length, clean: 0, wrong: 0 };
  let pulse = -countIn * pulses;
  let idx = 0;
  let waiting = false;
  let stepWrong = false;
  let got = new Set();
  let done = steps.length === 0 && total <= 0;

  const finishStep = () => {
    if (!stepWrong) stats.clean++;
    idx++;
    got = new Set();
    stepWrong = false;
    waiting = false;
  };

  return {
    get pulse() { return pulse; },
    get waiting() { return waiting; },
    get done() { return done; },
    get required() { return idx < steps.length ? steps[idx].midis : new Set(); },
    get got() { return got; },
    get stats() { return stats; },
    /** Move time forward by `dt` pulses. Time stops at a note that has not been played yet. */
    advance(dt) {
      if (done || waiting) return;
      pulse += dt;
      if (idx < steps.length && pulse >= steps[idx].start) {
        pulse = steps[idx].start;
        waiting = true; // the notes have reached the keyboard: wait for the keys
      } else if (idx >= steps.length && pulse >= total) {
        pulse = total;
        done = true;
      }
    },
    /** A key was pressed. Returns 'right', 'wrong' or 'ignored' (a press long before the next note is not counted). */
    press(midi) {
      if (done || idx >= steps.length) return 'ignored';
      const step = steps[idx];
      const inWindow = waiting || step.start - pulse <= early;
      if (!inWindow) return 'ignored';
      if (step.midis.has(midi)) {
        got.add(midi);
        if (got.size === step.midis.size) finishStep();
        return 'right';
      }
      stats.wrong++;
      stepWrong = true;
      return 'wrong';
    },
  };
}
