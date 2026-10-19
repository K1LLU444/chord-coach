import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FEEL, feelFromStrumming, pulseSeconds, signatureOf, barEvents, clickLevel } from '../js/rhythm.js';
import { handPlan, parseChord, parseSong } from '../js/theory.js';
import { analyzeSong, simplerChord, countText } from '../js/analyze.js';

// The strumming data Ultimate Guitar has for "Until I Found You": six down strums, the 4th accented, in triplets, 67 bpm.
const UNTIL_I_FOUND_YOU = {
  part: 'Main Pattern', denuminator: 8, bpm: 67, is_triplet: 1,
  measures: [{ measure: 1 }, { measure: 1 }, { measure: 1 }, { measure: 3 }, { measure: 1 }, { measure: 1 }],
};

test('Ultimate Guitar strumming becomes a feel', () => {
  const feel = feelFromStrumming(UNTIL_I_FOUND_YOU);
  assert.equal(feel.bpm, 67);
  assert.equal(feel.pulses, 6);
  assert.equal(feel.group, 3, 'triplets: two main beats of three strums');
  assert.deepEqual(feel.hits.map(h => h.accent), [false, false, false, true, false, false]);
  assert.deepEqual(signatureOf(feel), [6, 8]);
  assert.ok(Math.abs(pulseSeconds(feel) - 60 / 67 / 3) < 1e-9);
});

test('other strumming shapes', () => {
  const eighths = feelFromStrumming({ denuminator: 8, bpm: 90, is_triplet: 0, measures: [1, 1, 2, 2, 1, 2, 1, 2].map(measure => ({ measure })) });
  assert.deepEqual([eighths.pulses, eighths.group], [8, 2]);
  assert.deepEqual(signatureOf(eighths), [4, 4]);
  assert.equal(eighths.hits[2].soft, true, 'code 2 is an up strum');
  const quarters = feelFromStrumming({ denuminator: 4, bpm: 70, measures: [1, 0, 1, 1].map(measure => ({ measure })) });
  assert.deepEqual([quarters.pulses, quarters.group, quarters.hits[1].rest], [4, 1, true]);
  assert.equal(feelFromStrumming(null), null);
  assert.equal(feelFromStrumming({ measures: [{ measure: 1 }] }), null, 'one strum is not a pattern');
  assert.equal(feelFromStrumming({ bpm: 500, measures: [1, 1, 1, 1].map(measure => ({ measure })) }).bpm, 200, 'tempo is kept sensible');
});

test('strum style events: bass on count 1 and the middle, chord on every pulse', () => {
  const feel = feelFromStrumming(UNTIL_I_FOUND_YOU);
  const events = barEvents(handPlan(parseChord('Bb'), 'strum', { feel }), feel);
  const lh = events.filter(e => e.hand === 'lh');
  const rh = events.filter(e => e.hand === 'rh');
  assert.deepEqual(lh.map(e => e.pulse), [0, 3], 'root on 1, 5th on 4');
  assert.deepEqual(rh.map(e => e.pulse), [0, 1, 2, 3, 4, 5]);
  assert.ok(rh[3].velocity > rh[1].velocity, 'the accented 4th is louder');
  assert.deepEqual(rh[0].notes, handPlan(parseChord('Bb'), 'strum').rh.notes, 'the whole chord each time');
});

test('bass + chord and broken-note events', () => {
  const C = parseChord('C');
  const six = { ...DEFAULT_FEEL, pulses: 6, group: 3, hits: Array.from({ length: 6 }, () => ({})) };
  const bass = barEvents(handPlan(C, 'bass'), six);
  assert.deepEqual(bass.filter(e => e.hand === 'lh').map(e => [e.pulse, e.notes[0]]), [[0, 36], [2, 43], [4, 48]], 'bass notes spread over the bar');
  assert.deepEqual(bass.filter(e => e.hand === 'rh').map(e => e.pulse), [0, 3]);
  const broken = barEvents(handPlan(C, 'broken'), six);
  assert.deepEqual(broken.filter(e => e.hand === 'rh').map(e => e.notes[0]), [60, 64, 67, 60, 64, 67], 'one note per pulse, round and round');
  assert.deepEqual(broken.filter(e => e.hand === 'lh').map(e => e.pulse), [0, 3]);
});

