// Piano tab: connect the real piano (USB), see the keys you press, and what chord they make.

import { h, fill, toggle } from '../dom.js';
import { keyboardSVG } from '../keyboard.js';
import { piano } from '../midi.js';
import { identifyChord, keyList } from '../chord-detect.js';
import { settings, saveSettings } from '../store.js';
import { syncLiveKeys } from '../live-keys.js';

export function pianoView() {
  const statusBox = h('section', { class: 'card piano-status-card' });
  const nowBox = h('section', { class: 'card piano-now' });
  const board = h('div', { class: 'kb-scroll piano-board' }, keyboardSVG({ from: 36, to: 96 }));
  const log = h('ol', { class: 'piano-log' });
  const history = [];

  async function connect() {
    const ok = await piano.start();
    if (ok) { settings.pianoAuto = true; saveSettings(); }
    drawStatus();
  }

  function drawStatus() {
    const s = piano.state;
    fill(statusBox,
      h('div', { class: 'row between' },
        h('h3', {}, '🎹 Your piano'),
        s.connected ? h('span', { class: 'good-text' }, `✓ Connected: ${s.names.join(', ')}`) : h('span', { class: 'muted small' }, 'Not connected')),
      !s.supported && h('p', { class: 'warn' }, 'This browser cannot read a piano. Open the app in Chrome on your Mac (Safari and the iPhone cannot do this).'),
      s.error && s.supported && h('p', { class: 'warn' }, s.error),
      s.supported && !s.connected && h('div', { class: 'grid-gap' },
        h('p', { class: 'muted small' }, 'Plug the piano into the Mac with the USB cable and switch it on, then press the button. Chrome asks once whether this page may use MIDI devices: choose Allow.'),
        h('button', { type: 'button', class: 'btn primary', onclick: connect }, 'Connect my piano')),
      s.connected && h('p', { class: 'muted small' }, 'Press some keys: they light up below. In the Songs and Maker tabs, the falling notes can wait for you, and you can record a tune by playing it.'),
      toggle('Also play the app’s own sound when I press a key (the piano already makes its own sound)', Boolean(settings.pianoSound), v => { settings.pianoSound = v; saveSettings(); }));
  }

  function drawNow() {
    const down = [...piano.pressed.keys()];
    const chord = identifyChord(down)[0];
    fill(nowBox,
      h('div', { class: 'style-label' }, 'Keys down now'),
      h('div', { class: 'piano-keys' }, down.length ? keyList(down, /b|F|♭/.test(chord?.symbol ?? '')) : '—'),
      h('div', { class: 'style-label' }, 'That chord is'),
      h('div', { class: 'piano-chord' }, chord ? chord.symbol : down.length >= 3 ? 'not a chord the app knows' : down.length ? 'press at least three keys' : '—'),
      chord && identifyChord(down).length > 1 && h('p', { class: 'muted small' }, `Could also be called ${identifyChord(down).slice(1, 4).map(c => c.symbol).join(', ')}`));
    syncLiveKeys(board);
  }

  piano.on(e => {
    if (e.type === 'status') drawStatus();
    if (e.type === 'on') {
      history.unshift(keyList([e.midi]));
      history.length = Math.min(history.length, 12);
      fill(log, history.map(t => h('li', {}, t)));
    }
    if (e.type === 'on' || e.type === 'off' || e.type === 'status') drawNow();
  });

  const el = h('div', { class: 'view' }, statusBox, nowBox, h('div', { class: 'card' }, h('div', { class: 'style-label' }, 'The keys (C2 to C7)'), board),
    h('div', { class: 'card' }, h('div', { class: 'style-label' }, 'Last keys you pressed'), log));
  drawStatus();
  drawNow();
  return { el, onShow: () => { drawStatus(); drawNow(); } };
}
