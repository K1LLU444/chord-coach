import test from 'node:test';
import assert from 'node:assert/strict';
import { newMelody, addNote, undoNote, roomIn, isEmpty, keyName, noteText, prefersFlats, fitBars } from '../js/melody.js';
import { cleanMelody, lengthOptions, barEvents, eventSeconds, DEFAULT_FEEL } from '../js/rhythm.js';
import { buildTimeline, keyRange } from '../js/falling.js';
import { makeChord, TYPE_BY_ID, handPlan, easyBass, parseChord, gradeMarks } from '../js/theory.js';

const SIX_EIGHT = { bpm: 69, pulses: 6, group: 3, hits: Array.from({ length: 6 }, () => ({ accent: false, soft: false, rest: false })) };

test('a tune keeps notes inside the bar: a note that does not fit is refused', () => {
  const tune = newMelody(SIX_EIGHT, 2);
  assert.deepEqual(addNote(tune, 0, 65, 3), { ok: true, full: false });
  assert.equal(roomIn(tune, 0), 3);
  assert.deepEqual(addNote(tune, 0, 67, 4), { ok: false, room: 3 });
  assert.deepEqual(addNote(tune, 0, 0, 3), { ok: true, full: true }); // a rest fills the rest of the bar
  assert.equal(tune.bars[0].length, 2);
  assert.deepEqual(undoNote(tune, 0), { m: 0, d: 3 });
  assert.equal(isEmpty(tune), false);
  undoNote(tune, 0);
  assert.equal(isEmpty(tune), true);
  assert.equal(undoNote(tune, 1), null);
});

test('fitBars adds empty bars when the song gets more chords', () => {
  const tune = fitBars(newMelody(SIX_EIGHT, 1), 3);
  assert.equal(tune.bars.length, 3);
});

test('note lengths offered match the counting: eighths in 6/8, quarters in 4/4', () => {
  const six = lengthOptions(SIX_EIGHT).map(o => [o.d, o.name]);
  assert.deepEqual(six, [[1, 'eighth note'], [1.5, 'dotted eighth'], [2, 'quarter note'], [3, 'dotted quarter'], [4, 'half note'], [6, 'dotted half']].filter(([d]) => Number.isInteger(d * 2)));
  const four = lengthOptions(DEFAULT_FEEL).map(o => [o.d, o.name]);
  assert.deepEqual(four, [[0.5, 'eighth note'], [1, 'quarter note'], [1.5, 'dotted eighth'.replace('dotted eighth', 'dotted quarter')], [2, 'half note'], [3, 'dotted half'], [4, 'whole note']]);
});

test('cleanMelody drops notes outside the piano, odd lengths and bars that run over', () => {
  const dirty = { pulses: 6, group: 3, bars: [[{ m: 65, d: 3 }, { m: 200, d: 1 }, { m: 67, d: 4 }, { m: 70, d: 3 }], 'junk', [{ m: 0, d: 0.1 }]] };
  const clean = cleanMelody(dirty);
  assert.deepEqual(clean.bars[0], [{ m: 65, d: 3 }, { m: 70, d: 3 }]);
  assert.deepEqual(clean.bars[1], []);
  assert.deepEqual(clean.bars[2], []);
  assert.equal(cleanMelody({ pulses: 6, group: 3, bars: [[{ m: 0, d: 6 }]] }), null); // only rests
  assert.equal(cleanMelody(null), null);
  assert.equal(cleanMelody({ pulses: 99, group: 3, bars: [[{ m: 60, d: 1 }]] }), null);
});

test('with a tune, the right hand plays the tune and the left hand keeps the style\'s bass', () => {
  const chord = parseChord('Gm');
  const plan = handPlan(chord, 'easy', { feel: SIX_EIGHT });
  const events = barEvents(plan, SIX_EIGHT, [{ m: 70, d: 2 }, { m: 0, d: 1 }, { m: 69, d: 3 }]);
  const right = events.filter(e => e.hand === 'rh');
  assert.deepEqual(right.map(e => [e.pulse, e.notes[0]]), [[0, 70], [3, 69]]); // the rest makes no sound but takes time
  assert.ok(right.every(e => e.tune));
  const left = events.filter(e => e.hand === 'lh');
  assert.equal(left.length, 1);
  assert.equal(left[0].len, 6); // the root is held for the whole bar
});

