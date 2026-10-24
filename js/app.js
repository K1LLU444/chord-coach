// App shell: tabs, shared-song links, offline support.

import { h, toast, toggle } from './dom.js';
import { settings, saveSettings } from './store.js';
import { chordsView } from './views/chords.js';
import { songsView, decodeSongs } from './views/songs.js';
import { quizView } from './views/quiz.js';
import { sheetsView } from './views/sheets.js';
import { makerView } from './views/maker.js';
import { pianoView } from './views/piano.js';
import { piano } from './midi.js';
import { startLiveKeys } from './live-keys.js';
import { playNote, unlock, setMixing } from './audio.js';
import { styleBar } from './style.js';
import { volumeControl } from './volume.js';

const ICONS = {
  chords: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.8 4v16M15.2 4v16" stroke="currentColor" stroke-width="1.8"/><rect x="7.2" y="4" width="3.2" height="9" rx="1" fill="currentColor"/><rect x="13.6" y="4" width="3.2" height="9" rx="1" fill="currentColor"/></svg>',
  songs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l11-2v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="17.5" cy="16" r="2.5" fill="currentColor"/></svg>',
  sheets: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  maker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14.5 6.5l3 3" stroke="currentColor" stroke-width="1.8"/></svg>',
  piano: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 6v12M12 6v12M17 6v12" stroke="currentColor" stroke-width="1.4"/><rect x="5.5" y="6" width="3" height="7" fill="currentColor"/><rect x="10.5" y="6" width="3" height="7" fill="currentColor"/><rect x="15.5" y="6" width="3" height="7" fill="currentColor"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="14" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 3h11.5A2.5 2.5 0 0 1 21 5.5V17" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7.5 13.5l2 2 4-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const views = { chords: chordsView(), songs: songsView(), maker: makerView(), piano: pianoView(), quiz: quizView(), sheets: sheetsView() };
const labels = { chords: 'Chords', songs: 'Songs', maker: 'Maker', piano: 'Piano', quiz: 'Quiz', sheets: 'Sheets' };
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
document.querySelector('.app-header').insertBefore(volumeControl(), tabs); // volume sits next to the title, on every tab

let current = null;

function show(name) {
  if (!views[name]) name = 'chords';
  if (current && current !== name) views[current].onHide?.(); // e.g. stop the metronome
  current = name;
  document.body.dataset.tab = name; // lets the stylesheet hide the playing-style bar on the Sheets tab
  for (const [n, v] of Object.entries(views)) v.el.hidden = n !== name;
  tabs.querySelectorAll('button').forEach(b => b.toggleAttribute('aria-current', b.dataset.tab === name));
  tabs.querySelector('[aria-current]')?.setAttribute('aria-current', 'page');
  settings.tab = name;
  saveSettings();
  views[name].onShow?.();
  window.scrollTo(0, 0);
}

// Other screens can ask to move to a tab (the Maker's “Sheet to print” button does).
window.addEventListener('gototab', e => show(e.detail));

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

// The version this device is running (the name of its saved offline copy), and a button that clears it.
const versionLabel = h('span', { class: 'app-version' });
async function showVersion() {
  try {
    const name = (await caches.keys()).find(k => k.startsWith('chord-coach-'));
    versionLabel.textContent = name ? `Version ${name.slice('chord-coach-'.length, 'chord-coach-'.length + 7)}` : 'Not saved offline yet';
  } catch {
    versionLabel.textContent = '';
  }
}
async function refreshApp() {
  toast('Refreshing…');
  try {
    if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k); // songs and progress are not touched
  } catch {}
  location.reload();
}
setMixing(Boolean(settings.mixAudio));
main.after(h('footer', { class: 'app-foot' },
  toggle('Let videos and streams keep playing (mix with them; the phone’s silent switch then mutes this app)', Boolean(settings.mixAudio), v => { settings.mixAudio = v; saveSettings(); setMixing(v); toast(v ? 'Mixing with other sound. Sound will follow the phone’s silent switch.' : 'Normal sound.'); }),
  versionLabel, h('button', { type: 'button', class: 'link-btn', onclick: refreshApp }, 'Refresh app')));
showVersion();
window.addEventListener('load', () => setTimeout(showVersion, 1500));

if (!handleImport()) show(settings.tab);
window.addEventListener('hashchange', handleImport);

// The real piano (USB): keys light up on every keyboard, and the app can make its own sound when a key is pressed.
startLiveKeys();
piano.on(e => { if (e.type === 'on' && settings.pianoSound) playNote(e.midi, 0, 1.6, Math.max(0.3, e.velocity)); });
if (settings.pianoAuto) piano.start(); // allowed once before, so no question this time
const pianoLabel = h('span', { class: 'app-version' });
piano.on(e => { if (e.type === 'status') pianoLabel.textContent = e.connected ? `🎹 ${e.names.join(', ')}` : ''; });
versionLabel.after(pianoLabel);

// iOS only allows sound after the first tap.
document.addEventListener('pointerdown', unlock, { once: true });

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // When a new version takes over, offer to reload (the page is still running the old files until then).
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || document.querySelector('.update-banner')) return; // first install: nothing to update
    document.body.append(h('div', { class: 'update-banner', role: 'status' },
      h('span', {}, 'A new version is ready.'),
      h('button', { type: 'button', class: 'btn small primary', onclick: () => location.reload() }, 'Reload')));
    showVersion();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    // Look for a new version now and whenever the app comes back to the screen (an installed iPhone app may stay open for days).
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
