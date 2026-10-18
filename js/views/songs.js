// Songs tab: save chord progressions, then step (or hover) through them on the keyboard.

import { h, fill, toast, toggle } from '../dom.js';
import { parseSong, smoothVoicings, rhVoicing, lhPattern, noteLabeler, inversionName, ugToText } from '../theory.js';
import { renderBoard } from '../keyboard.js';
import { playNote, playBoth } from '../audio.js';
import { settings, saveSettings, loadSongs, saveSongs, uid } from '../store.js';
import { hand } from './chords.js';
import { ugPanel, openUgLink, cleanUrl, isUgUrl } from '../ultimate-guitar.js';

const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

const PLACEHOLDER = `Type or paste chords, for example:

[Verse]
C G Am F

[Chorus]
F C G G

Chords written above lyrics work too: lyric lines are skipped.`;

// Share links carry songs in the URL hash, so nothing is uploaded anywhere.
function encodeSongs(list) {
  const json = JSON.stringify(list.map(s => ({ t: s.title, c: s.text, src: s.source, n: s.note })));
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeSongs(data) {
  const parsed = JSON.parse(decodeURIComponent(escape(atob(data))));
  return (Array.isArray(parsed) ? parsed : [parsed])
    .filter(s => s && (typeof s.c === 'string' || typeof s.ug === 'string'))
    .map(s => {
      const song = { title: String(s.t || 'Untitled song'), text: s.c ?? ugToText(s.ug, Number(s.capo) || 0) };
      if (s.src) song.source = String(s.src);
      const note = s.n ?? [s.key && `Key: ${s.key}`, s.capo > 0 && `Guitar capo ${s.capo}: chords raised ${s.capo} semitone${s.capo > 1 ? 's' : ''} to match the recording`].filter(Boolean).join(' · ');
      if (note) song.note = note;
      return song;
    });
}

function shareUrl(list) {
  return `${location.origin}${location.pathname}#import=${encodeURIComponent(encodeSongs(list))}`;
}

async function share(list, title) {
  const url = shareUrl(list);
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied. Open it on your other device.');
  } catch {
    window.prompt('Copy this link:', url);
  }
}