test('Easy bass: one root just below middle C, the chord in the right hand', () => {
  for (const sym of ['C', 'D', 'Bb', 'F#m', 'Gm', 'B', 'C/E']) {
    const chord = parseChord(sym);
    const plan = handPlan(chord, 'easy');
    assert.equal(plan.lh.notes.length, 1);
    assert.ok(plan.lh.notes[0] >= 48 && plan.lh.notes[0] <= 59, `${sym} root ${plan.lh.notes[0]}`);
    assert.equal(plan.lh.notes[0] % 12, chord.bassPc ?? chord.rootPc);
    assert.ok(plan.rh.notes.every(m => m >= 60));
  }
  assert.equal(easyBass(parseChord('G')), 55);
});

test('Easy bass in the quiz: only the root in the left hand, any octave', () => {
  const chord = parseChord('Gm');
  const ok = gradeMarks(chord, new Map([[43, 'lh'], [70, 'rh'], [67, 'rh'], [62, 'rh']]), 'easy');
  assert.equal(ok.ok, true);
  const tooMany = gradeMarks(chord, new Map([[43, 'lh'], [50, 'lh'], [70, 'rh'], [67, 'rh'], [62, 'rh']]), 'easy');
  assert.equal(tooMany.ok, false);
});

test('timeline: notes sit at their pulse in the whole sample, with their own lengths', () => {
  const plan = handPlan(parseChord('Bb'), 'easy', { feel: SIX_EIGHT });
  const fingers = new Map([[plan.lh.notes[0], 5]]);
  const tl = buildTimeline([
    { plan, tune: [{ m: 74, d: 3 }, { m: 72, d: 3 }], fingers, label: 'Bb' },
    { plan, tune: null, label: 'Bb' },
  ], SIX_EIGHT, 69);
  assert.equal(tl.total, 12);
  const tune = tl.notes.filter(n => n.tune);
  assert.deepEqual(tune.map(n => [n.midi, n.start]), [[74, 0], [72, 3]]);
  const bass = tl.notes.find(n => n.hand === 'lh' && n.start === 0);
  assert.equal(bass.len, 6);
  assert.equal(bass.finger, 5);
  assert.equal(tune[0].finger, null);
  const secondBar = tl.notes.filter(n => n.start >= 6);
  assert.ok(secondBar.length > 0 && secondBar.every(n => !n.tune));
});

test('keyRange covers every note in whole octaves, at least two octaves', () => {
  const r = keyRange([{ midi: 50 }, { midi: 77 }]);
  assert.deepEqual(r, { from: 48, to: 83 });
  const narrow = keyRange([{ midi: 62 }, { midi: 64 }]);
  assert.equal(narrow.to - narrow.from + 1 >= 24, true);
  assert.equal(narrow.from % 12, 0);
  assert.ok(r.from >= 36 && r.to <= 96);
});

test('note names and flats', () => {
  assert.equal(keyName(65), 'F4');
  assert.equal(keyName(70, true), 'Bb4');
  assert.equal(keyName(70), 'A#4');
  assert.equal(noteText({ m: 65, d: 1 }), 'F4 · 1 count');
  assert.equal(noteText({ m: 0, d: 2 }), 'rest · 2 counts');
  assert.equal(prefersFlats('Bb'), true);
  assert.equal(prefersFlats('G'), false);
});

test('a held or tune note lasts as long as it says; other notes keep their usual length', () => {
  assert.ok(Math.abs(eventSeconds({ hand: 'rh', len: 3 }, 0.3) - 0.9) < 1e-9);
  assert.ok(Math.abs(eventSeconds({ hand: 'lh', len: 6 }, 0.3) - 1.8) < 1e-9);
  assert.equal(eventSeconds({ hand: 'lh' }, 0.2), 0.8);
  assert.ok(eventSeconds({ hand: 'rh', len: 0.1 }, 0.1) >= 0.12);
});

import { noteShape, beamGroups, layoutPage, BARS_PER_LINE, LINES_PER_PAGE, FIRST_PAGE_LINES } from '../js/tune-sheet.js';

