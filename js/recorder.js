// Turning what was played on the real piano into bars of a tune: the logic (no screen, no sound), so it can be tested.

/**
 * events = [{ midi, start, end }] with start/end in pulses from the start of the first recorded bar (negative = played in the
 * count-in). pulses = pulses in a bar, sub = grid steps per pulse (2 allows half pulses).
 * One note at a time: where several keys start together the highest is kept (the tune), and a note ends when the next begins.
 * Notes are rounded to the grid; a note that runs past the end of its bar is cut at the bar line.
 * Returns { bars: [[{ m, d }]], notes, dropped } with one array per bar from the first recorded bar to the last one with a note.
 */
export function quantizeRecording(events, { pulses, sub = 1, maxBars = Infinity }) {
  const unit = 1 / sub;
  const round = x => Math.round(x / unit) * unit;
  const clean = events
    .filter(e => Number.isFinite(e.start) && Number.isFinite(e.end))
    .map(e => ({ midi: e.midi, start: round(e.start), end: Math.max(round(e.end), round(e.start) + unit) }))
    .filter(e => e.start >= 0)
    .sort((a, b) => a.start - b.start || b.midi - a.midi);
  let dropped = events.length - clean.length;

  // one note at a time: the highest of those that start together, and each note ends where the next begins
  const line = [];
  for (const e of clean) {
    const prev = line.at(-1);
    if (prev && prev.start === e.start) {
      dropped++;
      continue;
    }
    if (prev && prev.end > e.start) prev.end = e.start;
    line.push({ ...e });
  }

  const bars = [];
  for (const n of line) {
    const bar = Math.floor(n.start / pulses + 1e-9);
    if (bar >= maxBars) {
      dropped++;
      continue;
    }
    while (bars.length <= bar) bars.push([]);
    const offset = n.start - bar * pulses;
    const d = Math.min(n.end - n.start, pulses - offset); // cut at the bar line
    if (d <= 0) {
      dropped++;
      continue;
    }
    n.bar = bar;
    n.offset = offset;
    n.d = d;
  }
  const placed = line.filter(n => n.d != null && n.bar != null);
  const out = bars.map(() => []);
  const at = bars.map(() => 0);
  for (const n of placed) {
    if (n.offset > at[n.bar] + 1e-9) out[n.bar].push({ m: 0, d: n.offset - at[n.bar] });
    out[n.bar].push({ m: n.midi, d: n.d });
    at[n.bar] = n.offset + n.d;
  }
  return { bars: out, notes: placed.length, dropped };
}