test('metronome click levels', () => {
  const feel = feelFromStrumming(UNTIL_I_FOUND_YOU);
  assert.deepEqual([0, 1, 3].map(p => clickLevel(feel, p)), [1, 0.35, 0.7]);
  assert.equal(clickLevel(feel, 1, false), null, 'counting only the main beats');
});

test('simpler chords to start with', () => {
  const simple = s => simplerChord(parseChord(s)).symbol;
  assert.deepEqual(['Bb7', 'Ebm6', 'F7', 'Cmaj7', 'Am7', 'Gadd9', 'C9', 'Bm7b5', 'Ddim7'].map(simple), ['Bb', 'Ebm', 'F', 'C', 'Am', 'G', 'C', 'Bdim', 'Ddim']);
  assert.deepEqual(['Bb', 'Dm', 'Csus4', 'Dsus2', 'Eaug'].map(simple), ['Bb', 'Dm', 'Csus4', 'Dsus2', 'Eaug'], 'plain chords stay as they are');
});

test('counting a bar out loud', () => {
  assert.equal(countText(feelFromStrumming(UNTIL_I_FOUND_YOU)), '1-2-3  4-5-6');
  assert.equal(countText(DEFAULT_FEEL), '1  2  3  4');
});

test('song analysis: strum pattern, tempo and an easier starting set', () => {
  const text = '[Intro]\nBb Dm Eb Ebm\n[Verse]\nBb Dm Eb\nEbm Bb Dm\nF7\nEb F Bb Bb7\nEb Ebm Ebm6 Bb';
  const feel = feelFromStrumming(UNTIL_I_FOUND_YOU);
  const withPattern = analyzeSong({ text, meta: { feel, key: 'Bb' } });
  assert.equal(withPattern.style, 'strum');
  assert.equal(withPattern.hasPattern, true);
  assert.equal(withPattern.feel.bpm, 67);
  assert.equal(withPattern.signature, '6/8');
  assert.equal(withPattern.mainBeats, 2);
  assert.deepEqual(withPattern.unique, ['Bb', 'Dm', 'Eb', 'Ebm', 'F7', 'F', 'Bb7', 'Ebm6']);
  assert.deepEqual(withPattern.starter, ['Bb', 'Dm', 'Eb', 'Ebm', 'F']);
  assert.deepEqual(withPattern.easier, [{ from: 'F7', to: 'F' }, { from: 'Bb7', to: 'Bb' }, { from: 'Ebm6', to: 'Ebm' }]);

  const without = analyzeSong({ text });
  assert.equal(without.hasPattern, false);
  assert.equal(without.style, 'bass');
  assert.equal(without.feel.bpm, DEFAULT_FEEL.bpm);
  assert.equal(parseSong(text).chords.length, withPattern.chordCount);
});

test('song form: section order and the distinct chord lines', async () => {
  const { songForm } = await import('../js/analyze.js');
  const text = '[Intro]\nBb Dm Eb Ebm\n[Verse 1]\nBb Dm\nF7\n[Chorus]\nEb F Bb\n[Verse 2]\nBb Dm\nF7\n[Chorus]\nEb F Bb\n[Guitar Solo]\nBb Dm Eb Ebm\n[Chorus]\nEb F Bb Ebm6';
  const form = songForm({ text });
  assert.deepEqual(form.order, ['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Chorus', 'Guitar Solo', 'Chorus']);
  assert.deepEqual(form.groups.map(g => g.names), [['Intro', 'Guitar Solo'], ['Verse 1', 'Verse 2'], ['Chorus'], ['Chorus (2)']]);
  assert.deepEqual(form.groups[0].chords, ['Bb', 'Dm', 'Eb', 'Ebm']);
  assert.deepEqual(songForm({ text: 'C G Am F' }).order, ['Song'], 'a song without headings is one part');
  assert.deepEqual(songForm({ text: 'C G\n[Chorus]\nAm F' }).order, ['Start', 'Chorus'], 'chords before the first heading');
});
