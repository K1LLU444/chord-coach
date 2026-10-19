// Draws one chord on a grand staff (treble clef for the right hand, bass clef for the left hand).
// Each hand is either a stacked chord (played together) or a row of quarter notes (played one after another),
// following the playing style. The time signature counts the notes of whichever hand plays one at a time.

import { h } from './dom.js';
import { noteLabeler } from './theory.js';
import { signatureOf } from './rhythm.js';

const NS = 'http://www.w3.org/2000/svg';
const LETTER_IDX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

// Everything is measured in "steps": one step = one line or space on the staff. Middle C (C4) is step 28.
const W = 250;
const STEP = 4;
const TOP = 44;
const MARGIN = 36;
const X0 = 38; // the strip to the left of this holds the line and space letters
const X1 = W - 12;
const FIRST_X = 134; // far enough right that a chord's flats and sharps clear the time signature
const y = step => MARGIN + (TOP - step) * STEP;

const TREBLE = { lines: [30, 32, 34, 36, 38], low: 28, high: 40, mid: 34 };
const BASS = { lines: [18, 20, 22, 24, 26], low: 16, high: 28, mid: 22 };

/** Staff step of a note spelled `name` (like "Bb" or "E#") at MIDI pitch `midi`. C4 = 28. */
export function stepOf(name, midi) {
  const shift = name.slice(1).includes('#') ? 1 : name.slice(1).includes('b') ? -1 : 0;
  return (Math.floor((midi - shift) / 12) - 1) * 7 + LETTER_IDX[name[0]];
}

/** The note letter written on a staff step (a line or a space): step 30 → E, 28 → C (middle C). */
export const stepLetter = step => 'CDEFGAB'[((step % 7) + 7) % 7];

/**
 * Stem direction and note-head offsets for a stacked chord. `mid` is the staff's middle line: chords
 * mostly below it get a stem going up. Notes a step apart can't share a column, so one of them moves to
 * the other side of the stem (dx = ±1).
 */
