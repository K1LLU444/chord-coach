// Practice controls: which bars to play, how fast, which hand, and how many times round.

import { h, fill, toggle } from '../dom.js';
import { HANDS, SPEEDS, clampRange } from '../practice.js';
import { piano } from '../midi.js';

/**
 * count() → number of bars; range() → { from, to } (1-based); setRange(from, to);
 * current() → the selected bar (0-based); speed()/setSpeed(percent); hands()/setHands(id);
 * loop()/setLoop(bool); onChange() runs after any of them changes. Returns { el, refresh }.
 */
export function practicePanel({ count, range, setRange, current, speed, setSpeed, hands, setHands, loop, setLoop, onChange, wait = null, setWait = null }) {
  const el = h('div', { class: 'practice-panel' });

  function draw() {
    const r = clampRange(range().from, range().to, count());
    const set = (from, to) => { const c = clampRange(from, to, count()); setRange(c.from, c.to); onChange(); draw(); };
    const number = (label, value, apply) => h('label', { class: 'row small' }, h('span', { class: 'muted' }, label),
      h('input', { class: 'input start-input', type: 'number', inputmode: 'numeric', min: 1, max: count(), value, 'aria-label': label, onchange: e => apply(Number(e.target.value)) }));
    const here = current() + 1;
    fill(el,
      h('div', { class: 'practice-row' },
        h('span', { class: 'style-label' }, 'Bars'),
        number('From bar', r.from, v => set(v, r.to)),
        number('to bar', r.to, v => set(r.from, v)),
        h('span', { class: 'muted small' }, r.from === 1 && r.to === count() ? 'the whole piece' : `${r.to - r.from + 1} bar${r.to === r.from ? '' : 's'}`)),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn small', onclick: () => set(here, Math.max(here, r.to)) }, 'Start here'),
        h('button', { type: 'button', class: 'btn small', onclick: () => set(Math.min(here, r.from), here) }, 'End here'),
        h('button', { type: 'button', class: 'btn small', onclick: () => set(here, here) }, 'Only this bar'),
        h('button', { type: 'button', class: 'btn small', onclick: () => set(here, here + 3) }, 'This bar + next 3'),
        h('button', { type: 'button', class: 'btn small', onclick: () => set(1, count()) }, 'All')),
      h('div', { class: 'practice-row' },
        h('span', { class: 'style-label' }, 'Speed'),
        ...SPEEDS.map(p => h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(speed() === p), onclick: () => { setSpeed(p); onChange(); draw(); } }, `${p}%`)),
        h('input', { type: 'range', min: 30, max: 150, step: 5, value: speed(), 'aria-label': 'Speed in percent', oninput: e => { setSpeed(+e.target.value); onChange(); drawLabel(); } }),
        h('b', { class: 'speed-label' }, `${speed()}%`)),
      h('div', { class: 'practice-row' },
        h('span', { class: 'style-label' }, 'Hands'),
        ...HANDS.map(([id, name]) => h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(hands() === id), onclick: () => { setHands(id); onChange(); draw(); } }, name))),
      toggle('Loop these bars until I press Stop', loop(), v => { setLoop(v); onChange(); }),
      wait && setWait && toggle(piano.state.connected
        ? '🎹 Wait for me: the notes stop until I press the right keys on my piano (choose the hand you play above)'
        : '🎹 Wait for me (needs your piano connected: see the Piano tab)', Boolean(wait()) && piano.state.connected, v => { setWait(v); onChange(); }));
  }

  function drawLabel() {
    const label = el.querySelector('.speed-label');
    if (label) label.textContent = `${speed()}%`;
  }

  draw();
  return { el, refresh: draw };
}
