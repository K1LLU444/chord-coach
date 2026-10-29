import test from 'node:test';
import assert from 'node:assert/strict';
import { newPiece, cleanPiece, addBars, removeLastBar, copyBar, pieceBars, pieceFeel, pieceIsEmpty, METERS, MAX_BARS } from '../js/piece.js';
import { barToGrid, gridToBar } from '../js/melody.js';
import { barEvents } from '../js/rhythm.js';
import { buildTimeline } from '../js/falling.js';

test('a new piece: the time signature sets the counting, bars start empty', () => {
  const p = newPiece({ id: 'a', title: '  My song ', meter: '6/8', bpm: 69, key: 'Bb', bars: 12 });
  assert.deepEqual({ pulses: p.pulses, group: p.group, sub: p.sub, bars: p.bars, title: p.title }, { pulses: 6, group: 3, sub: 1, bars: 12, title: 'My song' });
  assert.equal(p.rh.length, 12);
  assert.equal(pieceIsEmpty(p), true);
  const q = newPiece({ id: 'b', meter: '4/4', bars: 0 });
  assert.equal(q.sub, 2); // quarter-note counts get half-count columns for eighth notes
  assert.equal(q.bars, 8); // a missing or zero number falls back to 8
  assert.equal(newPiece({ id: 'c', bars: 9999 }).bars, MAX_BARS);
  assert.equal(newPiece({ id: 'd', bpm: 5 }).bpm, 30);
  assert.equal(newPiece({ id: 'e', key: 'H' }).key, '');
  assert.equal(new Set(METERS.map(m => m.id)).size, METERS.length);
});

test('bars can be added and removed; a bar with notes is not removed silently', () => {
  const p = newPiece({ id: 'a', meter: '3/4', bars: 2 });
  addBars(p, 3);
  assert.deepEqual([p.bars, p.rh.length, p.lh.length, p.chords.length], [5, 5, 5, 5]);
  p.rh[4] = [{ m: 60, d: 3 }];
  assert.equal(removeLastBar(p), false);
  assert.equal(p.bars, 5);
  assert.equal(removeLastBar(p, true), true);
  assert.equal(p.bars, 4);
  const one = newPiece({ id: 'o', bars: 1 });
  assert.equal(removeLastBar(one, true), false); // never fewer than one bar
});

test('copying a bar copies the notes, not a link to them', () => {
  const p = newPiece({ id: 'a', meter: '4/4', bars: 3 });
  p.rh[0] = [{ m: 60, d: 2 }, { m: 62, d: 2 }];
  p.lh[0] = [{ m: 48, d: 4 }];
  p.chords[0] = 'C';
  copyBar(p, 0, 1);
  p.rh[1][0].m = 64;
  assert.equal(p.rh[0][0].m, 60);
  assert.deepEqual(p.lh[1], [{ m: 48, d: 4 }]);
  assert.equal(p.chords[1], 'C');
});

test('storage: a damaged piece is repaired or refused', () => {
  assert.equal(cleanPiece(null), null);
  assert.equal(cleanPiece({ id: 'x', pulses: 7, group: 3 }), null); // 7/8 isn't offered
  const bad = cleanPiece({ id: 'x', pulses: 6, group: 3, bars: 2, rh: [[{ m: 70, d: 3 }, { m: 999, d: 1 }, { m: 72, d: 9 }], 'junk'], lh: [[{ m: 46, d: 6 }]], chords: ['Bb', 5, 'x'.repeat(40)], bpm: 'fast' });
  assert.deepEqual(bad.rh, [[{ m: 70, d: 3 }], []]);
  assert.deepEqual(bad.lh, [[{ m: 46, d: 6 }], []]);
  assert.equal(bad.bpm, 80);
  assert.deepEqual(bad.chords, ['Bb', '5']);
  const none = cleanPiece({ id: 'y', pulses: 4, group: 1, bars: 3 });
  assert.equal(none.rh.length, 3);
  assert.equal(pieceIsEmpty(none), true);
});

test('a piece plays only what was entered: no chord style underneath', () => {
  const p = newPiece({ id: 'a', meter: '6/8', bars: 2 });
  p.rh[0] = [{ m: 70, d: 3 }, { m: 72, d: 3 }];
  const bars = pieceBars(p);
  const feel = pieceFeel(p);
  assert.deepEqual(barEvents(bars[0].plan, feel, bars[0].tune, bars[0].bass).map(e => [e.hand, e.pulse, e.notes[0]]), [['rh', 0, 70], ['rh', 3, 72]]);
  assert.deepEqual(barEvents(bars[1].plan, feel, bars[1].tune, bars[1].bass), []); // an empty bar is silent
  const tl = buildTimeline(bars, feel, 69);
  assert.equal(tl.total, 12);
  assert.equal(tl.notes.length, 2);
});

test('the grid can be finer than one count', () => {
  const bar = [{ m: 60, d: 0.5 }, { m: 62, d: 0.5 }, { m: 64, d: 1 }, { m: 0, d: 2 }];
  assert.equal(barToGrid(bar, 4, 1), null); // half counts don't fit a one-column-per-count grid
  const cells = barToGrid(bar, 4, 2);
  assert.deepEqual(cells, [60, 62, 64, null, 0, null, null, null]); // 64 lasts one count (two cells), then a rest
  assert.deepEqual(gridToBar(cells, 2), [{ m: 60, d: 0.5 }, { m: 62, d: 0.5 }, { m: 64, d: 1 }]);
  assert.deepEqual(gridToBar([null, null, 65, null], 2), [{ m: 0, d: 1 }, { m: 65, d: 1 }]);
  assert.deepEqual(barToGrid([{ m: 60, d: 1 }], 4, 2), [60, null, 0, null, null, null, null, null]);
});

