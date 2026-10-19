import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChord, handPlan, rhVoicing } from '../js/theory.js';
import { fingerPlan, rightFingers, leftChordFingers, fingerText } from '../js/fingers.js';

const fingers = (symbol, style, opts) => {
  const chord = parseChord(symbol);
  const plan = handPlan(chord, style, opts);
  return { ...fingerPlan(chord, plan), plan, chord };
};

test('Bass + chord: left hand 5-2-1 on root, 5th, octave; right hand 1-3-5', () => {
  const g = fingers('Gm', 'bass');
  assert.deepEqual(g.lh, [5, 2, 1]);
  assert.deepEqual(g.rh, [1, 3, 5]);
  assert.equal(g.map.get(g.plan.lh.notes[0]), 5, 'the lowest left-hand key gets the little finger');
});

test('Strum: left hand 5-1 (root and 5th), right hand chord 1-3-5', () => {
  const g = fingers('Bb', 'strum');
  assert.deepEqual(g.lh, [5, 1]);
  assert.deepEqual(g.rh, [1, 3, 5]);
});

test('Chord + broken notes: left-hand chord 5-3-1, right hand uses the same fingers one at a time', () => {
  const g = fingers('Fm', 'broken');
  assert.deepEqual(g.lh, [5, 3, 1]);
  assert.deepEqual(g.rh, [1, 3, 5]);
  assert.equal(g.plan.lh.together, true);
  assert.equal(g.plan.rh.together, false);
});

test('7th chords use four fingers, 9th chords five', () => {
  assert.deepEqual(fingers('F7', 'bass').rh, [1, 2, 3, 5]);
  assert.deepEqual(fingers('Fmaj7', 'broken').lh, [5, 3, 2, 1]);
  assert.deepEqual(fingers('Cadd9', 'bass').rh, [1, 2, 3, 5]);
  assert.deepEqual(fingers('C9', 'bass').rh, [1, 2, 3, 4, 5]);
});

test('right-hand inversions: 1st inversion is 1-2-5, 2nd inversion 1-3-5', () => {
  const chord = parseChord('C');
  assert.deepEqual(rightFingers(chord, rhVoicing(chord, 0)), [1, 3, 5]);
  assert.deepEqual(rightFingers(chord, rhVoicing(chord, 1)), [1, 2, 5]);
  assert.deepEqual(rightFingers(chord, rhVoicing(chord, 2)), [1, 3, 5]);
});

test('slash chords: bass pattern is two notes (5-1); a held chord with a bass note gets one more finger', () => {
  assert.deepEqual(fingers('C/E', 'bass').lh, [5, 1]);
  assert.deepEqual(fingers('C/E', 'broken').lh, [5, 3, 2, 1], 'bass note + three chord notes');
});

test('every chord, style and inversion: one finger per key, fingers go up as the keys go up', () => {
  const styles = ['bass', 'strum', 'broken'];
  for (const symbol of ['C', 'Gm', 'Bb', 'F#m7', 'Ebmaj7', 'Asus4', 'Bdim', 'Caug', 'E13', 'Bm9', 'D/F#']) {
    const chord = parseChord(symbol);
    for (const style of styles) {
      for (let k = 0; k < chord.pcs.length; k++) {
        const plan = handPlan(chord, style, { inversion: k });
        const f = fingerPlan(chord, plan);
        assert.equal(f.lh.length, plan.lh.notes.length, `${symbol} ${style}: left-hand fingers`);
        assert.equal(f.rh.length, plan.rh.notes.length, `${symbol} ${style}: right-hand fingers`);
        for (const v of [...f.lh, ...f.rh]) assert.ok(v >= 1 && v <= 5, `${symbol} ${style}: finger ${v}`);
        assert.deepEqual([...f.rh], [...f.rh].sort((a, b) => a - b), `${symbol} ${style}: right hand thumb is the lowest key`);
        assert.deepEqual([...f.lh], [...f.lh].sort((a, b) => b - a), `${symbol} ${style}: left hand little finger is the lowest key`);
      }
    }
  }
  assert.equal(fingerText([5, 2, 1]), '5 · 2 · 1');
  assert.deepEqual(leftChordFingers(3), [5, 3, 1]);
});
