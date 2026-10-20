// Helpers for practising: a range of bars, a speed in percent, one hand at a time.

/** Keep a 1-based "from bar" and "to bar" inside the piece and in order. */
export function clampRange(from, to, count) {
  const fix = (v, fallback) => Math.max(1, Math.min(count, Math.round(Number(v)) || fallback));
  let a = fix(from, 1);
  let b = fix(to, count);
  if (b < a) [a, b] = [b, a];
  return { from: a, to: b };
}

/** The tempo to play at: the piece's tempo at a percentage of its speed (never under 20). */
export const speedBpm = (bpm, percent) => Math.max(20, Math.round((bpm * percent) / 100));

export const SPEEDS = [50, 60, 70, 80, 90, 100];
export const HANDS = [['both', 'Both hands'], ['lh', 'Left hand only'], ['rh', 'Right hand only']];

/** A speed from storage or the screen, kept to something sensible (30–150%). */
export const cleanSpeed = v => Math.max(30, Math.min(150, Math.round(Number(v)) || 100));
export const cleanHands = v => (v === 'lh' || v === 'rh' ? v : 'both');
