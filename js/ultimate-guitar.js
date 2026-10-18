// Ultimate Guitar import. Browsers don't let this app download UG pages itself, so instead a bookmark
// ("bookmarklet") runs on the UG song page you're viewing, reads its chords, and opens this app with them.

import { h, toast } from './dom.js';

export const isUgUrl = url => /^https?:\/\/([a-z]+\.)?ultimate-guitar\.com\/.+/i.test(String(url).trim());

/** Same page link without tracking bits, so the same song is recognised again. */
export const cleanUrl = url => String(url).trim().split(/[?#]/)[0];

// Runs on the UG page. UG keeps the song data in window.UGAPP.store (and, before its scripts run, in a
// JSON blob in div.js-store). If that ever changes, fall back to the visible chord sheet text,
// which the song parser can also read.
function bookmarklet() {
  try {
    const blob = document.querySelector('.js-store');
    const store = (window.UGAPP && window.UGAPP.store) || (blob && JSON.parse(blob.dataset.content).store);
    const data = store && store.page && store.page.data;
    const wiki = data && data.tab_view && data.tab_view.wiki_tab;
    let song;
    if (wiki) {
      const tab = data.tab || {};
      song = { t: `${tab.song_name} (${tab.artist_name})`, ug: wiki.content, src: location.href.split(/[?#]/)[0], key: tab.tonality_name || '', capo: tab.capo || 0 };
    } else {
      const text = [...document.querySelectorAll('pre')].map(e => e.innerText).join('\n');
      if (!text) return alert('Chord Coach: no chords found on this page. Open a song "Chords" page first.');
      song = { t: document.title.replace(/\s*chords.*$/i, ''), c: text, src: location.href.split(/[?#]/)[0] };
    }
    const data64 = btoa(unescape(encodeURIComponent(JSON.stringify([song]))));
    location.href = '__APP__#import=' + encodeURIComponent(data64);
  } catch (e) {
    alert('Chord Coach could not read this page: ' + e.message);
  }
}

export function bookmarkletUrl() {
  const app = location.origin + location.pathname;
  const code = `(${bookmarklet.toString()})()`.replace('__APP__', app).replace(/\n\s*/g, ' ');
  return 'javascript:' + encodeURIComponent(code);
}

/**
 * Go to an Ultimate Guitar song page (in this tab, so the bookmark brings you straight back here),
 * or open your copy if you already imported it.
 */
export function openUgLink(url, songs, openSong) {
  const existing = songs.find(s => s.source && cleanUrl(s.source) === cleanUrl(url));
  if (existing && window.confirm(`You already have “${existing.title}”. Open it?\n\n(Cancel goes to Ultimate Guitar so you can import it again.)`)) {
    return openSong(existing);
  }
  if (!window.confirm('Opening the song on Ultimate Guitar.\n\nWhen it has loaded, press your “Send to Chord Coach” bookmark to bring the chords back here.')) return;
  location.href = url.trim();
}

/** The "Add songs from Ultimate Guitar" panel on the song list. */
export function ugPanel(songs, openSong) {
  const href = bookmarkletUrl();
  const link = h('input', {
    class: 'input',
    type: 'url',
    inputmode: 'url',
    placeholder: 'https://tabs.ultimate-guitar.com/tab/…',
    'aria-label': 'Ultimate Guitar link',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    onkeydown: e => e.key === 'Enter' && open(),
  });

  const open = () => {
    const url = link.value.trim();
    if (!isUgUrl(url)) return toast('Paste a link from ultimate-guitar.com');
    openUgLink(url, songs, openSong);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(decodeURIComponent(href));
      toast('Code copied. Now paste it as the bookmark address.');
    } catch {
      window.prompt('Copy this code:', decodeURIComponent(href));
    }
  };

  return h('details', { class: 'card ug-panel', open: !songs.some(s => s.source) },
    h('summary', {}, 'Add songs from Ultimate Guitar'),
    h('ol', { class: 'steps' },
      h('li', {},
        h('strong', {}, 'Set up the button (once on each device).'),
        h('div', { class: 'step-body' },
          h('p', {}, h('b', {}, 'Mac: '), 'drag this button onto your bookmarks bar (show the bar with ⌘ Shift B):'),
          h('a', {
            class: 'btn primary bookmarklet',
            href,
            title: 'Drag me to your bookmarks bar',
            onclick: e => { e.preventDefault(); toast('Drag this button to your bookmarks bar, then use it on Ultimate Guitar.'); },
          }, '♪ Send to Chord Coach'),
          h('p', {}, h('b', {}, 'iPhone (Safari): '),
            'tap ', h('button', { type: 'button', class: 'btn small', onclick: copyCode }, 'Copy code'),
            ', then bookmark any page (Share → Add Bookmark). Open Bookmarks → Edit, tap that bookmark, name it ',
            h('i', {}, 'Send to Chord Coach'), ' and replace its address with the copied code.'))),
      h('li', {},
        h('strong', {}, 'Open the song on Ultimate Guitar.'),
        h('div', { class: 'step-body' },
          h('p', { class: 'muted small' }, 'Search there, or paste a song link here:'),
          h('div', { class: 'row' }, link, h('button', { type: 'button', class: 'btn', onclick: open }, 'Open')))),
      h('li', {},
        h('strong', {}, 'On the song page, tap “Send to Chord Coach”.'),
        h('div', { class: 'step-body muted small' },
          'You come back here with the chords and sections added. Lyrics and guitar tabs are left out, ',
          'and if the guitar uses a capo, the chords are raised so they match the recording. ',
          'Sending a song again updates your copy.'))),
    h('p', { class: 'muted small' }, 'If you move the app to a new address (for example when it goes online), set up the button again.'));
}
