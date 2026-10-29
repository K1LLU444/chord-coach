// A printable "easy piano" page: the tune on the treble staff, one held bass note per bar on the bass staff,
// chord names above, bars in lines of four. The tune is the player's own (typed in on the Tune screen).
// noteShape, beamGroups and layoutPage are plain logic (tested); tuneSheetSVG draws.

import { noteName } from './theory.js';
import { stepOf, stepLetter, ledgerSteps, chordLayout } from './sheet.js';

const NS = 'http://www.w3.org/2000/svg';
const STEP = 5;
const TREBLE = { low: 28, high: 40, mid: 34 };
const BASS = { low: 16, high: 28, mid: 22 };
const yAtStep = step => 46 + (38 - step) * STEP; // treble top line (step 38) at y = 46
const yOf = yAtStep;
const SYSTEM_H = 182;
const WIDTH = 580; // a narrower drawing area than the page, so everything is drawn larger
export const BARS_PER_LINE = 4;

// Key signatures: how many flats or sharps, for the major and minor keys.
const MAJOR_SIG = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
const MINOR_SIG = { A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6, Ab: -7 };
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
// where each sign sits on the staff (a step: 28 = middle C), for the treble and the bass clef
const SIG_STEPS = {
  treble: { flat: { B: 34, E: 37, A: 33, D: 36, G: 32, C: 35, F: 31 }, sharp: { F: 38, C: 35, G: 39, D: 36, A: 33, E: 37, B: 34 } },
  bass: { flat: { B: 20, E: 23, A: 19, D: 22, G: 18, C: 21, F: 24 }, sharp: { F: 24, C: 21, G: 25, D: 22, A: 19, E: 23, B: 20 } },
};

/**
 * The key signature of a key written like "Bb", "F#" or "Gm": { kind: 'flat' | 'sharp' | null, letters: ['B', 'E'], alters: { B: -1, E: -1 } }.
 * An unknown or empty key has no signature.
 */