test('tune sheet: what each length looks like in 6/8 and 4/4', () => {
  assert.deepEqual(noteShape(1, SIX_EIGHT), { kind: 'eighth', dots: 0 });
  assert.deepEqual(noteShape(2, SIX_EIGHT), { kind: 'quarter', dots: 0 });
  assert.deepEqual(noteShape(3, SIX_EIGHT), { kind: 'quarter', dots: 1 });
  assert.deepEqual(noteShape(6, SIX_EIGHT), { kind: 'half', dots: 1 }); // a whole 6/8 bar is a dotted half
  assert.deepEqual(noteShape(1, DEFAULT_FEEL), { kind: 'quarter', dots: 0 });
  assert.deepEqual(noteShape(0.5, DEFAULT_FEEL), { kind: 'eighth', dots: 0 });
  assert.deepEqual(noteShape(4, DEFAULT_FEEL), { kind: 'whole', dots: 0 });
  assert.deepEqual(noteShape(1.5, DEFAULT_FEEL), { kind: 'quarter', dots: 1 });
});

test('tune sheet: eighths are beamed inside one beat, never across beats or over a rest', () => {
  const eighths = n => Array.from({ length: n }, () => ({ m: 70, d: 1 }));
  assert.deepEqual(beamGroups(eighths(6), SIX_EIGHT), [[0, 1, 2], [3, 4, 5]]);
  assert.deepEqual(beamGroups([{ m: 0, d: 3 }, { m: 70, d: 1 }, { m: 72, d: 1 }, { m: 74, d: 1 }], SIX_EIGHT), [[1, 2, 3]]);
  assert.deepEqual(beamGroups([{ m: 70, d: 2 }, { m: 72, d: 1 }, { m: 74, d: 3 }], SIX_EIGHT), []); // one lone eighth: a flag, no beam
  assert.deepEqual(beamGroups([{ m: 70, d: 1 }, { m: 0, d: 1 }, { m: 72, d: 1 }], SIX_EIGHT), []);
  assert.deepEqual(beamGroups([{ m: 70, d: 0.5 }, { m: 72, d: 0.5 }, { m: 74, d: 1 }], DEFAULT_FEEL), [[0, 1]]);
});

test('tune sheet: bars go four to a line; fewer lines fit on the first page', () => {
  assert.deepEqual(layoutPage(0), []);
  assert.deepEqual(layoutPage(6), [[[0, 1, 2, 3], [4, 5]]]);
  const pages = layoutPage(BARS_PER_LINE * (FIRST_PAGE_LINES + LINES_PER_PAGE) + 1);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].length, FIRST_PAGE_LINES);
  assert.equal(pages[1].length, LINES_PER_PAGE);
  assert.deepEqual(pages[2], [[BARS_PER_LINE * (FIRST_PAGE_LINES + LINES_PER_PAGE)]]);
  assert.deepEqual(pages.flat().flat(), Array.from({ length: BARS_PER_LINE * (FIRST_PAGE_LINES + LINES_PER_PAGE) + 1 }, (_, i) => i)); // every bar once, in order
});

import { keyScale, candidateRows, barToGrid, gridToBar } from '../js/melody.js';

test('the notes of a key: written key, minor keys, or the best fit for the chords', () => {
  assert.deepEqual([...keyScale('Bb')].sort((a, b) => a - b), [0, 2, 3, 5, 7, 9, 10]);
  assert.deepEqual([...keyScale('Gm')].sort((a, b) => a - b), [0, 2, 3, 5, 7, 9, 10]); // G minor shares B♭ major's notes
  assert.deepEqual([...keyScale('F#')].sort((a, b) => a - b), [1, 3, 5, 6, 8, 10, 11]);
  const chords = ['C', 'F', 'G', 'Am'].map(parseChord);
  assert.deepEqual([...keyScale('', chords)].sort((a, b) => a - b), [0, 2, 4, 5, 7, 9, 11]);
});

test('rows to offer for a bar: the chord notes (marked) and the key\'s other notes, highest first', () => {
  const rows = candidateRows(parseChord('Dm'), keyScale('Bb'), 60, 72);
  assert.deepEqual(rows.map(r => r.m), [72, 70, 69, 67, 65, 63, 62, 60]);
  assert.deepEqual(rows.filter(r => r.chordTone).map(r => r.m), [69, 65, 62]); // D, F, A
  const outside = candidateRows(parseChord('Edim'), keyScale('C'), 60, 71); // a chord note outside the key is still offered
  assert.ok(outside.some(r => r.m === 70 && r.chordTone));
});

