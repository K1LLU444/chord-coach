// Draws piano keyboards as SVG, with left/right hand notes highlighted.

import { h } from './dom.js';
import { KEYBOARD, LH_RANGE, RH_RANGE, noteName } from './theory.js';

const NS = 'http://www.w3.org/2000/svg';
const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlack = m => BLACK.has(m % 12);

function svg(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

/**
 * marks: Map(midi → 'lh' | 'rh' | 'pick' | 'right' | 'wrong'); ghosts: Set(midi) drawn dashed (next chord).
 * label(midi) names a marked key; showAll names every key; mini draws a small unlabeled overview.
 * fingers: Map(midi → 1…5) draws the finger number on a marked key.
 */
export function keyboardSVG({ from, to, marks = new Map(), ghosts = new Set(), label, showAll = false, mini = false, fingers = null }) {
  const W = 40, H = mini ? 110 : 170, BW = 26, BH = mini ? 68 : 106;
  const whites = [];
  for (let m = from; m <= to; m++) if (!isBlack(m)) whites.push(m);
  const x = new Map(whites.map((m, i) => [m, i * W]));
  const root = svg('svg', { viewBox: `0 0 ${whites.length * W} ${H}`, class: `kb${mini ? ' mini' : ''}` });
  const nameOf = m => (label ? label(m) : noteName(m));

  const key = m => {
    const black = isBlack(m);
    const mark = marks.get(m);
    const cls = ['key', black ? 'black' : 'white', mark, mark && 'marked', ghosts.has(m) && 'ghost'].filter(Boolean).join(' ');
    const g = svg('g', { class: cls, 'data-midi': m });
    const kx = black ? x.get(m - 1) + W - BW / 2 : x.get(m) + 1;
    g.append(svg('rect', { x: kx, y: -8, width: black ? BW : W - 2, height: (black ? BH : H) + 8, rx: black ? 4 : 6 }));
    if (mini) return g;

    // Marked keys show their note name; C keys always show their octave (C3, C4…) to help you find your place.
    const octaveC = m % 12 === 0 ? `C${m / 12 - 1}` : null;
    const text = mark ? nameOf(m) : octaveC || (showAll ? nameOf(m) : null);
    const hint = !mark;
    if (text) {
      const t = svg('text', { x: kx + (black ? BW : W - 2) / 2, y: (black ? BH : H) - (black ? 12 : 16), class: hint ? 'hint' : '' });
      t.textContent = text;
      g.append(t);
    }
    const finger = mark && fingers?.get(m);
    if (finger) {
      const cx = kx + (black ? BW : W - 2) / 2;
      const cy = black ? BH - 52 : H - 52;
      g.append(svg('circle', { cx, cy, r: black ? 9 : 11, class: 'fing-bg' }));
      const f = svg('text', { x: cx, y: cy + (black ? 4.5 : 5.5), class: 'fing' });
      f.textContent = finger;
      g.append(f);
    }
    return g;
  };

  for (const m of whites) root.append(key(m));
  for (let m = from; m <= to; m++) if (isBlack(m)) root.append(key(m));

  const named = [...marks.keys()].sort((a, b) => a - b).map(nameOf).filter(Boolean);
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', named.length ? `Keyboard showing ${named.join(', ')}` : 'Keyboard');
  return root;
}

/** Render one keyboard into `container`. onKey(midi) fires on a tap (not on a swipe). */
export function renderPanel(container, opts) {
  const kb = keyboardSVG(opts);
  if (opts.onKey) {
    let down = null;
    kb.addEventListener('pointerdown', e => {
      down = { x: e.clientX, y: e.clientY, key: e.target.closest('[data-midi]') };
    });
    kb.addEventListener('pointerup', e => {
      if (!down) return;
      const { key } = down;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12;
      down = null;
      if (moved || !key) return;
      key.classList.add('pressed');
      setTimeout(() => key.classList.remove('pressed'), 160);
      opts.onKey(+key.dataset.midi);
    });
  }
  container.replaceChildren(kb);
  return kb;
}

/**
 * The standard two-hand view: left hand panel (C2–B3), right hand panel (C4–B5),
 * and a mini map of the whole 61-key CT-S300.
 */
export function renderBoard(container, { lh = [], rh = [], ghosts = [], label, showAll, onKey, overview = true, fingers = null }) {
  const marks = new Map([...lh.map(m => [m, 'lh']), ...rh.map(m => [m, 'rh'])]);
  const ghostSet = new Set(ghosts.filter(m => !marks.has(m)));
  const panel = (title, cls, range) => {
    const box = h('div', { class: 'kb-box' });
    renderPanel(box, { ...range, marks, ghosts: ghostSet, label, showAll, onKey, fingers });
    return h('div', { class: 'panel' }, h('div', { class: 'panel-label' }, h('span', { class: `dot ${cls}` }), title), box);
  };
  const parts = [h('div', { class: 'panels' }, panel('Left hand', 'lh', LH_RANGE), panel('Right hand', 'rh', RH_RANGE))];
  if (overview) {
    parts.push(h('div', { class: 'overview' },
      keyboardSVG({ ...KEYBOARD, marks, mini: true }),
      h('p', { class: 'muted small' }, 'Whole keyboard (61 keys). Middle C is the 3rd C from the left.')));
  }
  container.replaceChildren(...parts);
}
