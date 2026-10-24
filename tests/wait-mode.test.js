import test from 'node:test';
import assert from 'node:assert/strict';
import { createWait } from '../js/wait-mode.js';

const notes = [{ midi: 60, start: 0 }, { midi: 64, start: 2 }, { midi: 67, start: 2 }, { midi: 72, start: 4 }];

test('time stops at a note until the right key is pressed, then moves on', () => {
  const w = createWait({ notes, pulses: 4, total: 6, countIn: 0 });
  w.advance(1);
  assert.equal(w.pulse, 0); // the first note is due now, so time stops at once
  assert.equal(w.waiting, true);
  assert.deepEqual([...w.required], [60]);
  assert.equal(w.press(60), 'right');
  assert.equal(w.waiting, false);
  w.advance(1);
  assert.equal(w.pulse, 1);
  w.advance(5);
  assert.equal(w.pulse, 2); // stops again at the chord
  assert.equal(w.waiting, true);
});

test('a chord needs every one of its keys, in any order; wrong keys are counted', () => {
  const w = createWait({ notes, pulses: 4, total: 6, countIn: 0 });
  w.advance(1);
  w.press(60);
  w.advance(3);
  assert.deepEqual([...w.required].sort(), [64, 67]);
  assert.equal(w.press(65), 'wrong');
  assert.equal(w.press(67), 'right');
  assert.equal(w.waiting, true); // 64 is still missing
  assert.equal(w.press(64), 'right');
  assert.equal(w.waiting, false);
  assert.equal(w.stats.wrong, 1);
  w.advance(5);
  w.press(72);
  w.advance(10);
  assert.equal(w.done, true);
  assert.deepEqual(w.stats, { steps: 3, clean: 2, wrong: 1 }); // the chord had a wrong key, so only two steps were clean
});

test('a key pressed a little early counts (within one pulse), one pressed long before the note does not', () => {
  const w = createWait({ notes, pulses: 4, total: 6, countIn: 0 });
  w.advance(1);
  w.press(60);
  w.advance(0.5); // pulse 0.5: the chord is 1.5 away
  assert.equal(w.press(64), 'ignored');
  w.advance(0.6); // pulse 1.1: 0.9 away
  assert.equal(w.press(64), 'right');
  assert.equal(w.press(67), 'right'); // the chord is complete before its time, so time keeps moving
  assert.equal(w.waiting, false);
  w.advance(0.5);
  assert.equal(w.pulse, 1.6);
});

test('the count-in is not waited for, and a run with no notes just ends', () => {
  const w = createWait({ notes, pulses: 4, total: 6, countIn: 1 });
  assert.equal(w.pulse, -4);
  w.advance(4);
  assert.equal(w.pulse, 0);
  assert.equal(w.waiting, true); // the count-in ends exactly when the first note is due, so it waits for the key
  const empty = createWait({ notes: [], pulses: 4, total: 4, countIn: 0 });
  empty.advance(5);
  assert.equal(empty.done, true);
});
