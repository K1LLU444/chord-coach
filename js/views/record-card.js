// "Record by playing": count in, then play on the real piano; the notes become bars of a hand.

import { h, fill, segmented, toast } from '../dom.js';
import { piano } from '../midi.js';
import { startMetronome } from '../player.js';
import { pulseSeconds } from '../rhythm.js';
import { quantizeRecording } from '../recorder.js';
import { isSilent } from '../audio.js';

/**
 * getFeel() → { pulses, group, bpm, hits }, getBpm() → the tempo to record at, sub() → grid steps per pulse,
 * startBar() → first bar (0-based), barsLeft() → how many bars there are from there on,
 * lanes = [{ id, title, has(from, count) → true when those bars already hold notes }],
 * apply(laneId, bars, from) puts the recorded bars in. Returns { el, refresh }.
 */
export function recordCard({ getFeel, getBpm, sub, startBar, barsLeft, lanes, apply, defaultLane = lanes.at(-1).id }) {
  const el = h('section', { class: 'card record-card' });
  let lane = defaultLane;
  let howMany = 4;
  let session = null;

  function stop(early = true) {
    if (!session) return;
    const s = session;
    session = null;
    clearInterval(s.timer);
    s.metronome.stop();
    s.off();
    const now = performance.now();
    for (const [midi, t] of s.down) s.events.push({ midi, on: t, off: now });
    const step = s.step;
    const events = s.origin == null ? [] : s.events.map(e => ({ midi: e.midi, start: (e.on - s.origin) / step - s.pulses, end: (e.off - s.origin) / step - s.pulses }));
    const result = quantizeRecording(events, { pulses: s.pulses, sub: sub(), maxBars: s.bars });
    if (!result.notes) {
      s.status.textContent = early ? 'Stopped. No notes were played.' : 'No notes were heard. Check that the piano is connected and press keys after the count-in.';
      draw();
      return;
    }
    const target = lanes.find(l => l.id === lane);
    if (target.has(s.from, s.bars) && !window.confirm(`Replace the ${target.title.toLowerCase()} notes in bars ${s.from + 1} to ${s.from + s.bars} with what you played?`)) {
      s.status.textContent = 'Kept what was there. The recording was thrown away.';
      draw();
      return;
    }
    apply(lane, result.bars, s.from, s.bars);
    toast(`Recorded ${result.notes} note${result.notes === 1 ? '' : 's'}${result.dropped ? ` (${result.dropped} left out: chords keep only their top key)` : ''}.`);
    draw();
  }

  function start() {
    if (session) return stop();
    if (!piano.state.connected) return toast('Connect your piano first (Piano tab).');
    const feel = getFeel();
    const bpm = getBpm();
    const bars = Math.max(1, Math.min(howMany, barsLeft()));
    if (barsLeft() < 1) return toast('There are no bars left from here. Pick an earlier bar or add bars.');
    const status = el.querySelector('.record-status');
    const s = { events: [], down: new Map(), origin: null, pulses: feel.pulses, step: pulseSeconds(feel, bpm) * 1000, bars, from: startBar(), status };
    s.off = piano.on(e => {
      if (e.type === 'on') s.down.set(e.midi, e.time);
      else if (e.type === 'off' && s.down.has(e.midi)) { s.events.push({ midi: e.midi, on: s.down.get(e.midi), off: e.time }); s.down.delete(e.midi); }
    });
    s.metronome = startMetronome({ feel, bpm, everyPulse: true, onPulse: pulse => { if (s.origin == null && pulse === 0) s.origin = performance.now(); } });
    s.timer = setInterval(() => {
      if (s.origin == null) return;
      const at = (performance.now() - s.origin) / s.step; // pulses since the count-in began
      if (at < s.pulses) status.textContent = `Count-in… get ready (${Math.ceil((s.pulses - at) / feel.group)})`;
      else status.textContent = `Recording bar ${Math.min(bars, Math.floor((at - s.pulses) / s.pulses) + 1)} of ${bars}: play now`;
      if (at >= s.pulses * (bars + 1)) stop(false);
    }, 60);
    session = s;
    draw();
  }

  function draw() {
    const connected = piano.state.connected;
    fill(el,
      h('h3', {}, '● Record by playing'),
      h('p', { class: 'muted small' }, 'Press Record: a bar of clicks counts you in, then play the tune on your piano, one note at a time (if you press a chord, only the top key is kept). Your playing is rounded to the nearest count, so play steadily. Sound the metronome click needs sound on.'),
      lanes.length > 1 && segmented(lanes.map(l => [l.id, l.title]), lane, v => { lane = v; }, 'Record into'),
      h('div', { class: 'row wrap' },
        h('span', { class: 'muted small' }, `From bar ${startBar() + 1} (the bar you have selected)`),
        h('label', { class: 'row small' }, h('span', { class: 'muted' }, 'for'),
          h('input', { class: 'input start-input', type: 'number', min: 1, max: Math.max(1, barsLeft()), value: Math.min(howMany, Math.max(1, barsLeft())), 'aria-label': 'Bars to record', onchange: e => { howMany = Math.max(1, Math.round(Number(e.target.value)) || 4); } }),
          h('span', { class: 'muted' }, 'bars'))),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: `btn ${session ? '' : 'primary'}`, disabled: !connected && !session, onclick: start }, session ? '■ Stop recording' : '● Record'),
        !connected && h('span', { class: 'muted small' }, 'Connect your piano in the Piano tab first.'),
        isSilent() && h('span', { class: 'warn' }, 'Silent mode is on, so you will not hear the click.')),
      h('p', { class: 'muted small record-status', 'aria-live': 'polite' }));
  }

  piano.on(e => { if (e.type === 'status' && !session) draw(); });
  draw();
  return { el, refresh: () => { if (!session) draw(); } };
}
