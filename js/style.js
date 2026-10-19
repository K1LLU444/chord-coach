// The "Playing style" switch shared by every tab (how the two hands share a chord).

import { h, segmented } from './dom.js';
import { STYLES } from './theory.js';
import { settings, saveSettings } from './store.js';

export const currentStyle = () => (STYLES.some(s => s.id === settings.style) ? settings.style : 'bass');

export const styleInfo = () => STYLES.find(s => s.id === currentStyle());

/** "C → G → C" when a hand plays one key at a time, "C + E + G" when it plays them together. */
export const handText = (hand, label) => hand.notes.map(label).join(hand.together ? ' + ' : ' → ');

/** The bar under the header. Changing it tells every tab (they listen for "stylechange"). */
export function styleBar() {
  const blurb = h('p', { class: 'style-blurb' });
  const describe = () => { blurb.textContent = styleInfo().blurb; };
  describe();
  const switcher = segmented(STYLES.map(s => [s.id, s.name]), currentStyle(), v => {
    settings.style = v;
    saveSettings();
    window.dispatchEvent(new Event('stylechange'));
  }, 'Playing style');
  // Keep the buttons and the sentence in step when the style is changed from somewhere else.
  window.addEventListener('stylechange', () => {
    switcher.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === currentStyle())));
    describe();
  });
  return h('div', { class: 'style-bar' },
    h('div', { class: 'style-row' }, h('span', { class: 'style-label' }, 'Playing style'), switcher),
    blurb);
}
