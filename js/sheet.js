// Draws one chord on a grand staff (treble clef for the right hand, bass clef for the left hand).
// Left hand: three quarter notes (root → 5th → octave). Right hand: the chord as a dotted half note in 3/4.

import { h } from './dom.js';
import { noteLabeler } from './theory.js';

const NS = 'http://www.w3.org/2000/svg';
const LETTER_IDX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

// Everything is measured in "steps": one step = one line or space on the staff. Middle C (C4) is step 28.
const W = 250;
const STEP = 4;
const TOP = 44;
const MARGIN = 36;
const X0 = 38; // the strip to the left of this holds the line and space letters
const X1 = W - 12;
const NOTE_X = [128, 172, 216];
const y = step => MARGIN + (TOP - step) * STEP;

const TREBLE = { lines: [30, 32, 34, 36, 38], low: 28, high: 40 };
const BASS = { lines: [18, 20, 22, 24, 26], low: 16, high: 28 };

/** Staff step of a note spelled `name` (like "Bb" or "E#") at MIDI pitch `midi`. C4 = 28. */
export function stepOf(name, midi) {
  const shift = name.slice(1).includes('#') ? 1 : name.slice(1).includes('b') ? -1 : 0;
  return (Math.floor((midi - shift) / 12) - 1) * 7 + LETTER_IDX[name[0]];
}

/** The note letter written on a staff step (a line or a space): step 30 → E, 28 → C (middle C). */
export const stepLetter = step => 'CDEFGAB'[((step % 7) + 7) % 7];

/**
 * Stem direction and note-head offsets for a stacked chord. Notes a step apart can't share a column,
 * so one of them moves to the other side of the stem (dx = ±1).
 */
export function chordLayout(steps) {
  const sorted = [...steps].sort((a, b) => a - b);
  const up = (sorted[0] + sorted.at(-1)) / 2 < 34;
  const order = up ? sorted : [...sorted].reverse();
  const notes = [];
  for (const step of order) {
    const prev = notes.at(-1);
    const touching = prev && Math.abs(prev.step - step) === 1 && prev.dx === 0;
    notes.push({ step, dx: touching ? (up ? 1 : -1) : 0 });
  }
  return { up, notes };
}

/** Even steps that need a short extra line (a ledger line) for a note outside its staff. */
export function ledgerSteps(step, staff) {
  const out = [];
  if (step <= staff.low) for (let s = staff.low; s >= step; s -= 2) out.push(s);
  if (step >= staff.high) for (let s = staff.high; s <= step; s += 2) out.push(s);
  return out;
}

function el(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}

const accidentalOf = name => (name.slice(1).includes('#') ? '♯' : name.slice(1).includes('b') ? '♭' : '');

function addLedgers(svg, step, staff, cx) {
  for (const s of ledgerSteps(step, staff)) {
    svg.append(el('line', { x1: cx - 10, x2: cx + 10, y1: y(s), y2: y(s), class: 'ledger' }));
  }
}

function head(svg, cx, step, color, open) {
  svg.append(el('ellipse', {
    cx, cy: y(step), rx: 5.5, ry: 3.9, transform: `rotate(-20 ${cx} ${y(step)})`,
    class: open ? 'head open' : 'head',
    style: open ? `stroke:${color}` : `fill:${color}`,
  }));
}

function accidental(svg, x, step, name, color) {
  const sign = accidentalOf(name);
  if (sign) svg.append(el('text', { x, y: y(step) + (sign === '♯' ? 6 : 5), class: 'acc', style: `fill:${color}` }, sign));
}

