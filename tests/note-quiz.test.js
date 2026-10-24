import test from 'node:test';
import assert from 'node:assert/strict';
import { spell, notePool, pickNote, nameChoices, gradeNote, CLEF_RANGE, isBlackKey } from '../js/note-quiz.js';

test('note names with their octave: middle C is C4, black keys use the sign asked for', () => {
  assert.equal(spell(60), 'C4');
  assert.equal(spell(70, true), 'B♭4');
  assert.equal(spell(70, false), 'A♯4');
  assert.equal(spell(54, false), 'F♯3');
  assert.equal(spell(36), 'C2');
  assert.equal(spell(81), 'A5');
});

test('the pool: treble is C4–A5, bass is C2–B3, white keys only unless sharps and flats are on', () => {
  const treble = notePool('treble', false);
  assert.equal(treble.length, 13); // C4 up to A5 on the white keys
  assert.ok(treble.every(n => n.midi >= 60 && n.midi <= 81 && !isBlackKey(n.midi) && n.clef === 'treble'));
  assert.equal(notePool('treble', true).length, 22);
  assert.equal(notePool('bass', false).length, 14);
  const both = notePool('both', true);
  assert.equal(both.length, 22 + 24);
  assert.deepEqual([...new Set(both.map(n => n.clef))].sort(), ['bass', 'treble']);
  assert.deepEqual(CLEF_RANGE, { treble: [60, 81], bass: [36, 59] });
});

test('picking: never the same note twice in a row, always inside the pool, missed notes come back more', () => {
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let last = null;
  for (let i = 0; i < 300; i++) {
    const n = pickNote({ clef: 'both', accidentals: true, lastMidi: last, rng });
    assert.notEqual(n.midi, last);
    assert.ok((n.clef === 'treble' ? n.midi >= 60 && n.midi <= 81 : n.midi >= 36 && n.midi <= 59));
    assert.equal(n.flats && !isBlackKey(n.midi), false); // a white key is never "flat"
    last = n.midi;
  }
  // a note that was just missed (box 1) comes up far more often than one that is mastered (box 5)
  const progress = Object.fromEntries(notePool('treble', false).map(n => [n.midi, { box: 5 }]));
  progress[67] = { box: 1 };
  let hits = 0;
  for (let i = 0; i < 400; i++) if (pickNote({ clef: 'treble', progress, lastMidi: null, rng }).midi === 67) hits++;
  assert.ok(hits > 150, `G4 came up ${hits} times of 400`);
});

test('name choices: four different answers, the right one among them, none outside the clef', () => {
  let seed = 3;
  const rng = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  for (let m = 60; m <= 81; m++) {
    const choices = nameChoices(m, false, 'treble', true, rng);
    assert.equal(choices.length, 4);
    assert.equal(new Set(choices.map(c => c.midi)).size, 4);
    assert.ok(choices.some(c => c.midi === m));
    assert.ok(choices.every(c => c.midi >= 60 && c.midi <= 81));
  }
  const white = nameChoices(64, false, 'treble', false, rng);
  assert.ok(white.every(c => !isBlackKey(c.midi))); // with white keys only, no sharps or flats among the answers
});

test('progress: a right answer levels a note up, a wrong one sends it back', () => {
  const p = {};
  gradeNote(p, 60, true);
  gradeNote(p, 60, true);
  assert.deepEqual(p[60], { box: 3, seen: 2, right: 2 });
  gradeNote(p, 60, false);
  assert.equal(p[60].box, 1);
  assert.equal(p[60].seen, 3);
});

import { newTries, tryAnswer, solvedFirstTry, TRIES } from '../js/note-quiz.js';

test('three tries for each note: a wrong answer costs a try, three wrong end the note, a right one ends it at once', () => {
  let t = newTries();
  assert.deepEqual(t, { max: TRIES, left: 3, wrong: 0, done: false, correct: false });
  t = tryAnswer(t, false);
  assert.deepEqual([t.left, t.wrong, t.done], [2, 1, false]);
  t = tryAnswer(t, false);
  t = tryAnswer(t, false);
  assert.deepEqual([t.left, t.wrong, t.done, t.correct], [0, 3, true, false]); // out of tries: the answer is shown
  assert.equal(tryAnswer(t, true), t); // nothing counts after the note is over
  assert.equal(solvedFirstTry(t), false);
  let u = tryAnswer(newTries(), true);
  assert.deepEqual([u.done, u.correct, solvedFirstTry(u)], [true, true, true]);
  u = tryAnswer(tryAnswer(newTries(), false), true); // right on the second try
  assert.deepEqual([u.done, u.correct, solvedFirstTry(u)], [true, true, false]);
});

test('with the tries switched off a note gets a single try', () => {
  let t = newTries(1);
  t = tryAnswer(t, false);
  assert.deepEqual([t.left, t.done, t.correct], [0, true, false]);
});
