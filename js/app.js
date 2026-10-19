// App shell: tabs, shared-song links, offline support.

import { h, toast } from './dom.js';
import { unlock } from './audio.js';
import { settings, saveSettings } from './store.js';
import { chordsView } from './views/chords.js';
import { songsView, decodeSongs } from './views/songs.js';
import { quizView } from './views/quiz.js';
import { styleBar } from './style.js';

const ICONS = {
  chords: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.8 4v16M15.2 4v16" stroke="currentColor" stroke-width="1.8"/><rect x="7.2" y="4" width="3.2" height="9" rx="1" fill="currentColor"/><rect x="13.6" y="4" width="3.2" height="9" rx="1" fill="currentColor"/></svg>',
  songs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l11-2v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="17.5" cy="16" r="2.5" fill="currentColor"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="14" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 3h11.5A2.5 2.5 0 0 1 21 5.5V17" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7.5 13.5l2 2 4-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const views = { chords: chordsView(), songs: songsView(), quiz: quizView() };
const labels = { chords: 'Chords', songs: 'Songs', quiz: 'Quiz' };
const main = document.getElementById('main');
const tabs = document.getElementById('tabs');

for (const [name, view] of Object.entries(views)) {
  view.el.id = `view-${name}`;
  view.el.hidden = true;
  main.append(view.el);
  const btn = h('button', { type: 'button', 'data-tab': name, 'aria-controls': view.el.id, onclick: () => show(name) });
  btn.innerHTML = ICONS[name];
  btn.append(h('span', {}, labels[name]));
  tabs.append(btn);
}

document.querySelector('.app-header').after(styleBar());

let current = null;

function show(name) {
  if (!views[name]) name = 'chords';
  if (current && current !== name) views[current].onHide?.(); // e.g. stop the metronome
  current = name;
  for (const [n, v] of Object.entries(views)) v.el.hidden = n !== name;
  tabs.querySelectorAll('button').forEach(b => b.toggleAttribute('aria-current', b.dataset.tab === name));
  tabs.querySelector('[aria-current]')?.setAttribute('aria-current', 'page');
  settings.tab = name;
  saveSettings();
  views[name].onShow?.();
  window.scrollTo(0, 0);
}

// A shared link looks like …/#import=<data>
function handleImport() {
  const m = location.hash.match(/^#import=(.+)$/);
  if (!m) return false;
  history.replaceState(null, '', location.pathname + location.search);
  show('songs');
  try {
    views.songs.importSongs(decodeSongs(decodeURIComponent(m[1])));
  } catch {
    toast("Couldn't read that song link.");
  }
  return true;
}

if (!handleImport()) show(settings.tab);
window.addEventListener('hashchange', handleImport);

// iOS only allows sound after the first tap.
document.addEventListener('pointerdown', unlock, { once: true });

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
