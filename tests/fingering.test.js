import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerLine, fingerBars } from '../js/fingering.js';

const line = (...ms) => ms.map(m => ({ m, d: 1 }));

test('a five-note scale: the fingers follow the notes, 1 to 5 going up for the right hand', () => {
  assert.deepEqual(fingerLine(line(60, 62, 64, 65, 67), 'rh'), [1, 2, 3, 4, 5]);
  assert.deepEqual(fingerLine(line(67, 65, 64, 62, 60), 'rh'), [5, 4, 3, 2, 1]);
});

test('the left hand is the mirror: the little finger is the lowest note', () => {
  assert.deepEqual(fingerLine(line(48, 50, 52, 53, 55), 'lh'), [5, 4, 3, 2, 1]);
  assert.deepEqual(fingerLine(line(55, 53, 52, 50, 48), 'lh'), [1, 2, 3, 4, 5]);
});

test('a scale that runs past five notes re-positions the hand with the thumb', () => {
  const f = fingerLine(line(60, 62, 64, 65, 67, 69, 71, 72), 'rh');
  assert.equal(f.length, 8);
  assert.ok(f.every(x => x >= 1 && x <= 5));
  assert.ok(f.slice(1).some((x, i) => x < f[i]), `expected a thumb tuck: ${f}`); // the fingers must come down somewhere
});

test('a repeated note keeps its finger; neighbouring different notes use different fingers', () => {
  const f = fingerLine(line(64, 64, 64, 65, 65, 67), 'rh');
  assert.equal(f[0], f[1]);
  assert.equal(f[1], f[2]);
  assert.equal(f[3], f[4]);
  assert.notEqual(f[2], f[3]);
});

test('the thumb and the little finger stay off black keys when there is a choice', () => {
  // E♭ major run up: E♭4 F4 G4 A♭4 B♭4
  const f = fingerLine(line(63, 65, 67, 68, 70), 'rh');
  const black = [63, 68, 70];
  line(63, 65, 67, 68, 70).forEach((n, i) => { if (black.includes(n.m)) assert.ok(f[i] !== 1 && f[i] !== 5, `black key ${n.m} got finger ${f[i]} in ${f}`); });
});

test('a rest gives the hand a new position; a rest has no finger', () => {
  const notes = [{ m: 60, d: 1 }, { m: 0, d: 2 }, { m: 72, d: 1 }, { m: 74, d: 1 }];
  const f = fingerLine(notes, 'rh');
  assert.equal(f[1], 0);
  assert.ok(f[2] >= 1 && f[3] > f[2]);
  assert.deepEqual(fingerLine([{ m: 0, d: 6 }], 'rh'), [0]);
  assert.deepEqual(fingerLine([], 'lh'), []);
});

test('every finger is 1–5 and the bars keep their shape', () => {
  let seed = 9;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let round = 0; round < 50; round++) {
    const bars = Array.from({ length: 4 }, () => Array.from({ length: 1 + Math.floor(rng() * 5) }, () => ({ m: rng() < 0.15 ? 0 : 48 + Math.floor(rng() * 30), d: 1 })));
    for (const hand of ['rh', 'lh']) {
      const f = fingerBars(bars, hand);
      assert.deepEqual(f.map(b => b.length), bars.map(b => b.length));
      f.forEach((bar, i) => bar.forEach((x, j) => assert.equal(bars[i][j].m ? x >= 1 && x <= 5 : x === 0, true)));
    }
  }
});

test('an empty bar or a bar that ends in silence breaks the line, so the hand can move', () => {
  // the same two notes either side: without a gap they are one line, with a bar of silence between they are free to re-position
  const joined = fingerBars([[{ m: 60, d: 3 }], [{ m: 74, d: 3 }]], 'rh', 3);
  assert.ok(joined.flat().every(f => f >= 1 && f <= 5));
  const gapped = fingerBars([[{ m: 60, d: 1 }, { m: 62, d: 1 }], [], [{ m: 64, d: 1 }, { m: 65, d: 1 }]], 'rh', 3);
  assert.equal(gapped[1].length, 0);
  assert.deepEqual(gapped.map(b => b.length), [2, 0, 2]);
  assert.ok(gapped[2][1] > gapped[2][0]); // the line after the gap still climbs with the fingers
});
