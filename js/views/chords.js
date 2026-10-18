// Chords tab: search or pick a chord and see both hands on the keyboard.

import { h, fill, segmented, toggle } from '../dom.js';
import {
  CHORD_TYPES, ROOTS, makeChord, parseChord, pcOf, rhVoicing, lhPattern, noteLabeler, enharmonicHints, inversionName,
} from '../theory.js';
import { renderBoard } from '../keyboard.js';
import { playNote, playChord, playSequence, playBoth } from '../audio.js';
import { settings, saveSettings } from '../store.js';

// Same order as the original chord table.
const TABLE_ORDER = ['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab'];

export function chordsView() {
  let chord = parseChord('C');
  let inversion = 0;

  const input = h('input', {
    type: 'search',
    class: 'input search',
    placeholder: 'Search a chord: Am, F#m, Bb7, C/E…',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    'aria-label': 'Search a chord',
    oninput: onSearch,
    onkeydown: e => e.key === 'Enter' && input.blur(),
  });
  const message = h('p', { class: 'search-msg', 'aria-live': 'polite' });
  const roots = h('div', { class: 'chips', role: 'group', 'aria-label': 'Root note' });
  const types = h('div', { class: 'chips types', role: 'group', 'aria-label': 'Chord type' });
  const result = h('section', { class: 'card result' });

  function onSearch() {
    const value = input.value.trim();
    if (!value) return (message.textContent = '');
    const c = parseChord(value);
    if (!c) return (message.textContent = `I don't recognise “${value}” yet. Try something like Am, F#m7 or Bb.`);
    message.textContent = c.original ? `Closest chord I know: ${c.symbol}` : '';
    select(c, false);
  }

  function select(c, updateInput = true) {
    chord = c;
    inversion = 0;
    if (updateInput) {
      input.value = c.symbol;
      message.textContent = '';
    }
    renderPickers();
    renderResult();
  }

  function renderPickers() {
    roots.replaceChildren(...ROOTS.map(r => h('button', {
      type: 'button',
      class: 'chip' + (pcOf(r) === chord.rootPc ? ' active' : ''),
      onclick: () => select(makeChord(r, chord.type)),
    }, r)));
    const chip = t => h('button', {
      type: 'button',
      class: 'chip' + (t === chord.type ? ' active' : ''),
      title: t.name,
      onclick: () => select(makeChord(chord.root, t)),
    }, t.suffix || 'Major');
    types.replaceChildren(
      ...CHORD_TYPES.filter(t => t.core).map(chip),
      h('span', { class: 'chip-sep', 'aria-hidden': 'true' }),
      ...CHORD_TYPES.filter(t => !t.core).map(chip),
    );
  }

  function renderResult() {
    const lh = lhPattern(chord);
    const rh = rhVoicing(chord, inversion);
    const label = noteLabeler(chord);
    const board = h('div', { class: 'board' });
    const hints = enharmonicHints(chord);
    const invOptions = chord.pcs.map((_, k) => [k, k === 0 ? 'Root' : ['1st', '2nd', '3rd', '4th'][k - 1]]);

    fill(result, 
      h('div', { class: 'result-head' },
        h('div', { class: 'symbol' }, chord.symbol),
        h('div', {},
          h('div', { class: 'long' }, chord.name),
          h('div', { class: 'muted' }, 'Notes: ', chord.notes.join(' · ')))),
      h('div', { class: 'hands' },
        hand('lh', 'Left hand', lh.map(label).join(' → '), () => playSequence(lh)),
        hand('rh', 'Right hand', rh.map(label).join(' + '), () => playChord(rh))),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => playBoth(lh, rh) }, '▶ Play both hands'),
        chord.pcs.length > 1 && h('div', { class: 'inv' },
          h('span', { class: 'muted small' }, 'Right-hand shape'),
          segmented(invOptions, inversion, k => { inversion = k; renderResult(); }, 'Inversion'))),
      inversion > 0 && h('p', { class: 'muted small' },
        `${inversionName(inversion)}: same notes, different order. Handy for moving smoothly between chords.`),
      board,
      h('div', { class: 'row wrap between' },
        toggle('Name every key', settings.showAll, v => { settings.showAll = v; saveSettings(); renderResult(); }),
        h('span', { class: 'muted small' }, 'Tap any key to hear it')),
      hints.length > 0 && h('p', { class: 'hint-note' }, '💡 ', hints.join('. '), '.'),
    );
    renderBoard(board, { lh, rh, label, showAll: settings.showAll, onKey: m => playNote(m) });
  }

  function cheatSheet() {
    const row = c => h('tr', { tabindex: 0, onclick: () => pick(c), onkeydown: e => e.key === 'Enter' && pick(c) },
      h('th', { scope: 'row' }, c.name),
      h('td', { class: 'lh-text' }, lhPattern(c).map(noteLabeler(c)).join(' → ')),
      h('td', { class: 'rh-text' }, c.notes.join(' + ')));
    const pick = c => {
      select(c);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const majMin = TABLE_ORDER.flatMap(r => [makeChord(r, CHORD_TYPES[0]), makeChord(r, CHORD_TYPES[1])]);
    return h('details', { class: 'card cheat' },
      h('summary', {}, 'Cheat sheet: all 24 major & minor chords'),
      h('div', { class: 'table-wrap' },
        h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Chord'), h('th', {}, 'Left hand'), h('th', {}, 'Right hand'))),
          h('tbody', {}, majMin.map(row)))),
      h('p', { class: 'muted small' }, 'Tap a row to see it on the keyboard.'));
  }

  renderPickers();
  renderResult();

  return {
    el: h('div', { class: 'view' }, input, message, roots, types, result, cheatSheet()),
  };
}

export function hand(cls, title, notes, onPlay) {
  return h('div', { class: `hand ${cls}` },
    h('span', { class: 'hand-title' }, title),
    h('span', { class: 'hand-notes' }, notes),
    h('button', { type: 'button', class: 'btn icon', 'aria-label': `Play ${title.toLowerCase()}`, onclick: onPlay }, '▶'));
}
