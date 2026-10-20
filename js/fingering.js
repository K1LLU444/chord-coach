// Suggested fingers for a line of single notes (a tune or a bass line): 1 = thumb … 5 = little finger.
// A simple search for the finger choices that keep the hand comfortable: the fingers move the same way the notes do,
// the thumb and little finger avoid black keys, a repeated note keeps its finger, and after a rest or a big leap the hand
// can move to a new position. These are suggestions, not a teacher's markings: change them if your hand prefers another.

const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = m => BLACK.has(((m % 12) + 12) % 12);
const MAX_SPAN = [0, 4, 6, 8, 10]; // semitones that 1, 2, 3 or 4 finger-steps can comfortably cover

/** Cost of one finger choice for one note. */
function noteCost(finger, midi, hand) {
  let c = finger === 5 ? 0.3 : 0;
  // the little finger is the natural one for a left-hand bass note, the thumb for a right-hand note
  if (hand === 'lh') c += finger === 5 ? -0.5 : finger === 1 ? 0.2 : 0;
  if (isBlack(midi)) c += finger === 1 ? 2.5 : finger === 5 ? 1.2 : finger === 3 ? 0 : 0.2; // the long middle finger suits a black key best
  return c;
}

/** Cost of moving from finger f1 on note p1 to finger f2 on note p2 (`broken`: there was a rest in between). */
function moveCost(hand, f1, p1, f2, p2, broken) {
  const along = f => (hand === 'rh' ? f : 6 - f); // 1…5 from left to right along the keyboard
  const d = p2 - p1;
  const a = Math.abs(d);
  if (d === 0) return f1 === f2 ? 0 : 1.2;
  if (broken) return 0.4; // a new hand position after a rest
  if (a > 8) return 0.6; // a leap: the hand moves, any finger can land
  const dpos = along(f2) - along(f1);
  const steps = Math.max(1, Math.round(a / 2)); // about how many scale steps the move is
  if (Math.sign(d) === Math.sign(dpos)) {
    let c = 0.7 * Math.abs(Math.abs(dpos) - steps);
    if (a > MAX_SPAN[Math.abs(dpos)]) c += 2 + (a - MAX_SPAN[Math.abs(dpos)]);
    return c;
  }
  if (dpos === 0) return a <= 2 ? 2.5 : 2.2; // the same finger on a new note: awkward for a step, a hop for a leap
  const involvesThumb = along(f1) === 1 || along(f2) === 1;
  if (a <= 4 && involvesThumb) return 1.8; // the thumb tucks under, or a finger crosses over it
  return 5 + a * 0.3;
}

/**
 * Fingers for a line of notes. notes = [{ m, d }] in playing order (m = 0 is a rest, which only breaks the line);
 * hand = 'rh' or 'lh'; a note of `longNote` counts or more (or a rest) gives the hand time to move to a new position. Returns an array with one finger (1–5) for each note and 0 for each rest.
 */
export function fingerLine(notes, hand, longNote = 3) {
  const idx = [];
  notes.forEach((n, i) => { if (n.m) idx.push(i); });
  const out = notes.map(() => 0);
  if (!idx.length) return out;
  const pitch = idx.map(i => notes[i].m);
  // a "break" before note k when a rest of a full count or more lies between it and the previous note
  const broken = idx.map((i, k) => {
    if (k === 0) return false;
    let gap = 0;
    for (let j = idx[k - 1] + 1; j < i; j++) gap += notes[j].d;
    return gap >= 1 || notes[idx[k - 1]].d >= longNote; // a rest, or a long note, leaves time to move the hand
  });
  const fingers = [1, 2, 3, 4, 5];
  const best = [];
  const from = [];
  best[0] = fingers.map(f => noteCost(f, pitch[0], hand));
  for (let k = 1; k < idx.length; k++) {
    best[k] = [];
    from[k] = [];
    for (const f of fingers) {
      let min = Infinity;
      let arg = 1;
      for (const g of fingers) {
        const c = best[k - 1][g - 1] + moveCost(hand, g, pitch[k - 1], f, pitch[k], broken[k]);
        if (c < min - 1e-9) { min = c; arg = g; }
      }
      best[k][f - 1] = min + noteCost(f, pitch[k], hand);
      from[k][f - 1] = arg;
    }
  }
  let f = fingers.reduce((a, b) => (best.at(-1)[b - 1] < best.at(-1)[a - 1] - 1e-9 ? b : a), 1);
  for (let k = idx.length - 1; k >= 0; k--) {
    out[idx[k]] = f;
    if (k > 0) f = from[k][f - 1];
  }
  return out;
}

/**
 * Fingers for a whole hand of a piece: bars = [[{ m, d }]], `pulses` = counts in a bar. The line runs on from bar to bar,
 * so the fingering carries across bar lines. Returns the same shape: one finger (or 0 for a rest) per note, bar by bar.
 */
export function fingerBars(bars, hand, pulses = 0, longNote = 3) {
  // silence at the end of a bar (or a whole empty bar) is a rest in the line, so the hand may move to a new position
  const flat = [];
  bars.forEach(bar => {
    flat.push(...bar);
    const used = bar.reduce((a, n) => a + n.d, 0);
    if (pulses > used) flat.push({ m: 0, d: pulses - used, filler: true });
  });
  const fingers = fingerLine(flat, hand, longNote);
  let at = 0;
  return bars.map(bar => {
    const out = bar.map(() => fingers[at++]);
    if (flat[at]?.filler) at++;
    return out;
  });
}