test('grid cells and bar notes convert both ways without changing the music', () => {
  const bar = [{ m: 0, d: 3 }, { m: 70, d: 1 }, { m: 72, d: 2 }];
  const cells = barToGrid(bar, 6);
  assert.deepEqual(cells, [0, null, null, 70, 72, null]);
  assert.deepEqual(gridToBar(cells), bar);
  assert.deepEqual(barToGrid([{ m: 70, d: 3 }], 6), [70, null, null, 0, null, null]); // the bar's empty end is a rest
  assert.deepEqual(gridToBar([70, null, null, 0, null, null]), [{ m: 70, d: 3 }]); // …and a trailing rest is not stored
  assert.deepEqual(gridToBar([null, null, 65, null, null, null]), [{ m: 0, d: 2 }, { m: 65, d: 4 }]);
  assert.deepEqual(gridToBar(Array(6).fill(null)), []);
  assert.equal(barToGrid([{ m: 70, d: 0.5 }, { m: 72, d: 0.5 }], 4), null); // half counts can't be shown on the grid
  assert.deepEqual(barToGrid([], 6), Array(6).fill(null));
});

import { barFit, bestBreak, moveFrom } from '../js/melody.js';

test('finding where a tune drifts from the chords, and moving it back', () => {
  const chords = ['Bb', 'Dm', 'Eb', 'Ebm', 'Bb', 'F', 'Gm', 'Eb', 'Bb', 'Dm', 'Eb', 'F', 'Bb', 'Gm', 'Eb', 'F'].map(parseChord);
  // a made-up tune: on each bar's first and fourth count, a note of that bar's chord
  const bar = chord => [{ m: 60 + chord.pcs[0], d: 3 }, { m: 60 + chord.pcs[1], d: 3 }];
  const good = { pulses: 6, group: 3, bars: chords.map(bar) };
  assert.equal(barFit(good, chords, 0).fit, 1);
  assert.equal(bestBreak(good, chords), null); // already lined up: nothing to suggest
  // two extra bars slip in after bar 4: from bar 5 on, the tune is two bars late
  const late = { ...good, bars: [...good.bars.slice(0, 4), [], [], ...good.bars.slice(4)] };
  const found = bestBreak(late, chords);
  assert.equal(found.shift, -2);
  assert.ok(found.at >= 4 && found.at <= 6); // the two empty bars sit at 5 and 6, and removing them anywhere in there is the same
  assert.ok(found.fitBest > found.fitNow + 0.2);
  const fixed = moveFrom(late, found.at, found.shift);
  assert.deepEqual(fixed.bars, good.bars);
  assert.equal(moveFrom(good, 2, 2).bars.length, good.bars.length + 2);
  assert.deepEqual(moveFrom(good, 2, 2).bars.slice(2, 4), [[], []]);
  assert.equal(bestBreak({ ...good, bars: [[]] }, chords), null); // too few notes to tell
});

import { hasBass, bassBars } from '../js/melody.js';

test('a song\'s own bass line replaces the style\'s left hand, for that bar only', () => {
  const plan = handPlan(parseChord('Bb'), 'bass', { feel: SIX_EIGHT });
  const events = barEvents(plan, SIX_EIGHT, null, [{ m: 46, d: 3 }, { m: 0, d: 1 }, { m: 41, d: 2 }]);
  const left = events.filter(e => e.hand === 'lh');
  assert.deepEqual(left.map(e => [e.pulse, e.notes[0]]), [[0, 46], [4, 41]]);
  assert.ok(left.every(e => e.bass));
  assert.ok(events.some(e => e.hand === 'rh' && !e.tune)); // the right hand still plays the style's chord
  const both = barEvents(plan, SIX_EIGHT, [{ m: 70, d: 6 }], [{ m: 46, d: 6 }]);
  assert.deepEqual(both.map(e => [e.hand, e.notes[0]]).sort(), [['lh', 46], ['rh', 70]]);
});

