import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNotation, notationOf } from '../js/notation-text.js';

test('typed notes: letters, flats and sharps, octaves, lengths, rests, bars', () => {
  const r = parseNotation('r:3 Bb4:1 C5 D5 | Eb5:3 D5:2 C5:1 | F#4:6', 6);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.bars, [
    [{ m: 0, d: 3 }, { m: 70, d: 1 }, { m: 72, d: 1 }, { m: 74, d: 1 }],
    [{ m: 75, d: 3 }, { m: 74, d: 2 }, { m: 72, d: 1 }],
    [{ m: 66, d: 6 }],
  ]);
  assert.equal(r.notes, 7);
});

test('the same notes can be typed in other ways: lowercase, ♭ ♯ signs, no spaces round the bar line', () => {
  const a = parseNotation('bb4:2 c5:2 e♭5:2|f♯4:6', 6);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.bars.flat().map(n => n.m), [70, 72, 75, 66]);
  assert.deepEqual(parseNotation('| C4:6 | G3:6 |', 6).bars.length, 2); // bars at the very start or end only frame the music
  assert.deepEqual(parseNotation('c4:1 d4 e4 f4 g4 a4 | b4:6', 6).bars[0].map(n => n.d), [1, 1, 1, 1, 1, 1]);
});

test('middle C is C4, and the extremes of the piano are checked', () => {
  assert.equal(parseNotation('C4:1', 4).bars[0][0].m, 60);
  assert.equal(parseNotation('A0:1', 4).bars[0][0].m, 21);
  assert.equal(parseNotation('C8:1', 4).bars[0][0].m, 108);
  assert.match(parseNotation('C9:1', 4).errors[0].message, /outside the piano/);
  assert.match(parseNotation('G#0:1', 4).errors[0].message, /outside the piano/); // below A0? G♯0 is key 20
});

test('mistakes are explained with the bar they are in, and nothing slips through quietly', () => {
  const tooLong = parseNotation('C4:3 D4:3 | E4:4 F4:3', 6);
  assert.equal(tooLong.errors.length, 1);
  assert.equal(tooLong.errors[0].bar, 2);
  assert.match(tooLong.errors[0].message, /7 counts but a bar holds 6|has 7 counts/);
  const unknown = parseNotation('C4:2 H4:2 | D4:2', 6);
  assert.equal(unknown.errors[0].bar, 1);
  assert.match(unknown.errors[0].message, /can’t read “H4:2”/);
  assert.match(parseNotation('C4:2.3', 4).errors[0].message, /half counts/);
  assert.equal(parseNotation('C4:0', 4).errors.length, 1);
});

test('a bar that is not full ends in silence, and trailing rests are not stored', () => {
  const r = parseNotation('C4:2 r:1 | D4:1 r:2 | r:6', 6);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.bars, [[{ m: 60, d: 2 }], [{ m: 62, d: 1 }], []]);
  assert.deepEqual(parseNotation('', 4), { bars: [], errors: [], notes: 0 });
  assert.deepEqual(parseNotation('   ', 4).bars, []);
});

test('half counts work, and typing the music back out gives the same music', () => {
  const r = parseNotation('C4:0.5 D4 E4:1 F4:1.5 | G4:4', 4);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.bars[0].map(n => n.d), [0.5, 0.5, 1, 1.5]);
  const text = notationOf(r.bars);
  assert.deepEqual(parseNotation(text, 4).bars, r.bars);
  const six = parseNotation('r:3 Bb4:1 C5 D5 | Eb5:3 D5:2 C5:1', 6);
  assert.equal(notationOf(six.bars, true), 'r:3 Bb4:1 C5 D5 | Eb5:3 D5:2 C5:1');
  assert.equal(notationOf(six.bars, false), 'r:3 A#4:1 C5 D5 | D#5:3 D5:2 C5:1');
});
