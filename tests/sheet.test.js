import test from 'node:test';
import assert from 'node:assert/strict';
import { stepOf, stepLetter, chordLayout, ledgerSteps } from '../js/sheet.js';

const TREBLE = { low: 28, high: 40 };
const BASS = { low: 16, high: 28 };

test('staff steps: middle C is 28, accidentals follow the spelled letter', () => {
  assert.equal(stepOf('C', 60), 28);
  assert.equal(stepOf('E', 64), 30); // bottom line of the treble staff
  assert.equal(stepOf('G', 43), 18); // bottom line of the bass staff
  assert.equal(stepOf('Bb', 70), 34);
  assert.equal(stepOf('Cb', 59), 28, 'Cb4 is written on the C line even though it sounds like B3');
  assert.equal(stepOf('E#', 65), 30, 'E#4 is written on the E line even though it sounds like F4');
});

test('chord layout: stem direction and touching notes', () => {
  const sus2 = chordLayout([28, 29, 32]); // C D G
  assert.equal(sus2.up, true);
  assert.deepEqual(sus2.notes.map(n => n.dx), [0, 1, 0]);
  const high = chordLayout([36, 38, 40]);
  assert.equal(high.up, false);
  assert.ok(chordLayout([28, 30, 32]).notes.every(n => n.dx === 0));
});

test('ledger lines', () => {
  assert.deepEqual(ledgerSteps(28, TREBLE), [28]); // middle C
  assert.deepEqual(ledgerSteps(29, TREBLE), []);
  assert.deepEqual(ledgerSteps(26, TREBLE), [28, 26]);
  assert.deepEqual(ledgerSteps(40, TREBLE), [40]);
  assert.deepEqual(ledgerSteps(14, BASS), [16, 14]); // C2
  assert.deepEqual(ledgerSteps(17, BASS), []);
});

test('letters written on the staff lines and spaces', () => {
  assert.deepEqual([30, 32, 34, 36, 38].map(stepLetter), ['E', 'G', 'B', 'D', 'F'], 'treble lines');
  assert.deepEqual([31, 33, 35, 37].map(stepLetter), ['F', 'A', 'C', 'E'], 'treble spaces');
  assert.deepEqual([18, 20, 22, 24, 26].map(stepLetter), ['G', 'B', 'D', 'F', 'A'], 'bass lines');
  assert.deepEqual([19, 21, 23, 25].map(stepLetter), ['A', 'C', 'E', 'G'], 'bass spaces');
  assert.equal(stepLetter(28), 'C', 'middle C');
});
