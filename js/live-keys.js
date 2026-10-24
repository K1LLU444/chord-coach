// Show the keys of the real piano on every keyboard drawn in the app: a key that is down gets the "live" class.

import { piano } from './midi.js';

/** Mark the keys that are down on every keyboard on the page. Called on every note and whenever a keyboard is redrawn. */
export function syncLiveKeys(root = document) {
  const down = new Set(piano.pressed.keys());
  root.querySelectorAll('.key[data-midi]').forEach(key => key.classList.toggle('live', down.has(+key.dataset.midi)));
}

export function startLiveKeys() {
  piano.on(e => { if (e.type === 'on' || e.type === 'off' || e.type === 'status') syncLiveKeys(); });
  // keyboards that are drawn while keys are held pick the keys up straight away
  new MutationObserver(() => { if (piano.pressed.size) syncLiveKeys(); }).observe(document.body, { childList: true, subtree: true });
}
