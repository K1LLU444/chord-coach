import test from 'node:test';
import assert from 'node:assert/strict';
import { clampRange, speedBpm, cleanSpeed, cleanHands } from '../js/practice.js';
import { buildTimeline } from '../js/falling.js';
import { barEvents } from '../js/rhythm.js';
import { newPiece, pieceBars, pieceFeel } from '../js/piece.js';

test('a bar range stays inside the piece and in order', () => {
  assert.deepEqual(clampRange(3, 6, 10), { from: 3, to: 6 });
  assert.deepEqual(clampRange(6, 3, 10), { from: 3, to: 6 });
  assert.deepEqual(clampRange(0, 99, 10), { from: 1, to: 10 });
  assert.deepEqual(clampRange('', '', 8), { from: 1, to: 8 });
  assert.deepEqual(clampRange(4.4, 4.6, 8), { from: 4, to: 5 });
});

test('speed: a percentage of the tempo, never silly', () => {
  assert.equal(speedBpm(69, 100), 69);
  assert.equal(speedBpm(69, 50), 35);
  assert.equal(speedBpm(40, 30), 20); // never under 20
  assert.equal(cleanSpeed('abc'), 100);
  assert.equal(cleanSpeed(5), 30);
  assert.equal(cleanSpeed(400), 150);
  assert.equal(cleanHands('lh'), 'lh');
  assert.equal(cleanHands('x'), 'both');
});

test('one hand at a time: the other hand is left out of the falling notes and the sound', () => {
  const p = newPiece({ id: 'a', meter: '4/4', bars: 1 });
  p.rh[0] = [{ m: 72, d: 4 }];
  p.lh[0] = [{ m: 48, d: 4 }];
  const bars = pieceBars(p);
  const feel = pieceFeel(p);
  assert.equal(buildTimeline(bars, feel, 80).notes.length, 2);
  assert.deepEqual(buildTimeline(bars, feel, 80, 1, 'lh').notes.map(n => n.midi), [48]);
  assert.deepEqual(buildTimeline(bars, feel, 80, 1, 'rh').notes.map(n => n.midi), [72]);
  const events = barEvents(bars[0].plan, feel, bars[0].tune, bars[0].bass);
  assert.deepEqual(events.filter(e => e.hand === 'lh').map(e => e.notes[0]), [48]);
});
