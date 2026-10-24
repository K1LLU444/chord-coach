import test from 'node:test';
import assert from 'node:assert/strict';
import { quantizeRecording } from '../js/recorder.js';

const ev = (midi, start, end) => ({ midi, start, end });

test('played notes snap to the grid and become bars with rests between them', () => {
  const r = quantizeRecording([ev(60, 0.1, 0.9), ev(62, 1.05, 1.95), ev(64, 3.1, 3.9)], { pulses: 4, sub: 1 });
  assert.deepEqual(r.bars, [[{ m: 60, d: 1 }, { m: 62, d: 1 }, { m: 0, d: 1 }, { m: 64, d: 1 }]]);
  assert.equal(r.notes, 3);
});

test('a finer grid keeps eighth notes', () => {
  const r = quantizeRecording([ev(60, 0, 0.4), ev(62, 0.52, 1.0), ev(64, 1.0, 2.0)], { pulses: 4, sub: 2 });
  assert.deepEqual(r.bars[0], [{ m: 60, d: 0.5 }, { m: 62, d: 0.5 }, { m: 64, d: 1 }]);
});

test('notes go into the right bars, a long note is cut at the bar line, and empty bars in the middle stay empty', () => {
  const r = quantizeRecording([ev(60, 3, 6), ev(62, 9, 10)], { pulses: 4, sub: 1 });
  assert.equal(r.bars.length, 3);
  assert.deepEqual(r.bars[0], [{ m: 0, d: 3 }, { m: 60, d: 1 }]); // the note ran into bar 2, so it is cut at the bar line
  assert.deepEqual(r.bars[1], []);
  assert.deepEqual(r.bars[2], [{ m: 0, d: 1 }, { m: 62, d: 1 }]);
});

test('one note at a time: the top key of a chord is kept, and a note ends when the next one starts', () => {
  const r = quantizeRecording([ev(60, 0, 3), ev(64, 0, 3), ev(67, 0, 3), ev(72, 2, 4)], { pulses: 4, sub: 1 });
  assert.deepEqual(r.bars[0], [{ m: 67, d: 2 }, { m: 72, d: 2 }]);
  assert.equal(r.dropped, 2);
});

test('keys played during the count-in (before the start) and past the last wanted bar are left out', () => {
  const r = quantizeRecording([ev(48, -3, -2), ev(60, 0, 1), ev(62, 8, 9)], { pulses: 4, sub: 1, maxBars: 2 });
  assert.deepEqual(r.bars, [[{ m: 60, d: 1 }]]);
  assert.equal(r.dropped, 2);
  assert.deepEqual(quantizeRecording([], { pulses: 4 }).bars, []);
});

test('a very short note still takes one grid step', () => {
  const r = quantizeRecording([ev(60, 1.0, 1.05)], { pulses: 4, sub: 1 });
  assert.deepEqual(r.bars[0], [{ m: 0, d: 1 }, { m: 60, d: 1 }]);
});