test('the grid can offer every key, with the ones outside the song\'s key marked', () => {
  const rows = candidateRows(parseChord('Bb'), keyScale('Bb'), 60, 71, true);
  assert.equal(rows.length, 12);
  const gb = rows.find(r => r.m === 66); // G♭ / F♯ over a B♭ chord
  assert.deepEqual({ chordTone: gb.chordTone, inKey: gb.inKey }, { chordTone: false, inKey: false });
  assert.equal(rows.find(r => r.m === 70).chordTone, true);
});

test('a bass line is kept by cleanMelody, and checked like the tune', () => {
  const clean = cleanMelody({ pulses: 6, group: 3, bars: [[{ m: 70, d: 6 }]], bass: [[{ m: 46, d: 6 }, { m: 50, d: 1 }], [{ m: 5, d: 2 }]] });
  assert.deepEqual(clean.bass, [[{ m: 46, d: 6 }], []]); // the 2nd note doesn't fit the bar; key 5 is below the piano
  assert.equal(hasBass(clean), true);
  const onlyBass = cleanMelody({ pulses: 6, group: 3, bars: [[]], bass: [[{ m: 46, d: 6 }]] });
  assert.equal(isEmpty(onlyBass), false);
  assert.equal(cleanMelody({ pulses: 6, group: 3, bars: [[]], bass: [[]] }), null);
  const m = { pulses: 6, group: 3, bars: [[]] };
  assert.equal(bassBars(m, 3).length, 3);
});

import { splitLength } from '../js/tune-sheet.js';

test('tune sheet: a length that is not one note shape is split into tied notes', () => {
  assert.deepEqual(splitLength(6, SIX_EIGHT), [6]);
  assert.deepEqual(splitLength(5, SIX_EIGHT), [4, 1]);
  assert.deepEqual(splitLength(3, SIX_EIGHT), [3]);
  assert.deepEqual(splitLength(2.5, DEFAULT_FEEL), [2, 0.5]);
  assert.deepEqual(splitLength(3.5, DEFAULT_FEEL), [3, 0.5]);
  assert.deepEqual(splitLength(7, { ...SIX_EIGHT, pulses: 9 }), [6, 1]);
  for (const d of [1, 1.5, 2, 4]) assert.equal(splitLength(d, SIX_EIGHT).reduce((a, b) => a + b, 0), d);
});

test('falling notes: bars are numbered from the first bar given', () => {
  const plan = handPlan(parseChord('C'), 'easy', { feel: SIX_EIGHT });
  const bars = [{ plan, label: 'C' }, { plan, label: 'F' }];
  assert.equal(buildTimeline(bars, SIX_EIGHT, 69).firstBar, 1);
  assert.equal(buildTimeline(bars, SIX_EIGHT, 69, 9).firstBar, 9);
});

import { keySignature, signaturePositions } from '../js/tune-sheet.js';

test('key signatures: how many flats or sharps, which letters, and where they sit on each clef', () => {
  assert.deepEqual(keySignature('Bb'), { kind: 'flat', letters: ['B', 'E'], alters: { B: -1, E: -1 } });
  assert.deepEqual(keySignature('Gm').letters, ['B', 'E']); // G minor shares B♭ major's signature
  assert.deepEqual(keySignature('D'), { kind: 'sharp', letters: ['F', 'C'], alters: { F: 1, C: 1 } });
  assert.deepEqual(keySignature('F').letters, ['B']);
  assert.deepEqual(keySignature('Eb').letters, ['B', 'E', 'A']);
  assert.equal(keySignature('C').kind, null);
  assert.equal(keySignature('Am').kind, null);
  assert.equal(keySignature('').kind, null);
  assert.equal(keySignature('nonsense').kind, null);
  assert.equal(keySignature('B♭').letters.length, 2); // the ♭ sign works as well as b
  assert.deepEqual(signaturePositions(keySignature('Bb'), 'treble'), [{ letter: 'B', step: 34 }, { letter: 'E', step: 37 }]);
  assert.deepEqual(signaturePositions(keySignature('Bb'), 'bass'), [{ letter: 'B', step: 20 }, { letter: 'E', step: 23 }]);
  assert.deepEqual(signaturePositions(keySignature('G'), 'treble'), [{ letter: 'F', step: 38 }]);
});