export function songsView() {
  let songs = loadSongs();
  let mode = 'list';
  let keyHandler = null;
  const el = h('div', { class: 'view' });

  const persist = () => saveSongs(songs);

  function show(next, song) {
    mode = next;
    keyHandler = null;
    el.replaceChildren(next === 'list' ? listUI() : next === 'edit' ? editUI(song) : playerUI(song));
    window.scrollTo(0, 0);
  }

  // Another tab (e.g. one the bookmark opened) changed the song list: reload it so nothing gets overwritten.
  window.addEventListener('storage', e => {
    if (e.key !== 'chordcoach.songs') return;
    songs = loadSongs();
    if (mode === 'list') show('list');
  });

  document.addEventListener('keydown', e => {
    if (!keyHandler || el.closest('[hidden]')) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    keyHandler(e);
  });

  // Songs that came from the same page link replace the old copy instead of being added twice.
  function importSongs(list) {
    if (!list.length) return;
    const sameSource = s => s.source && songs.find(x => x.source && cleanUrl(x.source) === cleanUrl(s.source));
    const updates = list.filter(sameSource);
    const names = list.map(s => `“${s.title}”${sameSource(s) ? ' (update)' : ''}`).join(', ');
    const question = list.length === 1 && updates.length ? 'Update this song with the latest chords?' : `Add ${list.length === 1 ? 'this song' : list.length + ' songs'} to your library?`;
    if (!window.confirm(`${question}\n\n${names}`)) return;
    const result = list.map((s, i) => {
      const existing = sameSource(s);
      if (existing) return Object.assign(existing, s, { updated: Date.now() + i });
      const added = { id: uid(), ...s, updated: Date.now() + i };
      songs.push(added);
      return added;
    });
    persist();
    result.length === 1 ? show('play', result[0]) : show('list');
    const added = result.length - updates.length;
    toast([added && `Added ${added} song${added === 1 ? '' : 's'}`, updates.length && `Updated ${updates.length}`].filter(Boolean).join(' · '));
  }

  // Accepts a Chord Coach share link, or an Ultimate Guitar song link.
  function importFromPaste() {
    const text = window.prompt('Paste a song link (from Chord Coach “Share”, or from Ultimate Guitar):');
    if (!text) return;
    const ug = text.match(/https?:\/\/\S*ultimate-guitar\.com\/\S+/i);
    if (ug && !text.includes('#import=')) return openUgLink(ug[0], songs, s => show('play', s));
    const m = text.match(/#import=([^\s]+)/);
    try {
      importSongs(decodeSongs(decodeURIComponent(m ? m[1] : text.trim())));
    } catch {
      toast('That link isn’t a Chord Coach or Ultimate Guitar song link.');
    }
  }

  function listUI() {
    const sorted = [...songs].sort((a, b) => b.updated - a.updated);
    return h('div', {},
      h('div', { class: 'row between' },
        h('h2', {}, 'Your songs'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => show('edit', null) }, '+ New song')),
      sorted.length
        ? h('ul', { class: 'song-list' }, sorted.map(s => {
          const p = parseSong(s.text);
          const unique = [...new Set(p.chords.map(c => c.symbol))];
          return h('li', {}, h('button', { type: 'button', class: 'song-item card', onclick: () => show('play', s) },
            h('span', { class: 'song-title' }, s.title, s.source && h('span', { class: 'badge', title: 'From Ultimate Guitar' }, 'UG')),
            h('span', { class: 'song-preview' },
              unique.slice(0, 8).join(' · ') + (unique.length > 8 ? ' …' : ''),
              h('span', { class: 'muted' }, ` · ${p.chords.length} chords`))));
        }))
        : h('p', { class: 'empty' }, 'No songs yet. Tap “New song” and paste the chords of a song you like.'),
      ugPanel(songs, s => show('play', s)),
      h('div', { class: 'row wrap' },
        songs.length > 0 && h('button', { type: 'button', class: 'btn small', onclick: () => share(songs, 'My songs') }, 'Share all songs'),
        h('button', { type: 'button', class: 'btn small', onclick: importFromPaste }, 'Import from link')),
      h('p', { class: 'muted small' },
        'Songs are saved on this device. To copy them to your iPhone or Mac, use “Share all songs” and open the link there. ' +
        'If you added the app to your iPhone home screen, use “Import from link” inside the app.'));
  }

  function editUI(song) {
    const title = h('input', { class: 'input', placeholder: 'Song title', value: song?.title || '', 'aria-label': 'Song title' });
    const source = h('input', {
      class: 'input', type: 'url', inputmode: 'url', placeholder: 'Link to the chord sheet (optional)',
      value: song?.source || '', 'aria-label': 'Link to the chord sheet', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
    });
    const text = h('textarea', {
      class: 'input mono',
      rows: 12,
      placeholder: PLACEHOLDER,
      value: song?.text || '',
      'aria-label': 'Chords',
      spellcheck: 'false',
      autocapitalize: 'off',
      autocorrect: 'off',
      oninput: () => updatePreview(),
    });
    const preview = h('div', { class: 'preview' });

    function updatePreview() {
      const p = parseSong(text.value);
      fill(preview, 
        h('div', { class: 'muted small' },
          `${p.chords.length} chord${p.chords.length === 1 ? '' : 's'} found`,
          p.ignored ? ` · ${p.ignored} lyric line${p.ignored === 1 ? '' : 's'} skipped` : ''),
        h('div', { class: 'chips' }, p.chords.map(c => h('span', { class: 'chip static' }, c.symbol))),
        p.unknown.length > 0 && h('p', { class: 'warn' }, `Couldn't read: ${p.unknown.join(', ')}`),
        p.simplified.length > 0 && h('p', { class: 'muted small' }, `Simplified: ${p.simplified.join(', ')}`));
    }

    function saveSong() {
      const t = title.value.trim() || 'Untitled song';
      const link = source.value.trim();
      if (link && !/^https?:\/\//i.test(link)) return toast('The link should start with https://');
      if (song) song = songs.find(x => x.id === song.id) || (songs.push(song), song); // list may have reloaded
      if (song) Object.assign(song, { title: t, text: text.value, updated: Date.now() });
      else songs.push((song = { id: uid(), title: t, text: text.value, updated: Date.now() }));
      if (link) song.source = link;
      else delete song.source;
      persist();
      show('play', song);
    }

    function remove() {
      if (!window.confirm(`Delete “${song.title}”?`)) return;
      songs = songs.filter(s => s !== song);
      persist();
      show('list');
    }

    updatePreview();
    return h('div', { class: 'editor' },
      h('div', { class: 'row between' },
        h('button', { type: 'button', class: 'btn small', onclick: () => (song ? show('play', song) : show('list')) }, 'Cancel'),
        h('h2', {}, song ? 'Edit song' : 'New song'),
        h('button', { type: 'button', class: 'btn small primary', onclick: saveSong }, 'Save')),
      title,
      source,
      text,
      preview,
      h('details', { class: 'help' },
        h('summary', {}, 'What can I paste?'),
        h('ul', {},
          h('li', {}, 'Chords separated by spaces, commas or bars: ', h('code', {}, 'C G Am F'), ' or ', h('code', {}, '| C | G | Am | F |')),
          h('li', {}, 'Section names on their own line: ', h('code', {}, '[Chorus]'), ' or ', h('code', {}, 'Verse 1:')),
          h('li', {}, 'Chords written above lyrics, copied from a chord website'),
          h('li', {}, 'ChordPro style: ', h('code', {}, '[C]Let it [G]be')),
          h('li', {}, 'Slash chords like ', h('code', {}, 'C/E'), ' (the left hand plays the note after the slash)'))),
      song && h('button', { type: 'button', class: 'btn danger', onclick: remove }, 'Delete song'));
  }

  function playerUI(song) {
    const p = parseSong(song.text);
    const header = h('div', { class: 'row between player-head' },
      h('button', { type: 'button', class: 'btn small', onclick: () => show('list') }, '‹ Songs'),
      h('h2', { class: 'song-name' }, song.title),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn small', onclick: () => share([song], song.title) }, 'Share'),
        h('button', { type: 'button', class: 'btn small', onclick: () => show('edit', song) }, 'Edit')),
      (song.source || song.note) && h('div', { class: 'source-line' },
        song.note && h('span', { class: 'muted small' }, song.note),
        song.source && h('a', { class: 'btn small', href: song.source, target: '_blank', rel: 'noopener' },
          isUgUrl(song.source) ? 'Open on Ultimate Guitar ↗' : 'Open original ↗')));

    if (!p.chords.length) {
      return h('div', {}, header, h('p', { class: 'empty' }, 'No chords found in this song yet. Tap Edit to add some.'));
    }

    let idx = 0;
    const computeVoicings = () =>
      (settings.smooth ? smoothVoicings(p.chords) : p.chords.map(c => ({ k: 0, notes: rhVoicing(c, 0) })));
    let voicings = computeVoicings();

    const now = h('div', { class: 'now' });
    const board = h('div', { class: 'board swipe' });
    const counter = h('span', { class: 'counter' });
    const chipsEl = h('div', { class: 'song-chips' });
    const chipEls = [];

    const sections = [...p.sections].sort((a, b) => a.start - b.start);
    const sectionAt = i => sections.filter(s => s.start <= i).at(-1)?.name;
    let s = 0;
    p.chords.forEach((c, i) => {
      for (; s < sections.length && sections[s].start === i; s++) {
        chipsEl.append(h('div', { class: 'section-label' }, sections[s].name));
      }
      const chip = h('button', {
        type: 'button',
        class: 'chip',
        'data-i': i,
        onclick: () => go(i),
        onmouseenter: () => canHover() && go(i),
      }, c.symbol);
      chipEls.push(chip);
      chipsEl.append(chip);
    });

    const playCurrent = () => playBoth(lhPattern(p.chords[idx]), voicings[idx].notes);

    function go(i, scroll = false) {
      const next = Math.max(0, Math.min(p.chords.length - 1, i));
      if (next === idx && now.childElementCount) return;
      idx = next;
      update();
      if (scroll) chipEls[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (settings.soundOnChange) playCurrent();
    }

    function update() {
      const c = p.chords[idx];
      const v = voicings[idx];
      const lh = lhPattern(c);
      const label = noteLabeler(c);
      const nextChord = p.chords[idx + 1];
      const ghosts = settings.ghost && nextChord ? [...lhPattern(nextChord), ...voicings[idx + 1].notes] : [];
      const sub = [sectionAt(idx), settings.smooth && c.pcs.length > 1 ? inversionName(v.k) : null].filter(Boolean).join(' · ');

      now.replaceChildren(
        h('div', { class: 'result-head' },
          h('div', { class: 'symbol' }, c.symbol),
          h('div', {},
            h('div', { class: 'long' }, c.name),
            sub && h('div', { class: 'muted small' }, sub)),
          h('div', { class: 'next' }, nextChord ? ['Next', h('strong', {}, nextChord.symbol)] : ['Last', h('strong', {}, '—')])),
        h('div', { class: 'hands compact' },
          hand('lh', 'Left', lh.map(label).join(' → '), () => playBoth(lh, [])),
          hand('rh', 'Right', v.notes.map(label).join(' + '), () => playBoth([], v.notes))));
      renderBoard(board, { lh, rh: v.notes, ghosts, label, showAll: settings.showAll, onKey: m => playNote(m), overview: false });
      counter.textContent = `${idx + 1} / ${p.chords.length}`;
      chipEls.forEach((b, i) => b.classList.toggle('active', i === idx));
    }

    // Swipe left/right on the keyboard to change chord.
    let swipe = null;
    board.addEventListener('pointerdown', e => (swipe = { x: e.clientX, y: e.clientY }));
    board.addEventListener('pointerup', e => {
      if (!swipe) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 50 && Math.abs(dy) < 40) go(idx + (dx < 0 ? 1 : -1), true);
    });

    // On touch screens, sliding a finger across the chord chips works like hovering.
    let scrubbing = false;
    chipsEl.addEventListener('pointerdown', e => (scrubbing = e.pointerType === 'touch'));
    chipsEl.addEventListener('pointermove', e => {
      if (!scrubbing) return;
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.chip[data-i]');
      if (t) go(+t.dataset.i);
    });
    for (const ev of ['pointerup', 'pointercancel']) chipsEl.addEventListener(ev, () => (scrubbing = false));

    keyHandler = e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(idx + 1, true);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(idx - 1, true);
      else if (e.key === 'Home') go(0, true);
      else if (e.key === 'End') go(p.chords.length - 1, true);
      else if (e.key === ' ' || e.key === 'Enter') playCurrent();
      else return;
      e.preventDefault();
    };

    const tip = canHover()
      ? 'Hover over the chords below, or use ← → arrow keys. Space plays the chord.'
      : 'Tap a chord, swipe the keyboard, or slide your finger along the chords.';

    const view = h('div', { class: 'player' },
      header,
      h('div', { class: 'player-top' },
        now,
        board,
        h('div', { class: 'row between controls' },
          h('button', { type: 'button', class: 'btn', 'aria-label': 'Previous chord', onclick: () => go(idx - 1, true) }, '◀ Prev'),
          counter,
          h('button', { type: 'button', class: 'btn primary', onclick: playCurrent }, '▶ Play'),
          h('button', { type: 'button', class: 'btn', 'aria-label': 'Next chord', onclick: () => go(idx + 1, true) }, 'Next ▶'))),
      h('p', { class: 'muted small tip' }, tip),
      chipsEl,
      h('div', { class: 'settings-row' },
        toggle('Smooth hand movement (inversions)', settings.smooth, v => {
          settings.smooth = v;
          saveSettings();
          voicings = computeVoicings();
          update();
        }),
        toggle('Show next chord (dashed)', settings.ghost, v => { settings.ghost = v; saveSettings(); update(); }),
        toggle('Play sound when chord changes', settings.soundOnChange, v => { settings.soundOnChange = v; saveSettings(); }),
        toggle('Name every key', settings.showAll, v => { settings.showAll = v; saveSettings(); update(); })),
      p.unknown.length > 0 && h('p', { class: 'warn' }, `Skipped (couldn't read): ${p.unknown.join(', ')}`));

    update();
    return view;
  }

  show('list');
  return { el, importSongs, onShow: () => mode === 'list' && show('list') };
}
