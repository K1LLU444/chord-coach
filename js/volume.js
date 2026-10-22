// The volume control in the header: a speaker button (mute) and a slider.

import { h } from './dom.js';
import { settings, saveSettings } from './store.js';
import { setVolume, playNote } from './audio.js';

export const applySavedVolume = () => setVolume((Number(settings.volume) || 0) / 100, Boolean(settings.muted));

const icon = (volume, muted) => (muted || volume === 0 ? '🔇' : volume < 40 ? '🔈' : volume < 75 ? '🔉' : '🔊');

export function volumeControl() {
  const label = h('span', { class: 'vol-label', 'aria-hidden': 'true' });
  const button = h('button', {
    type: 'button',
    class: 'vol-btn',
    onclick: () => { settings.muted = !settings.muted; sync(); },
  });
  const slider = h('input', {
    type: 'range', min: 0, max: 100, step: 1, 'aria-label': 'Volume',
    oninput: e => { settings.volume = +e.target.value; settings.muted = false; sync(); },
    // When you let go of the slider, a short note plays so you can hear the new level.
    onchange: () => playNote(60, 0, 0.6, 0.6),
  });

  function sync() {
    const off = settings.muted || settings.volume === 0;
    slider.value = settings.volume;
    label.textContent = off ? 'Silent' : `${settings.volume}%`;
    button.textContent = icon(settings.volume, settings.muted);
    button.setAttribute('aria-label', off ? 'Silent: no sound is made. Tap to turn sound on' : 'Sound is on. Tap for silent mode');
    button.title = off ? 'Silent mode: the app makes no sound and does not touch your device’s audio, so videos and streams are not interrupted. Tap to turn sound on.' : 'Tap for silent mode (no sound at all, so videos and streams are not interrupted)';
    button.setAttribute('aria-pressed', String(off));
    applySavedVolume();
    saveSettings();
  }

  sync();
  return h('div', { class: 'volume' }, button, slider, label);
}