/** The staff, clefs and time signature. Notes are added only when `lh`/`rh` are given. */
export function sheetSVG({ chord, lh = [], rh = [], guide = true }) {
  const reveal = lh.length + rh.length > 0;
  const label = noteLabeler(chord);
  const svg = el('svg', { viewBox: `0 0 ${W} ${y(12) + 14}`, class: 'sheet', role: 'img' });
  svg.setAttribute('aria-label', reveal
    ? `Sheet music for ${chord.symbol}: left hand ${lh.map(label).join(' ')}, right hand ${rh.map(label).join(' ')}`
    : `Empty sheet music for ${chord.symbol}`);

  svg.append(el('text', { x: NOTE_X[0] - 6, y: 28, class: 'chord-symbol' }, chord.symbol));

  for (const staff of [TREBLE, BASS]) {
    for (const s of staff.lines) svg.append(el('line', { x1: X0, x2: X1, y1: y(s), y2: y(s), class: 'line' }));
  }
  // Guide: the letter of every line (next to the staff) and space (one column further left).
  // Letters your chord uses are coloured like the hand that plays them.
  if (guide) {
    const used = new Map();
    lh.forEach(m => used.set(stepOf(label(m), m), 'var(--lh)'));
    rh.forEach(m => used.set(stepOf(label(m), m), 'var(--rh)'));
    const steps = new Set([...TREBLE.lines, ...BASS.lines, 31, 33, 35, 37, 19, 21, 23, 25, 28, ...used.keys()]);
    for (const step of steps) {
      const color = used.get(step);
      svg.append(el('text', {
        x: X0 - (step % 2 === 0 ? 5 : 17),
        y: y(step) + 3.4,
        class: `gl${step % 2 === 0 ? '' : ' space'}${color ? ' used' : ''}`,
        ...(color ? { style: `fill:${color}` } : {}),
      }, stepLetter(step)));
    }
  }

  svg.append(el('line', { x1: X0, x2: X0, y1: y(38), y2: y(18), class: 'bar thick' }));
  svg.append(el('line', { x1: X1 - 5, x2: X1 - 5, y1: y(38), y2: y(18), class: 'bar' }));
  svg.append(el('line', { x1: X1, x2: X1, y1: y(38), y2: y(18), class: 'bar thick' }));

  svg.append(el('text', { x: X0 + 2, y: y(28) + 1, class: 'clef treble' }, '𝄞'));
  svg.append(el('text', { x: X0 + 2, y: y(20) + 2, class: 'clef bass' }, '𝄢'));
  for (const [hi, lo] of [[36, 32], [24, 20]]) {
    svg.append(el('text', { x: X0 + 46, y: y(hi) + 7, class: 'time' }, '3'));
    svg.append(el('text', { x: X0 + 46, y: y(lo) + 7, class: 'time' }, '4'));
  }

  if (!reveal) return svg;

  const blue = 'var(--lh)';
  const orange = 'var(--rh)';

  lh.slice(0, NOTE_X.length).forEach((midi, i) => {
    const name = label(midi);
    const step = stepOf(name, midi);
    const cx = NOTE_X[i];
    const up = step < 22;
    addLedgers(svg, step, BASS, cx);
    accidental(svg, cx - 10, step, name, blue);
    head(svg, cx, step, blue, false);
    const x = up ? cx + 5.4 : cx - 5.4;
    svg.append(el('line', { x1: x, x2: x, y1: y(step), y2: y(step) + (up ? -7 : 7) * STEP, class: 'stem', style: `stroke:${blue}` }));
  });

  if (rh.length) {
    const cx = NOTE_X[0];
    const named = rh.map(midi => ({ midi, name: label(midi), step: stepOf(label(midi), midi) }));
    const layout = chordLayout(named.map(n => n.step));
    const byStep = new Map(named.map(n => [n.step, n]));
    const steps = layout.notes.map(n => n.step);
    const lo = Math.min(...steps);
    const hi = Math.max(...steps);
    const hasLeft = layout.notes.some(n => n.dx < 0);
    const hasRight = layout.notes.some(n => n.dx > 0);

    for (const n of layout.notes) {
      addLedgers(svg, n.step, TREBLE, cx + n.dx * 11);
      head(svg, cx + n.dx * 11, n.step, orange, true);
    }
    const stemX = layout.up ? cx + 5.4 : cx - 5.4;
    svg.append(layout.up
      ? el('line', { x1: stemX, x2: stemX, y1: y(lo), y2: y(hi) - 7 * STEP, class: 'stem', style: `stroke:${orange}` })
      : el('line', { x1: stemX, x2: stemX, y1: y(hi), y2: y(lo) + 7 * STEP, class: 'stem', style: `stroke:${orange}` }));

    // The dot sits in the space above a line note.
    for (const n of layout.notes) {
      svg.append(el('circle', { cx: cx + (hasRight ? 22 : 12), cy: y(n.step + (n.step % 2 === 0 ? 1 : 0)), r: 1.9, style: `fill:${orange}` }));
    }

    // Accidentals go to the left of the chord, staggered when notes are close together.
    const placed = [];
    for (const n of [...layout.notes].sort((a, b) => b.step - a.step)) {
      const name = byStep.get(n.step).name;
      if (!accidentalOf(name)) continue;
      let col = 0;
      while (placed.some(p => p.col === col && Math.abs(p.step - n.step) < 6)) col++;
      placed.push({ step: n.step, col });
      accidental(svg, cx - (hasLeft ? 21 : 10) - col * 10, n.step, name, orange);
    }
  }
  return svg;
}

/** The sheet with a small legend underneath. */
export function sheetElement(opts) {
  return h('figure', { class: 'sheet-fig' },
    sheetSVG(opts),
    h('figcaption', {},
      h('span', { class: 'dot lh' }), 'Left hand · bass clef',
      h('span', { class: 'dot rh' }), 'Right hand · treble clef'),
    opts.guide !== false && h('p', { class: 'sheet-guide' },
      'The letters on the left name each line and space. ',
      h('b', {}, 'Lines'), ' (next to the staff): treble E G B D F, bass G B D F A. ',
      h('b', {}, 'Spaces'), ': treble F A C E, bass A C E G. Coloured letters are the ones your chord uses; the C between the two staves is middle C.'));
}
