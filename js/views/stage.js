// The frame round the falling notes: a size choice and a full-screen button.
// Full screen uses the browser's full-screen mode where it exists (a Mac), and otherwise (an iPhone) covers the whole page.

import { h, segmented } from '../dom.js';
import { settings, saveSettings } from '../store.js';

const SIZES = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
const sizeNow = () => (SIZES.some(([id]) => id === settings.fallSize) ? settings.fallSize : 'medium');

/**
 * fall: the falling view; title: text for the top line; controls: elements shown under the notes
 * (they stay visible in full screen). Returns { el, exit }.
 */
export function fallStage({ fall, title, controls = [] }) {
  const stage = h('section', { class: 'card fall-stage' });
  let apiOn = false;
  const button = h('button', { type: 'button', class: 'btn small', 'aria-label': 'Full screen' }, '⛶ Full screen');
  const namesButton = h('button', { type: 'button', class: 'btn small', 'aria-label': 'Show note names on the falling notes' });
  const showNames = () => settings.fallNames !== false;
  const labelNames = () => { namesButton.textContent = showNames() ? '♪ Names on' : '♪ Names off'; namesButton.setAttribute('aria-pressed', String(showNames())); };
  namesButton.onclick = () => { settings.fallNames = !showNames(); saveSettings(); labelNames(); fall.setNames({ on: showNames() }); };
  labelNames();
  fall.setNames({ on: showNames() });
  const fingersButton = h('button', { type: 'button', class: 'btn small', 'aria-label': 'Show suggested finger numbers on the falling notes' });
  const showFingers = () => settings.fallFingers !== false;
  const labelFingers = () => { fingersButton.textContent = showFingers() ? '☝ Fingers on' : '☝ Fingers off'; fingersButton.setAttribute('aria-pressed', String(showFingers())); };
  fingersButton.onclick = () => { settings.fallFingers = !showFingers(); saveSettings(); labelFingers(); fall.setNames({ fingers: showFingers() }); };
  labelFingers();
  fall.setNames({ fingers: showFingers() });
  const settingsButton = h('button', { type: 'button', class: 'btn small full-only', 'aria-pressed': 'false' }, '⚙ Practice settings');

  const isFull = () => stage.classList.contains('full');

  function enter() {
    stage.classList.add('full');
    document.body.classList.add('fall-open');
    button.textContent = '✕ Exit full screen';
    fall.setLayout('full');
    if (stage.requestFullscreen) {
      stage.requestFullscreen().then(() => { apiOn = true; }).catch(() => { apiOn = false; }); // if refused, the covering page still works
    }
  }

  function exit() {
    if (!isFull()) return;
    stage.classList.remove('full', 'show-controls');
    settingsButton.setAttribute('aria-pressed', 'false');
    document.body.classList.remove('fall-open');
    button.textContent = '⛶ Full screen';
    if (apiOn && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    apiOn = false;
    fall.setLayout(sizeNow());
  }

  button.onclick = () => (isFull() ? exit() : enter());
  settingsButton.onclick = () => {
    const on = stage.classList.toggle('show-controls'); // in full screen the practice settings are hidden until asked for, so the notes get the room
    settingsButton.setAttribute('aria-pressed', String(on));
    fall.redraw();
  };
  document.addEventListener('fullscreenchange', () => { if (apiOn && !document.fullscreenElement) exit(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isFull()) exit(); });

  stage.append(
    h('div', { class: 'fall-top' },
      h('h3', {}, title),
      h('div', { class: 'row' },
        segmented(SIZES, sizeNow(), v => { settings.fallSize = v; saveSettings(); if (!isFull()) fall.setLayout(v); }, 'Size of the falling notes'),
        namesButton,
        fingersButton,
        settingsButton,
        button)),
    fall.el,
    h('div', { class: 'fall-controls' }, controls));
  fall.setLayout(sizeNow());
  return { el: stage, exit };
}