export function keySignature(keyText) {
  const text = String(keyText ?? '').trim().replace('♭', 'b').replace('♯', '#');
  const m = text.match(/^([A-G][b#]?)(m|min|minor)?$/);
  const none = { kind: null, letters: [], alters: {} };
  if (!m) return none;
  const count = (m[2] ? MINOR_SIG : MAJOR_SIG)[m[1]];
  if (count === undefined || count === 0) return none;
  const kind = count < 0 ? 'flat' : 'sharp';
  const letters = (kind === 'flat' ? FLAT_ORDER : SHARP_ORDER).slice(0, Math.abs(count));
  return { kind, letters, alters: Object.fromEntries(letters.map(l => [l, kind === 'flat' ? -1 : 1])) };
}

/** Where each accidental of a key signature is drawn: [{ letter, step }] for a clef ('treble' or 'bass'). */
export const signaturePositions = (sig, clef) => sig.letters.map(letter => ({ letter, step: SIG_STEPS[clef][sig.kind][letter] }));
export const LINES_PER_PAGE = 4;
export const FIRST_PAGE_LINES = 3; // the first page also holds the title, the facts and the notes on reading it

const accidentalOf = name => (name.slice(1).includes('#') ? '♯' : name.slice(1).includes('b') ? '♭' : '');

/** How much of a whole note one pulse is: 1/4 when pulses are quarter notes, 1/8 in 6/8 or 2/4 counted in eighths, 1/16. */
export const pulseFraction = feel => (feel.group === 1 ? 1 / 4 : feel.group === 4 ? 1 / 16 : 1 / 8);

const SHAPES = [
  [1, 'whole', 0], [3 / 4, 'half', 1], [1 / 2, 'half', 0], [3 / 8, 'quarter', 1],
  [1 / 4, 'quarter', 0], [3 / 16, 'eighth', 1], [1 / 8, 'eighth', 0], [3 / 32, 'sixteenth', 1], [1 / 16, 'sixteenth', 0],
];

/** What a note of `d` pulses looks like: { kind: 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth', dots: 0 | 1 }. Odd lengths use the closest shape below. */
export function noteShape(d, feel) {
  const fraction = d * pulseFraction(feel);
  const found = SHAPES.find(([f]) => Math.abs(f - fraction) < 1e-9) ?? SHAPES.find(([f]) => f < fraction) ?? SHAPES.at(-1);
  return { kind: found[1], dots: found[2] };
}

/**
 * A length that is not one note shape (like 5 counts in 6/8) as the notes it is made of, longest first: 5 → [4, 1].
 * The sheet draws them tied together.
 */
export function splitLength(d, feel) {
  const sizes = SHAPES.map(([fraction]) => fraction / pulseFraction(feel)).filter(x => x >= 0.5 && x <= feel.pulses).sort((a, b) => b - a);
  const parts = [];
  let left = d;
  while (left > 1e-9) {
    const part = sizes.find(x => x <= left + 1e-9);
    if (!part) break;
    parts.push(part);
    left -= part;
  }
  return parts.length ? parts : [d];
}

/**
 * Which notes of a bar are joined by a beam: runs of neighbouring notes shorter than a quarter, inside the same
 * main beat (a group of `feel.group` pulses), with no gap between them. Returns arrays of indexes into `bar`.
 */
export function beamGroups(bar, feel) {
  const groups = [];
  let at = 0;
  let current = null;
  bar.forEach((n, i) => {
    const start = at;
    at += n.d;
    const kind = n.m && !n.with?.length ? noteShape(n.d, feel).kind : null; // a chord is never beamed
    const short = kind === 'eighth' || kind === 'sixteenth';
    const beat = Math.floor(start / feel.group + 1e-9);
    if (short && current && current.beat === beat && current.end === start) {
      current.items.push(i);
      current.end = at;
    } else {
      current = short ? { beat, end: at, items: [i] } : null;
      if (current) groups.push(current);
    }
  });
  return groups.map(g => g.items).filter(items => items.length > 1);
}

/** Split the bars of a tune into pages of LINES_PER_PAGE lines of BARS_PER_LINE bars: [[{ index, bars: [...] }]]. */
export function layoutPage(barCount, perLine = BARS_PER_LINE) {
  const lines = [];
  for (let i = 0; i < barCount; i += perLine) lines.push(Array.from({ length: Math.min(perLine, barCount - i) }, (_, k) => i + k));
  const pages = [];
  let at = 0;
  while (at < lines.length) {
    const take = pages.length === 0 ? FIRST_PAGE_LINES : LINES_PER_PAGE;
    pages.push(lines.slice(at, at + take));
    at += take;
  }
  return pages;
}

function el(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}

/** A rest drawn from lines (the music fonts on some devices have no rest symbols). x is the centre of the rest. */
function drawRest(g, kind, x, dots, color, shift = 0) {
  const yOf = step => yAtStep(step + shift);
  const style = `stroke:${color}; fill:none; stroke-width:2.6; stroke-linecap:round; stroke-linejoin:round`;
  if (kind === 'whole') {
    g.append(el('rect', { x: x - 8, y: yOf(36), width: 16, height: 5.5, style: `fill:${color}` })); // hangs from the 4th line
  } else if (kind === 'half') {
    g.append(el('rect', { x: x - 8, y: yOf(34) - 5.5, width: 16, height: 5.5, style: `fill:${color}` })); // sits on the middle line
    if (dots) g.append(el('circle', { cx: x + 14, cy: yOf(35), r: 2, style: `fill:${color}` }));
  } else if (kind === 'quarter') {
    const t = yOf(37);
    g.append(el('path', { d: `M${x + 3} ${t} L${x - 4} ${t + 9} L${x + 4} ${t + 18} L${x - 3} ${t + 27} q-6 -2 -6 5`, style }));
    if (dots) g.append(el('circle', { cx: x + 11, cy: yOf(35), r: 2, style: `fill:${color}` }));
  } else {
    const t = yOf(35);
    g.append(el('circle', { cx: x - 3, cy: t, r: 3, style: `fill:${color}` }));
    g.append(el('path', { d: `M${x + 5} ${t - 3} L${x - 2} ${t + 18}`, style }));
    if (dots) g.append(el('circle', { cx: x + 12, cy: yOf(35), r: 2, style: `fill:${color}` }));
  }
}

/** One hand's notes in one bar: heads, accidentals, stems, flags, beams, dots and rests. */
function drawLane(g, { notes, staff, color, xAt, x0, barW, restShift, feel, flats, noteNames, sig = { alters: {} }, everySign = false, barEnd, fingerList = null }) {
  const pulses = feel.pulses;
  const current = new Map(); // letter+octave → the alteration (−1, 0, +1) in force so far in this bar; the key signature sets the start
  const alterNow = (letter, octave) => current.get(`${letter}${octave}`) ?? sig.alters[letter] ?? 0;
  // A length that is not one note shape is drawn as several notes joined by ties (rests as several rests).
  const parts = [];
  notes.forEach((n, oi) => {
    const split = splitLength(n.d, feel);
    split.forEach((d, k) => parts.push({ m: n.m, with: n.with, d, tied: n.m && k < split.length - 1, tieOut: Boolean(n.tie) && k === split.length - 1, tieIn: Boolean(n.tieIn) && k === 0, finger: k === 0 && fingerList ? fingerList[oi] || 0 : 0 }));
  });
  notes = parts;
  const placed = [];
  let at = 0;
  for (const n of notes) {
    placed.push({ n, x: xAt(at), start: at });
    at += n.d;
  }
  // Space the notes out so a note's ♭ or ♯ never lands on the stem or head of the note before it.
  const needsSign = n => {
    if (!n.m) return false;
    const name = noteName(n.m, flats);
    const alter = accidentalOf(name) === '♯' ? 1 : accidentalOf(name) === '♭' ? -1 : 0;
    return (sig.alters[name[0]] ?? 0) !== alter; // a note the key signature already covers has no sign of its own
  };
  const signed = n => [n, ...(n.with ?? []).map(m => ({ m }))].some(k => (everySign ? Boolean(k.m) && accidentalOf(noteName(k.m, flats)) !== '' : needsSign(k)));
  for (let i = 1; i < placed.length; i++) {
    const gap = 14 + (signed(placed[i].n) ? 12 : 0); // room for the sign, clear of the stem of the note before
    if (placed[i].x - placed[i - 1].x < gap) placed[i].x = placed[i - 1].x + gap;
  }
  // if that pushed the last note past the end of the bar, squeeze the notes back together (never closer than a note's width)
  if (placed.length > 1 && barEnd != null) {
    const first = placed[0].x;
    const last = placed.at(-1).x;
    const limit = barEnd - 12;
    if (last > limit) {
      const ratio = Math.max(0.1, (limit - first) / (last - first));
      for (let i = 1; i < placed.length; i++) placed[i].x = Math.max(placed[i - 1].x + 11, first + (placed[i].x - first) * ratio);
    }
  }
  const stepOfNote = n => stepOf(noteName(n.m, flats), n.m);
  const beamed = beamGroups(notes, feel);
  const inBeam = new Map();
  beamed.forEach(items => items.forEach(i => inBeam.set(i, items)));
  const stemUp = new Map(); // beam group → direction
  const tipOf = new Map();
  for (const items of beamed) {
    const steps = items.map(i => stepOfNote(notes[i]));
    const up = steps.reduce((a, b) => a + b, 0) / steps.length < staff.mid;
    stemUp.set(items, up);
    const ys = steps.map(yOf);
    tipOf.set(items, up ? Math.min(...ys) - 7 * STEP : Math.max(...ys) + 7 * STEP);
  }

  // Several keys on one count: stacked heads, one stem, the signs staggered to the left.
  const drawChord = (n, x) => {
    const shape = noteShape(n.d, feel);
    const infos = [n.m, ...n.with].map(m => {
      const name = noteName(m, flats);
      const sign = accidentalOf(name);
      const alter = sign === '♯' ? 1 : sign === '♭' ? -1 : 0;
      return { name, sign, alter, octave: Math.floor((m - alter) / 12), step: stepOf(name, m) };
    });
    const layout = chordLayout(infos.map(k => k.step), staff.mid);
    const dxOf = new Map(layout.notes.map(k => [k.step, k.dx]));
    const steps = infos.map(k => k.step);
    const lo = Math.min(...steps);
    const hi = Math.max(...steps);
    const open = shape.kind === 'whole' || shape.kind === 'half';
    const columns = []; // the steps of the signs already placed in each column left of the heads
    for (const k of infos) {
      const hx = x + (dxOf.get(k.step) || 0) * 11;
      for (const s of ledgerSteps(k.step, staff)) g.append(el('line', { x1: hx - 10, x2: hx + 10, y1: yOf(s), y2: yOf(s), class: 'ledger' }));
      const mark = k.alter !== 0 && everySign ? k.sign : alterNow(k.name[0], k.octave) === k.alter ? '' : k.alter === 1 ? '♯' : k.alter === -1 ? '♭' : '♮';
      current.set(`${k.name[0]}${k.octave}`, k.alter);
      if (mark) {
        let col = columns.findIndex(list => list.every(s => Math.abs(s - k.step) >= 5));
        if (col < 0) col = columns.push([]) - 1;
        columns[col].push(k.step);
        const leftmost = Math.min(0, ...layout.notes.map(q => q.dx)) * 11;
        g.append(el('text', { x: x + leftmost - 9 - col * 8, y: yOf(k.step) + (mark === '♭' ? 6 : 7), class: 'tacc', style: `fill:${color}` }, mark));
      }
      g.append(el('ellipse', {
        cx: hx, cy: yOf(k.step), rx: 6.6, ry: 4.7, transform: `rotate(-20 ${hx} ${yOf(k.step)})`,
        class: open ? 'head open' : 'head', style: open ? `stroke:${color}` : `fill:${color}`,
      }));
      if (shape.dots) g.append(el('circle', { cx: hx + 11, cy: yOf(k.step + (k.step % 2 === 0 ? 1 : 0)), r: 2, style: `fill:${color}` }));
    }
    if (shape.kind === 'whole') return;
    const up = layout.up;
    const sx = up ? x + 6.2 + (layout.notes.some(q => q.dx > 0) ? 11 : 0) : x - 6.2 - (layout.notes.some(q => q.dx < 0) ? 11 : 0);
    const tip = up ? yOf(hi) - 7 * STEP : yOf(lo) + 7 * STEP;
    g.append(el('line', { x1: sx, x2: sx, y1: yOf(up ? lo : hi), y2: tip, class: 'stem', style: `stroke:${color}` }));
    if (shape.kind === 'eighth' || shape.kind === 'sixteenth') {
      g.append(el('path', { d: up ? `M${sx} ${tip} q9 6 6 17` : `M${sx} ${tip} q9 -6 6 -17`, class: 'flag', style: `stroke:${color}` }));
    }
  };

  placed.forEach(({ n, x }, i) => {
    const shape = noteShape(n.d, feel);
    if (!n.m) {
      const whole = n.d >= pulses;
      drawRest(g, whole ? 'whole' : shape.kind, whole ? x0 + barW / 2 : x, whole ? 0 : shape.dots, color, restShift);
      return;
    }
    if (n.with?.length) {
      drawChord(n, x);
      return;
    }
    const name = noteName(n.m, flats);
    const step = stepOf(name, n.m);
    const sign = accidentalOf(name);
    const alter = sign === '♯' ? 1 : sign === '♭' ? -1 : 0;
    const octave = Math.floor((n.m - alter) / 12);
    // a sign is written only when the note differs from what the key signature (or an earlier note in the bar) already says
    const mark = alter !== 0 && everySign ? sign : alterNow(name[0], octave) === alter ? '' : alter === 1 ? '♯' : alter === -1 ? '♭' : '♮';
    current.set(`${name[0]}${octave}`, alter);
    for (const s of ledgerSteps(step, staff)) g.append(el('line', { x1: x - 10, x2: x + 10, y1: yOf(s), y2: yOf(s), class: 'ledger' }));
    if (mark) g.append(el('text', { x: x - 9, y: yOf(step) + (mark === '♭' ? 6 : 7), class: 'tacc', style: `fill:${color}` }, mark));
    const open = shape.kind === 'whole' || shape.kind === 'half';
    g.append(el('ellipse', {
      cx: x, cy: yOf(step), rx: 6.6, ry: 4.7, transform: `rotate(-20 ${x} ${yOf(step)})`,
      class: open ? 'head open' : 'head', style: open ? `stroke:${color}` : `fill:${color}`,
    }));
    if (shape.dots) g.append(el('circle', { cx: x + 11, cy: yOf(step + (step % 2 === 0 ? 1 : 0)), r: 2, style: `fill:${color}` }));
    const stemGoesUp = (inBeam.get(i) ? stemUp.get(inBeam.get(i)) : step < staff.mid);
    if (n.finger) {
      // the suggested finger, just away from the stem
      g.append(el('text', { x, y: yOf(step) + (stemGoesUp ? 17 : -9), class: 'tfinger', style: `fill:${color}` }, String(n.finger)));
    }
    if (noteNames) {
      // the note's name, away from its stem: below a note whose stem goes up, above one whose stem goes down (further out when a finger is shown)
      const text = `${name[0]}${name.includes('#') ? '♯' : name.includes('b') ? '♭' : ''}${Math.floor(n.m / 12) - 1}`;
      const extra = n.finger ? 10 : 0;
      g.append(el('text', { x, y: yOf(step) + (stemGoesUp ? 18 + extra : -11 - extra), class: 'tname', style: `fill:${color}` }, text));
    }
    if (shape.kind !== 'whole') {
      const group = inBeam.get(i);
      const up = group ? stemUp.get(group) : step < staff.mid;
      const sx = up ? x + 6.2 : x - 6.2;
      const tip = group ? tipOf.get(group) : yOf(step) + (up ? -7 : 7) * STEP;
      g.append(el('line', { x1: sx, x2: sx, y1: yOf(step), y2: tip, class: 'stem', style: `stroke:${color}` }));
      if (!group && (shape.kind === 'eighth' || shape.kind === 'sixteenth')) {
        g.append(el('path', { d: up ? `M${sx} ${tip} q9 6 6 17` : `M${sx} ${tip} q9 -6 6 -17`, class: 'flag', style: `stroke:${color}` }));
      }
    }
  });
  placed.forEach(({ n, x }, i) => {
    if (!n.tied) return;
    const step = stepOfNote(n);
    const up = step < staff.mid;
    const next = placed[i + 1].x;
    const y = yOf(step) + (up ? 9 : -9);
    g.append(el('path', { d: `M${x + 3} ${y} Q${(x + next) / 2} ${y + (up ? 9 : -9)} ${next - 3} ${y}`, class: 'tie', style: `stroke:${color}` }));
  });
  // a tie over the bar line: the first note's curve runs to the line, the next bar's note has the rest coming in from it
  placed.forEach(({ n, x }) => {
    if (!n.m || !(n.tieOut || n.tieIn)) return;
    for (const key of [n.m, ...(n.with ?? [])]) {
      const step = stepOf(noteName(key, flats), key);
      const up = step < staff.mid;
      const y = yOf(step) + (up ? 9 : -9);
      const [from, to] = n.tieOut ? [x + 3, barEnd - 3] : [x0 + 3, x - 3];
      g.append(el('path', { d: `M${from} ${y} Q${(from + to) / 2} ${y + (up ? 9 : -9)} ${to} ${y}`, class: 'tie', style: `stroke:${color}` }));
    }
  });
  for (const items of beamed) {
    const up = stemUp.get(items);
    const from = placed[items[0]].x + (up ? 6.2 : -6.2);
    const to = placed[items.at(-1)].x + (up ? 6.2 : -6.2);
    g.append(el('line', { x1: from, x2: to, y1: tipOf.get(items), y2: tipOf.get(items), class: 'beam', style: `stroke:${color}` }));
  }
}

/**
 * One page of lines. bars = [{ chord (name text), melody: [{ m, d }], bass: midi or null }] for the bars on this page,
 * grouped in lines of `perLine`. Returns an <svg>.
 */
export function tuneSheetSVG({ lines, bars, feel, flats = false, firstLine = true, guide = true, noteNames = false, fingers = false, keyText = '', perLine = BARS_PER_LINE }) {
  const sig = keySignature(keyText);
  const sigW = sig.letters.length * 8;
  const svg = el('svg', { viewBox: `0 0 ${WIDTH} ${lines.length * SYSTEM_H}`, class: 'sheet tune-sheet', role: 'img' });
  const blue = 'var(--lh)';
  const orange = 'var(--rh)';
  const pulses = feel.pulses;

  lines.forEach((line, row) => {
    const top = row * SYSTEM_H;
    const g = el('g', { transform: `translate(0 ${top})` });
    svg.append(g);
    const first = row === 0 && firstLine;
    const x0 = guide ? 46 : 6; // where the staff starts; the strip to its left holds the letter guide
    const left = x0 + (first ? 72 : 44) + sigW;
    const right = WIDTH - 6;
    const barW = (right - left) / perLine;

    for (const [low, high] of [[30, 38], [18, 26]]) {
      for (let s = low; s <= high; s += 2) g.append(el('line', { x1: x0, x2: right, y1: yOf(s), y2: yOf(s), class: 'line' }));
    }
    g.append(el('line', { x1: x0, x2: x0, y1: yOf(38), y2: yOf(18), class: 'bar thick' }));
    g.append(el('text', { x: x0 + 3, y: yOf(28) + 4, class: 'tclef treble' }, '𝄞'));
    g.append(el('text', { x: x0 + 3, y: yOf(20) + 2, class: 'tclef bass' }, '𝄢'));
    // the key signature after each clef: its flats or sharps apply to every note of that letter
    for (const clef of ['treble', 'bass']) {
      signaturePositions(sig, clef).forEach(({ step }, i) => {
        g.append(el('text', { x: x0 + 32 + i * 8, y: yOf(step) + (sig.kind === 'flat' ? 6 : 7), class: 'tsig' }, sig.kind === 'flat' ? '♭' : '♯'));
      });
    }

    // The guide: the letter of every line (next to the staff) and every space (one column further left).
    // Letters that this line of music uses are drawn bigger, in the colour of the hand that plays them.
    if (guide) {
      const usedRight = new Set();
      const usedLeft = new Set();
      for (const barIndex of line) {
        for (const n of bars[barIndex].melody) if (n.m) usedRight.add(stepOf(noteName(n.m, flats), n.m));
        for (const n of bars[barIndex].bassLine ?? (bars[barIndex].bass ? [{ m: bars[barIndex].bass }] : [])) if (n.m) usedLeft.add(stepOf(noteName(n.m, flats), n.m));
      }
      const steps = [30, 31, 32, 33, 34, 35, 36, 37, 38, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28];
      for (const step of steps) {
        const isLine = step % 2 === 0 && step !== 28;
        const treble = step >= 28;
        const used = (treble ? usedRight : usedLeft).has(step);
        const middleC = step === 28;
        g.append(el('text', {
          x: x0 - (middleC ? 5 : isLine ? 5 : 19), y: yOf(step) + 4, class: `tguide${isLine ? '' : ' space'}${used ? ' used' : ''}${middleC ? ' middle' : ''}`,
          ...(used ? { style: `fill:${treble ? orange : blue}` } : {}),
        }, middleC ? 'C' : stepLetter(step)));
      }
      g.append(el('text', { x: x0 - 13, y: yOf(28) + 3, class: 'tguide-note' }, 'middle'));
    }
    if (first) {
      const [top1, bottom1] = feel.group === 3 ? [pulses, 8] : feel.group === 2 ? [pulses / 2, 4] : feel.group === 4 ? [pulses / 4, 4] : [pulses, 4];
      for (const [hi, lo] of [[36, 32], [24, 20]]) {
        g.append(el('text', { x: x0 + 56 + sigW, y: yOf(hi) + 9, class: 'ttime' }, String(top1)));
        g.append(el('text', { x: x0 + 56 + sigW, y: yOf(lo) + 9, class: 'ttime' }, String(bottom1)));
      }
    }

    line.forEach((barIndex, col) => {
      const bar = bars[barIndex];
      const x0b = left + col * barW;
      const x1 = x0b + barW;
      const inner0 = x0b + 14;
      const innerW = barW - 26;
      const xAt = start => inner0 + (start / pulses) * innerW;
      const last = barIndex === bars.length - 1;

      g.append(el('line', { x1: x1, x2: x1, y1: yOf(38), y2: yOf(18), class: last ? 'bar thick' : 'bar' }));
      if (last) g.append(el('line', { x1: x1 - 4, x2: x1 - 4, y1: yOf(38), y2: yOf(18), class: 'bar' }));
      if (col === 0) g.append(el('text', { x: x0b + 2, y: 12, class: 'tbarnum' }, String(barIndex + 1)));
      if (bar.chord) g.append(el('text', { x: x0b + 14, y: 20, class: 'tchord' }, bar.chord));

      drawLane(g, { notes: bar.melody, staff: TREBLE, color: orange, xAt, x0: x0b, barW, restShift: 0, feel, flats, noteNames, sig, everySign: !sig.letters.length, barEnd: x1, fingerList: fingers ? bar.tuneFingers : null });
      // The left hand: the song's own bass line, or else one root held for the bar.
      if (bar.bassLine?.some(n => n.m)) drawLane(g, { notes: bar.bassLine, staff: BASS, color: blue, xAt, x0: x0b, barW, restShift: -12, feel, flats, noteNames, sig, everySign: !sig.letters.length, barEnd: x1, fingerList: fingers ? bar.bassFingers : null });
      else if (bar.bass) drawLane(g, { notes: [{ m: bar.bass, d: pulses }], staff: BASS, color: blue, xAt, x0: x0b, barW, restShift: -12, feel, flats, noteNames, sig, everySign: !sig.letters.length, barEnd: x1, fingerList: fingers ? bar.bassFingers : null });
    });
  });
  return svg;
}

/**
 * One note on a single staff, for the "read the note" quiz: the staff, its clef, the note as a whole note with any ledger
 * lines and a ♯ or ♭ sign. `guide` writes the letter of every line and space on the left (a hint).
 */
export function noteStaffSVG({ midi, clef = 'treble', flats = false, guide = false }) {
  const bass = clef === 'bass';
  const staff = bass ? BASS : TREBLE;
  const lineSteps = bass ? [18, 20, 22, 24, 26] : [30, 32, 34, 36, 38];
  const x0 = guide ? 46 : 8;
  const right = x0 + 170;
  const top = yOf(lineSteps.at(-1) + 8);
  const bottom = yOf(lineSteps[0] - 8);
  const svg = el('svg', { viewBox: `0 ${top} ${right + 8} ${bottom - top}`, class: 'quiz-staff', role: 'img' });
  svg.setAttribute('aria-label', `One note on the ${clef} staff`);
  for (const s of lineSteps) svg.append(el('line', { x1: x0, x2: right, y1: yOf(s), y2: yOf(s), class: 'qline' }));
  svg.append(el('text', { x: x0 + 4, y: bass ? yOf(20) + 2 : yOf(28) + 4, class: `qclef${bass ? ' bass' : ''}` }, bass ? '𝄢' : '𝄞'));

  if (guide) {
    const steps = bass ? [18, 19, 20, 21, 22, 23, 24, 25, 26] : [30, 31, 32, 33, 34, 35, 36, 37, 38];
    for (const step of steps) {
      const isLine = step % 2 === 0;
      svg.append(el('text', { x: x0 - (isLine ? 5 : 19), y: yOf(step) + 4, class: `qguide${isLine ? '' : ' space'}` }, stepLetter(step)));
    }
  }

  const name = noteName(midi, flats);
  const step = stepOf(name, midi);
  const x = x0 + 112;
  for (const s of ledgerSteps(step, staff)) svg.append(el('line', { x1: x - 13, x2: x + 13, y1: yOf(s), y2: yOf(s), class: 'qline ledger' }));
  const sign = accidentalOf(name);
  if (sign) svg.append(el('text', { x: x - 11, y: yOf(step) + (sign === '♭' ? 6 : 7), class: 'qacc' }, sign));
  svg.append(el('ellipse', { cx: x, cy: yOf(step), rx: 8, ry: 5.6, transform: `rotate(-20 ${x} ${yOf(step)})`, class: 'qhead' }));
  return svg;
}
