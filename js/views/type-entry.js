// "Type it": music entered as text, a whole line of a sheet at a time (see js/notation-text.js).
// Used by the Maker and by a song's Tune screen.

import { h, fill, toast } from '../dom.js';
import { notationOf, parseNotation } from '../notation-text.js';

/**
 * lanes: [{ id, title, get() → bars, set(start, bars) }];
 * barCount() → how many bars there are; extendTo(n) → true if there is (or now is) room for n bars;
 * afterApply() runs once typed music has been put in.
 */
export function typeEntry({ pulses, group, flats = false, lanes, barCount, extendTo, afterApply }) {
  const example = group === 3 ? 'r:3 Bb4:1 C5 D5 | Eb5:3 D5:2 C5:1 | Bb4:6' : 'C4+E4+G4:2 G4:1 E4 | C5:4';
  const start = h('input', { class: 'input start-input', type: 'number', inputmode: 'numeric', min: 1, value: 1, 'aria-label': 'First bar to fill' });
  const startBar = () => Math.max(1, Math.round(Number(start.value)) || 1) - 1;

  const sections = lanes.map(lane => {
    const area = h('textarea', {
      class: 'input mono notation', rows: 5, spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off', 'aria-label': `${lane.title}, typed notes`,
      placeholder: `${lane.title}, for example:\n${example}`,
      oninput: () => check(),
    });
    const status = h('div', { class: 'notation-status', 'aria-live': 'polite' });
    const parsed = () => parseNotation(area.value, pulses);

    function check() {
      if (!area.value.trim()) return fill(status);
      const { bars, errors, notes } = parsed();
      fill(status, errors.length
        ? errors.slice(0, 6).map(e => h('p', { class: 'warn' }, `Bar ${startBar() + e.bar}: ${e.message}`))
        : h('p', { class: 'good-text' }, `✓ ${bars.length} bar${bars.length === 1 ? '' : 's'}, ${notes} note${notes === 1 ? '' : 's'}, from bar ${startBar() + 1} to ${startBar() + bars.length}`));
    }

    function apply() {
      const { bars, errors } = parsed();
      if (!bars.length) return toast('Type some notes first.');
      if (errors.length) return toast('Fix the red lines first. Nothing was changed.');
      const from = startBar();
      if (from + bars.length > barCount() && !extendTo(from + bars.length)) {
        return toast(`There is room for ${Math.max(0, barCount() - from)} bar${barCount() - from === 1 ? '' : 's'} from bar ${from + 1}, but you typed ${bars.length}.`);
      }
      lane.set(from, bars);
      afterApply();
      toast(`${lane.title}: filled bars ${from + 1} to ${from + bars.length}.`);
    }

    return h('div', { class: 'type-lane' },
      h('div', { class: 'style-label' }, lane.title),
      area,
      status,
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn small primary', onclick: apply }, `Fill the bars with this`),
        h('button', {
          type: 'button', class: 'btn small',
          onclick: () => {
            area.value = notationOf(lane.get().slice(startBar()), flats);
            check();
          },
        }, 'Turn what is tapped into text'),
        h('button', { type: 'button', class: 'btn small', onclick: () => (area.value.trim() ? copyText(area.value, lane.title) : toast('Nothing to copy yet.')) }, 'Copy')));
  });

  return h('div', { class: 'type-entry grid-gap' },
    h('p', { class: 'muted small' },
      'Type what you read on the sheet. A note is its letter, ♭ or ♯ written b or #, its octave (middle C is C4), then “:” and how many counts it lasts: ',
      h('b', {}, 'Bb4:2'), '. Several keys on one count (a chord) are joined with a plus: ', h('b', {}, 'C4+E4+G4:2'), '. A rest is ', h('b', {}, 'r:2'), '. Leave the length out to repeat the one before. Put ', h('b', {}, '|'), ' between bars. This bar holds ', h('b', {}, `${pulses} counts`), '.'),
    h('p', { class: 'muted small' }, 'Example: ', h('code', {}, example)),
    h('label', { class: 'row small' }, h('span', { class: 'muted' }, 'Start at bar'), start),
    sections);
}

/** Copy text to the clipboard (or show it to copy by hand when the browser won't allow it). */
export async function copyText(text, what = 'The text') {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} was copied.`);
  } catch {
    window.prompt('Copy this text:', text);
  }
}

/**
 * What was tapped, as text you can read, copy, or paste into “Type it”: this bar, and a button for the whole hand.
 * bars() → the bars of the hand being edited; bar() → the selected bar's index; title → "Left hand" etc.
 */
export function asText({ bars, bar, title, flats = false, start = 0 }) {
  const here = notationOf([bars()[bar()] ?? []], flats);
  const whole = () => notationOf(bars().slice(start), flats);
  return h('div', { class: 'as-text' },
    h('div', { class: 'style-label' }, `${title}, as text`),
    h('div', { class: 'row between' },
      h('span', {}, h('span', { class: 'muted small' }, `Bar ${bar() + 1}: `), h('code', { class: 'text-bar' }, here || '(empty)')),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn small', disabled: !here, onclick: () => copyText(here, `Bar ${bar() + 1}`) }, 'Copy bar'),
        h('button', { type: 'button', class: 'btn small', onclick: () => copyText(whole(), title) }, 'Copy whole hand'))));
}