import { changeMeter } from '../js/piece.js';

test('changing the time signature: free when empty, only when the music keeps its meaning otherwise', () => {
  const p = newPiece({ id: 'a', meter: '4/4', bars: 2 });
  assert.deepEqual(changeMeter(p, '6/8'), { ok: true }); // empty: anything goes
  assert.deepEqual([p.pulses, p.group, p.sub], [6, 3, 1]);
  assert.equal(changeMeter(p, '5/8').ok, false);
  p.rh[0] = [{ m: 60, d: 4 }];
  assert.equal(changeMeter(p, '4/4').ok, false); // a count is an eighth in 6/8 but a quarter in 4/4
  assert.match(changeMeter(p, '4/4').message, /new piece/);
  assert.equal(changeMeter(p, '3/8').ok, false); // the 4-count note doesn't fit in 3 counts
  assert.match(changeMeter(p, '3/8').message, /doesn’t fit/);
  assert.equal(changeMeter(p, '9/8').ok, true);
  assert.equal(p.pulses, 9);
  assert.equal(p.rh[0][0].d, 4);
});

test('6/4: six counts of quarter notes, with half counts for the "&" in between', () => {
  const p = newPiece({ id: 'a', meter: '6/4', bars: 2 });
  assert.deepEqual([p.pulses, p.group, p.sub], [6, 1, 2]); // 12 steps in a bar: 1 & 2 & 3 & 4 & 5 & 6 &
  const four = newPiece({ id: 'c', meter: '4/4', bars: 1 });
  four.rh[0] = [{ m: 60, d: 4 }];
  assert.equal(changeMeter(four, '6/4').ok, true); // counted the same way (quarter notes), and the note still fits
});

test('a chord on one count: grid, events and falling notes keep every key', () => {
  const bar = [{ m: 60, d: 2, with: [64, 67] }, { m: 72, d: 2 }];
  assert.equal(barToGrid(bar, 4), null);
  const cells = barToGrid(bar, 4, 1, { chords: true });
  assert.deepEqual(cells[0], [60, 64, 67]);
  assert.deepEqual(gridToBar(cells), bar);
  const feel = { bpm: 60, pulses: 4, group: 1, hits: [] };
  const ev = barEvents(null, feel, bar);
  assert.deepEqual(ev.find(e => e.tune)?.notes, [60, 64, 67]);
});

test('a tie holds a note over the bar line: struck once, one long note, never struck again', async () => {
  const { markTies, sliceBars, carryTie } = await import('../js/piece.js');
  const p = newPiece({ id: 't', meter: '4/4', bars: 3 });
  p.rh[0] = [{ m: 0, d: 0.5 }, { m: 71, d: 2 }, { m: 70, d: 1.5, tie: true }];
  p.rh[1] = [{ m: 70, d: 0.5 }, { m: 63, d: 3.5 }];
  const marked = markTies(p.rh, 4);
  assert.equal(marked[0][2].hold, 0.5);
  assert.equal(marked[1][0].tieIn, true);
  assert.equal(p.rh[1][0].tieIn, undefined); // the piece itself is not changed
  const bars = pieceBars(p);
  const first = barEvents(null, pieceFeel(p), bars[0].tune);
  const second = barEvents(null, pieceFeel(p), bars[1].tune);
  assert.equal(first.at(-1).len, (1.5 + 0.5) * 0.96); // one note that lasts through both bars
  assert.deepEqual(second.map(e => e.notes[0]), [63]); // the tied note is not struck again
  // playing from bar 2 on its own strikes the tied note
  const alone = sliceBars(bars, 1, 1);
  assert.deepEqual(barEvents(null, pieceFeel(p), alone[0].tune).map(e => e.notes[0]), [70, 63]);
  // the line in the falling notes: one block that spans the bar line
  const falling = buildTimeline(bars.slice(0, 2), pieceFeel(p), 100, 1).notes.filter(n => n.midi === 70);
  assert.equal(falling.length, 1);
  // a tie that doesn't line up is dropped: different keys, a note that stops short of the bar line, or no next bar
  p.rh[1][0].m = 72;
  assert.equal(markTies(p.rh, 4)[0][2].tie, undefined);
  p.rh[1][0].m = 70;
  p.rh[0][2].d = 1;
  assert.equal(markTies(p.rh, 4)[1][0].tieIn, undefined);
  p.rh[0][2].d = 1.5;
  assert.equal(markTies([[{ m: 60, d: 4, tie: true }]], 4)[0][0].tie, undefined);
  // editing the bar on the grid keeps the tie on the same last note
  const after = gridToBar(barToGrid(p.rh[0], 4, 2), 2);
  carryTie(p.rh[0], after);
  assert.equal(after.at(-1).tie, true);
});

test('a tie survives saving and a chord can be tied', () => {
  const p = newPiece({ id: 't', meter: '4/4', bars: 2 });
  p.lh[0] = [{ m: 52, d: 4, with: [56, 59], tie: true }];
  p.lh[1] = [{ m: 52, d: 4, with: [56, 59] }];
  const back = cleanPiece(JSON.parse(JSON.stringify(p)));
  assert.equal(back.lh[0][0].tie, true);
  assert.equal(pieceBars(back)[0].bass[0].hold, 4);
});