export function chordLayout(steps, mid = 34) {
  const sorted = [...steps].sort((a, b) => a - b);
  const up = (sorted[0] + sorted.at(-1)) / 2 < mid;
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

const named = (notes, label) => notes.map(midi => ({ midi, name: label(midi), step: stepOf(label(midi), midi) }));

/** Notes played one after another: quarter notes with stems. */
function drawSequence(svg, notes, staff, color, label, beats) {
  const gap = beats <= 3 ? 42 : beats === 4 ? 28 : 22;
  named(notes, label).forEach(({ name, step }, i) => {
    const cx = FIRST_X + i * gap;
    const up = step < staff.mid;
    addLedgers(svg, step, staff, cx);
    accidental(svg, cx - 10, step, name, color);
    head(svg, cx, step, color, false);
    const x = up ? cx + 5.4 : cx - 5.4;
    svg.append(el('line', { x1: x, x2: x, y1: y(step), y2: y(step) + (up ? -7 : 7) * STEP, class: 'stem', style: `stroke:${color}` }));
  });
}

/** Notes played together: one stacked chord lasting the whole bar (dotted half in 3/4, half in 2/4, whole in 4/4). */
function drawChord(svg, notes, staff, color, label, beats) {
  const cx = FIRST_X;
  const items = named(notes, label);
  const byStep = new Map(items.map(n => [n.step, n]));
  const layout = chordLayout(items.map(n => n.step), staff.mid);
  const steps = layout.notes.map(n => n.step);
  const lo = Math.min(...steps);
  const hi = Math.max(...steps);
  const hasLeft = layout.notes.some(n => n.dx < 0);
  const hasRight = layout.notes.some(n => n.dx > 0);

  for (const n of layout.notes) {
    addLedgers(svg, n.step, staff, cx + n.dx * 11);
    head(svg, cx + n.dx * 11, n.step, color, true);
  }
  if (beats < 4) {
    const stemX = layout.up ? cx + 5.4 : cx - 5.4;
    svg.append(el('line', {
      x1: stemX, x2: stemX,
      y1: y(layout.up ? lo : hi), y2: layout.up ? y(hi) - 7 * STEP : y(lo) + 7 * STEP,
      class: 'stem', style: `stroke:${color}`,
    }));
  }
  if (beats === 3) {
    // The dot sits in the space above a line note.
    for (const n of layout.notes) {
      svg.append(el('circle', { cx: cx + (hasRight ? 22 : 12), cy: y(n.step + (n.step % 2 === 0 ? 1 : 0)), r: 1.9, style: `fill:${color}` }));
    }
  }

  // Accidentals go to the left of the chord, staggered when notes are close together.
  const placed = [];
  for (const n of [...layout.notes].sort((a, b) => b.step - a.step)) {
    const name = byStep.get(n.step).name;
    if (!accidentalOf(name)) continue;
    let col = 0;
    while (placed.some(p => p.col === col && Math.abs(p.step - n.step) < 6)) col++;
    placed.push({ step: n.step, col });
    accidental(svg, cx - (hasLeft ? 21 : 10) - col * 10, n.step, name, color);
  }
}

/**
 * Strum style: the right-hand chord is struck on every count (beamed in groups, accents marked),
 * and the left hand plays its bass note on count 1 and the 5th in the middle of the bar.
 */
function drawStrum(svg, plan, label) {
  const { feel } = plan;
  const left = 120;
  const right = X1 - 14;
  const gap = feel.pulses > 1 ? (right - left) / (feel.pulses - 1) : 0;
  const x = pulse => left + pulse * gap;
  const half = Math.floor(feel.pulses / 2);
  const blue = 'var(--lh)';
  const orange = 'var(--rh)';

  // Left hand: single notes with stems.
  plan.lh.notes.forEach((midi, i) => {
    const name = label(midi);
    const step = stepOf(name, midi);
    const cx = x(i === 0 ? 0 : half);
    const up = step < BASS.mid;
    addLedgers(svg, step, BASS, cx);
    accidental(svg, cx - 10, step, name, blue); // each bass note is on its own line or space, so each gets its own sign
    head(svg, cx, step, blue, false);
    const sx = up ? cx + 5.4 : cx - 5.4;
    svg.append(el('line', { x1: sx, x2: sx, y1: y(step), y2: y(step) + (up ? -7 : 7) * STEP, class: 'stem', style: `stroke:${blue}` }));
  });

  // Right hand: the same chord on every count that isn't a rest.
  const items = named(plan.rh.notes, label);
  const layout = chordLayout(items.map(n => n.step), TREBLE.mid);
  const steps = layout.notes.map(n => n.step);
  const lo = Math.min(...steps);
  const hi = Math.max(...steps);
  const tipY = layout.up ? y(hi) - 7 * STEP : y(lo) + 7 * STEP;
  const stemDx = layout.up ? 5.4 : -5.4;
  const played = feel.hits.map((hit, i) => (hit.rest ? null : i)).filter(i => i !== null);

  played.forEach((pulse, order) => {
    const cx = x(pulse);
    for (const n of layout.notes) {
      addLedgers(svg, n.step, TREBLE, cx + n.dx * 11);
      head(svg, cx + n.dx * 11, n.step, orange, false);
    }
    svg.append(el('line', { x1: cx + stemDx, x2: cx + stemDx, y1: y(layout.up ? lo : hi), y2: tipY, class: 'stem', style: `stroke:${orange}` }));
    if (feel.hits[pulse].accent) {
      // The accent sits on the note-head side of the chord, away from the stem and the beam.
      svg.append(el('text', { x: cx, y: layout.up ? y(lo) + 13 : y(hi) - 7, class: 'accent', style: `fill:${orange}` }, '>'));
    }
    if (order === 0) {
      // Accidentals are written once at the start of the bar.
      const placed = [];
      const hasLeft = layout.notes.some(n => n.dx < 0);
      for (const n of [...layout.notes].sort((a, b) => b.step - a.step)) {
        const name = items.find(item => item.step === n.step).name;
        if (!accidentalOf(name)) continue;
        let col = 0;
        while (placed.some(p => p.col === col && Math.abs(p.step - n.step) < 6)) col++;
        placed.push({ step: n.step, col });
        accidental(svg, cx - (hasLeft ? 21 : 10) - col * 10, n.step, name, orange);
      }
    }
  });

  // Beams join the stems of each group of counts (not needed for plain quarter-note counts).
  if (feel.group > 1) {
    for (let start = 0; start < feel.pulses; start += feel.group) {
      const group = played.filter(p => p >= start && p < start + feel.group);
      if (group.length > 1) {
        svg.append(el('line', {
          x1: x(group[0]) + stemDx, x2: x(group.at(-1)) + stemDx, y1: tipY, y2: tipY,
          class: 'beam', style: `stroke:${orange}`,
        }));
      }
    }
  }
}

/**
 * The staff, clefs, time signature and letter guide. Notes are added when a `plan` (from handPlan) is given:
 * plan = { lh: { notes, together }, rh: { notes, together } }.
 */
export function sheetSVG({ chord, plan, guide = true, compact = false }) {
  const reveal = Boolean(plan);
  const label = noteLabeler(chord);
  const hands = reveal
    ? [
      { hand: plan.lh, staff: BASS, color: 'var(--lh)' },
      { hand: plan.rh, staff: TREBLE, color: 'var(--rh)' },
    ]
    : [];
  const sequence = hands.find(({ hand }) => !hand.together);
  const beats = sequence ? sequence.hand.notes.length : 3;
  const strum = reveal && plan.style === 'strum';
  const [sigTop, sigBottom] = strum ? signatureOf(plan.feel) : [beats, 4];

  // compact: no letter guide and no empty strip on the left, for many small sheets on one page.
  const svg = el('svg', {
    viewBox: compact ? `${X0 - 10} 0 ${W - X0 + 10} ${y(12) + 14}` : `0 0 ${W} ${y(12) + 14}`,
    class: compact ? 'sheet compact' : 'sheet',
    role: 'img',
  });
  svg.setAttribute('aria-label', reveal
    ? `Sheet music for ${chord.symbol}: left hand ${plan.lh.notes.map(label).join(' ')}, right hand ${plan.rh.notes.map(label).join(' ')}`
    : `Empty sheet music for ${chord.symbol}`);

  svg.append(el('text', { x: FIRST_X - 6, y: 28, class: 'chord-symbol' }, chord.symbol));

  for (const staff of [TREBLE, BASS]) {
    for (const s of staff.lines) svg.append(el('line', { x1: X0, x2: X1, y1: y(s), y2: y(s), class: 'line' }));
  }

  // Guide: the letter of every line (next to the staff) and space (one column further left).
  // Letters your chord uses are coloured like the hand that plays them.
  if (guide && !compact) {
    const used = new Map();
    for (const { hand, color } of hands) for (const m of hand.notes) used.set(stepOf(label(m), m), { color, name: label(m) });
    const steps = new Set([...TREBLE.lines, ...BASS.lines, 31, 33, 35, 37, 19, 21, 23, 25, 28, ...used.keys()]);
    for (const step of steps) {
      const note = used.get(step);
      // A coloured label names the exact note, so a flat or sharp on the note shows here too (A♭, not A).
      svg.append(el('text', {
        x: X0 - (step % 2 === 0 ? 5 : 17),
        y: y(step) + 3.4,
        class: `gl${step % 2 === 0 ? '' : ' space'}${note ? ' used' : ''}`,
        ...(note ? { style: `fill:${note.color}` } : {}),
      }, note ? note.name[0] + accidentalOf(note.name) : stepLetter(step)));
    }
  }

  svg.append(el('line', { x1: X0, x2: X0, y1: y(38), y2: y(18), class: 'bar thick' }));
  svg.append(el('line', { x1: X1 - 5, x2: X1 - 5, y1: y(38), y2: y(18), class: 'bar' }));
  svg.append(el('line', { x1: X1, x2: X1, y1: y(38), y2: y(18), class: 'bar thick' }));

  svg.append(el('text', { x: X0 + 2, y: y(28) + 1, class: 'clef treble' }, '𝄞'));
  svg.append(el('text', { x: X0 + 2, y: y(20) + 2, class: 'clef bass' }, '𝄢'));
  for (const [hi, lo] of [[36, 32], [24, 20]]) {
    svg.append(el('text', { x: X0 + 46, y: y(hi) + 7, class: 'time' }, String(sigTop)));
    svg.append(el('text', { x: X0 + 46, y: y(lo) + 7, class: 'time' }, String(sigBottom)));
  }

  if (strum) {
    drawStrum(svg, plan, label);
    return svg;
  }
  for (const { hand, staff, color } of hands) {
    if (!hand.notes.length) continue;
    (hand.together ? drawChord : drawSequence)(svg, hand.notes, staff, color, label, beats);
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
      h('b', {}, 'Spaces'), ': treble F A C E, bass A C E G. Coloured labels are the exact notes your chord uses (a ♭ or ♯ changes the letter: A♭ is A flat); the C between the two staves is middle C.'));
}
