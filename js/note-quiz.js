// "Read the note": one note on a staff, and you find it on the keyboard. The logic of choosing notes and answers.

import { noteName } from './theory.js';

/** The notes each clef asks about (MIDI): treble C4–A5, bass C2–B3. */
export const CLEF_RANGE = { treble: [60, 81], bass: [36, 59] };
const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlackKey = m => BLACK.has(m % 12);

/** "B♭3", "F♯3", "C4": the name with its octave (middle C is C4). */
export const spell = (midi, flats = false) => noteName(midi, flats).replace('#', '♯').replace('b', '♭') + (Math.floor(midi / 12) - 1);

/** The notes that can be asked for a clef choice ('treble', 'bass' or 'both'), with or without sharps and flats. */
export function notePool(clef, accidentals) {
  const clefs = clef === 'both' ? ['treble', 'bass'] : [clef === 'bass' ? 'bass' : 'treble'];
  const pool = [];
  for (const c of clefs) {
    const [low, high] = CLEF_RANGE[c];
    for (let m = low; m <= high; m++) if (accidentals || !isBlackKey(m)) pool.push({ midi: m, clef: c });
  }
  return pool;
}

/**
 * Choose the next note. Notes you miss come back more often (like the chord quiz): progress[midi] = { box 0–5 }.
 * `rng` is any function returning 0 ≤ x < 1 (Math.random, or a fixed one in tests).
 * Returns { midi, clef, flats } — flats says whether a black key is written as a flat (B♭) or a sharp (A♯).
 */
export function pickNote({ clef = 'treble', accidentals = false, progress = {}, lastMidi = null, rng = Math.random }) {
  const pool = notePool(clef, accidentals);
  const weights = pool.map(n => (n.midi === lastMidi ? 0 : 2 ** (5 - Math.max(1, progress[n.midi]?.box || 0))));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  let i = 0;
  for (; i < pool.length - 1; i++) if ((r -= weights[i]) <= 0) break;
  return { ...pool[i], flats: isBlackKey(pool[i].midi) && rng() < 0.5 };
}

/** Four different answers for "name it": the right one and three near misses (a step away, or the same letter in another octave). */
export function nameChoices(midi, flats, clef, accidentals, rng = Math.random) {
  const [low, high] = CLEF_RANGE[clef === 'bass' ? 'bass' : 'treble'];
  const allowed = m => m >= low && m <= high && (accidentals || !isBlackKey(m));
  const near = [midi - 1, midi + 1, midi - 2, midi + 2, midi - 12, midi + 12, midi - 3, midi + 3, midi - 5, midi + 5].filter(m => m !== midi && allowed(m));
  const picks = new Set();
  const sorted = [...near].sort(() => rng() - 0.5);
  for (const m of sorted) if (picks.size < 3) picks.add(m);
  const all = [midi, ...picks].sort(() => rng() - 0.5);
  return all.map(m => ({ midi: m, label: spell(m, flats) }));
}

/** Update the progress of one note after an answer (box 1 = keeps coming back, 5 = mastered). */
export function gradeNote(progress, midi, ok) {
  const p = progress[midi] || { box: 0, seen: 0, right: 0 };
  p.seen++;
  if (ok) {
    p.right++;
    p.box = Math.min(5, Math.max(1, p.box) + 1);
  } else p.box = 1;
  progress[midi] = p;
  return progress;
}

// ---------- the 3 lives game ----------

export const MAX_LIVES = 3;

/** A new round: 3 lives, nothing scored yet. `best` is the best round so far. */
export const newGame = (best = 0) => ({ lives: MAX_LIVES, score: 0, best, over: false });

/** What happens after an answer: a right one scores, a wrong one costs a life, and with no lives left the round is over. */
export function answerGame(game, ok) {
  if (game.over) return game;
  const next = { ...game };
  if (ok) next.score++;
  else next.lives--;
  if (next.lives <= 0) {
    next.over = true;
    next.best = Math.max(next.best, next.score);
  }
  return next;
}
