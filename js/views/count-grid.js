// The "pick by count" grid used by the Maker: keys down the side, the counts of a bar across the top.
// Each count either starts a note (a key number), starts a rest (0) or carries on (null) — see js/melody.js.

import { h, fill } from '../dom.js';

/**
 * Draw the grid into `box`.
 * cells: one value per column (pulses × sub); rows: [{ m, label, className? }] highest first;
 * onSet(column, value) is called when a square is tapped (the caller changes the cells and draws again).
 */
// A cell holds nothing (null), a rest (0), one key (a number) or several keys on one count (a list).
const has = (value, m) => (Array.isArray(value) ? value.includes(m) : value === m);

export function drawCountGrid(box, { cells, pulses, sub, group, rows, onSet }) {
  const columns = pulses * sub;
  const sounding = cells.map((_, c) => {
    for (let i = c; i >= 0; i--) if (cells[i] !== null) return cells[i];
    return null;
  });
  const beat = c => c % (group * sub) === 0; // the first column of each main beat
  const cell = (c, value, label) => h('button', {
    type: 'button',
    class: `cell${has(cells[c], value) ? ' on' : has(sounding[c], value) && cells[c] === null ? ' hold' : ''}${beat(c) ? ' beat' : ''}`,
    'aria-label': `${label} on count ${c % sub === 0 ? c / sub + 1 : `${Math.floor(c / sub) + 1} and a half`}`,
    'aria-pressed': String(has(cells[c], value)),
    onclick: () => onSet(c, value),
  });
  fill(box,
    h('div', { class: 'count-grid', style: `--cols:${columns}` },
      h('span', { class: 'corner' }, 'Count'),
      Array.from({ length: columns }, (_, c) => h('span', { class: `count-head${beat(c) ? ' beat' : ''}${c % sub ? ' half' : ''}` }, c % sub === 0 ? c / sub + 1 : '·')),
      rows.map(({ m, label, className = '' }) => [
        h('span', { class: `row-label ${className}`.trim() }, label),
        Array.from({ length: columns }, (_, c) => cell(c, m, label)),
      ]),
      h('span', { class: 'row-label rest-label' }, 'rest'),
      Array.from({ length: columns }, (_, c) => cell(c, 0, 'rest'))));
}
