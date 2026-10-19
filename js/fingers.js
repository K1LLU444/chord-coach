// Finger numbers for the keys each hand presses: 1 = thumb, 2 = index, 3 = middle, 4 = ring, 5 = little finger.
// These are the common beginner fingerings (the same ones printed on the cheat sheets). Pure logic, easy to test.

/** Which chord note is the lowest one: 0 = the root, 1 = the next chord note up (the 3rd of a triad), 2 = the 5th … */
const lowestRole = (chord, notes) => chord.pcs.indexOf(notes[0] % 12);

/** Right hand, notes listed low to high. Held or played one at a time, the fingers are the same. */
export function rightFingers(chord, notes) {
  const n = notes.length;
  if (n <= 1) return [1];
  if (n === 2) return [1, 5];
  if (n === 3) return lowestRole(chord, notes) === 1 ? [1, 2, 5] : [1, 3, 5]; // 1st inversion: 1-2-5
  if (n === 4) return [1, 2, 3, 5];
  return [1, 2, 3, 4, 5];
}

/** Left hand pressing n notes together, low to high (the little finger is on the lowest note). */
export function leftChordFingers(n) {
  if (n <= 1) return [5];
  if (n === 2) return [5, 1];
  if (n === 3) return [5, 3, 1];
  if (n === 4) return [5, 3, 2, 1];
  return [5, 4, 3, 2, 1];
}

/**
 * Fingers for a hand plan (from handPlan).
 * Returns { lh: [...], rh: [...], map } where lh/rh follow the order of plan.lh.notes / plan.rh.notes
 * and map is Map(midi → finger) for drawing on a keyboard.
 */
export function fingerPlan(chord, plan) {
  const rh = rightFingers(chord, plan.rh.notes);
  let lh;
  if (plan.lh.together) lh = leftChordFingers(plan.lh.notes.length); // the chord held in the left hand
  else if (plan.lh.notes.length === 3) lh = [5, 2, 1]; // bass pattern: root, 5th, octave
  else lh = leftChordFingers(plan.lh.notes.length); // root and 5th: 5, 1
  const map = new Map();
  plan.lh.notes.forEach((m, i) => map.set(m, lh[i]));
  plan.rh.notes.forEach((m, i) => map.set(m, rh[i]));
  return { lh, rh, map };
}

/** "5 · 2 · 1" for showing next to a hand's notes. */
export const fingerText = fingers => fingers.join(' · ');

/** The small line under a hand: its own note (like "on every count") plus its fingers, when finger numbers are on. */
export const withFingers = (note, fingers, on) => [note, on && `fingers ${fingerText(fingers)}`].filter(Boolean).join(' · ');
