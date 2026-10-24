// The tune screen: tap the melody of a song, one bar (one chord) at a time. The tune stays on this device.

import { h, fill, toast, segmented, toggle } from '../dom.js';
import { parseSong, handPlan, noteName } from '../theory.js';
import { renderPanel } from '../keyboard.js';
import { playNote } from '../audio.js';
import { playSample } from '../player.js';
import { analyzeSong, countText } from '../analyze.js';
import { cleanFeel, lengthOptions, signatureOf } from '../rhythm.js';
import { readMusicXml, scoreText } from '../musicxml.js';
import { asText, typeEntry } from './type-entry.js';
import { recordCard } from './record-card.js';
import { currentStyle } from '../style.js';
import { settings, saveSettings } from '../store.js';
import { addNote, barFit, barToGrid, bassBars, bestBreak, candidateRows, chordFit, moveFrom, fitBars, gridToBar, isEmpty, keyName, keyScale, newMelody, noteText, prefersFlats, roomIn, undoNote } from '../melody.js';

/**
 * Returns { el, stop }. done() leaves the screen (the song is saved after every change through save()).
 */
export function tuneUI(song, { done, save, reopen }) {
  const p = parseSong(song.text);
  const analysis = analyzeSong(song);
  const flats = prefersFlats(song.meta?.key);
  const label = m => noteName(m, flats);

  let melody = song.melody && !isEmpty(song.melody) ? song.melody : null;
  const theirCount = melody ? { pulses: melody.pulses, group: melody.group } : null;
  const mismatch = theirCount && (theirCount.pulses !== analysis.feel.pulses || theirCount.group !== analysis.feel.group);
  if (!melody) melody = newMelody(analysis.feel, p.chords.length);
  fitBars(melody, p.chords.length);
  const feel = { ...analysis.feel, pulses: melody.pulses, group: melody.group };
  const options = lengthOptions(feel);

  let bar = Math.max(0, melody.bars.findIndex(b => b.reduce((a, n) => a + n.d, 0) < melody.pulses)); // the first bar with room
  let length = options.find(o => o.d === settings.tuneLength)?.d ?? options.find(o => o.d === 2)?.d ?? options[0].d;
  const mid = melody.bars.flat().filter(n => n.m).map(n => n.m);
  let base = mid.length ? Math.max(36, Math.min(72, Math.floor((mid.reduce((a, b) => a + b, 0) / mid.length - 6) / 12) * 12)) : 60;
  let engine = null;

  const importBox = h('details', { class: 'card tune-import' });
  const chipsEl = h('div', { class: 'song-chips tune-chips' });
  const fitBox = h('div', { class: 'card tune-fit' });
  let lastMove = null; // the tune before the last “move”, for Undo
  const barCard = h('div', { class: 'card tune-bar' });
  const keysBox = h('div', { class: 'kb-box' });
  const gridBox = h('div', { class: 'grid-wrap' });
  const gridRange = h('span', { class: 'muted small' });
  const textOutBox = h('div', {});
  const scale = keyScale(song.meta?.key, p.chords);
  let entryMode = ['grid', 'keys', 'type'].includes(settings.tuneMode) ? settings.tuneMode : 'type';
  const typeCard = h('section', { class: 'card tune-entry' });
  let lane = 'lh'; // which hand the grid edits: 'lh' = the bass line, 'rh' = the tune
  let bassBase = 36;
  const laneBars = () => (lane === 'lh' ? bassBars(melody, p.chords.length) : melody.bars);
  const gridBase = () => (lane === 'lh' ? bassBase : base);
  const shiftBase = delta => { if (lane === 'lh') bassBase = Math.max(36, Math.min(48, bassBase + delta)); else base = Math.max(36, Math.min(72, base + delta)); };
  const gridCard = h('section', { class: 'card tune-entry tune-grid-card' });
  const keysCard = h('section', { class: 'card tune-entry' });
  const rangeLabel = h('span', { class: 'muted small' });
  const playBtn = h('button', { type: 'button', class: 'btn' });
  const fromBtn = h('button', { type: 'button', class: 'btn' });
  const gridPlay = h('button', { type: 'button', class: 'btn' });
  const gridFrom = h('button', { type: 'button', class: 'btn' });

  const commit = () => {
    song.melody = isEmpty(melody) ? undefined : melody;
    if (!song.melody) delete song.melody;
    song.updated = Date.now();
    save();
  };

  const barFilled = i => melody.bars[i].reduce((a, n) => a + n.d, 0);
  const sections = [...p.sections].sort((a, b) => a.start - b.start);

  function drawChips() {
    const parts = [];
    let s = 0;
    p.chords.forEach((c, i) => {
      for (; s < sections.length && sections[s].start === i; s++) parts.push(h('div', { class: 'section-label' }, sections[s].name));
      const used = barFilled(i);
      const state = used === 0 ? '' : used >= melody.pulses ? ' full' : ' part';
      const f = barFit(melody, p.chords, i);
      const fitClass = f.notes < 2 ? '' : f.fit >= 0.7 ? ' fit-good' : f.fit < 0.4 ? ' fit-weak' : '';
      parts.push(h('button', {
        type: 'button', class: `chip${state}${fitClass}${i === bar ? ' active' : ''}`, 'data-i': i, 'aria-label': `Bar ${i + 1}, ${c.symbol}`,
        onclick: () => { stop(); bar = i; draw(); },
      }, h('span', { class: 'chip-num' }, i + 1), c.symbol));
    });
    fill(chipsEl, ...parts);
  }

  // Does the tune line up with the chords? Notes on the main beats should mostly belong to the bar's chord.
  function drawFit() {
    const overall = chordFit(melody, p.chords, 0);
    if (overall.notes < 8) {
      fill(fitBox, h('p', { class: 'muted small' }, 'Fit check: once the tune has some notes, this shows whether they match the chords (a dot on a bar: green fits, red does not).'));
      return;
    }
    const suggestion = bestBreak(melody, p.chords);
    const percent = x => `${Math.round(x * 100)}%`;
    const moves = [];
    if (suggestion) {
      const n = Math.abs(suggestion.shift);
      moves.push(h('div', { class: 'grid-gap' },
        h('p', {}, h('b', {}, `At bar ${suggestion.at + 1}: `), `the tune fits the chords better if ${suggestion.shift < 0 ? `${n} bar${n === 1 ? '' : 's'} of the tune are removed here` : `${n} empty bar${n === 1 ? '' : 's'} are added here`} (${percent(suggestion.fitNow)} → ${percent(suggestion.fitBest)}). `,
          suggestion.shift < 0 ? 'This happens when the sheet has extra bars the chord chart does not (an extra intro or a repeat).' : 'This happens when the chart has bars the sheet does not.'),
        h('button', { type: 'button', class: 'btn small primary', onclick: () => {
          stop();
          lastMove = melody;
          bar = suggestion.at;
          melody = moveFrom(melody, suggestion.at, suggestion.shift);
          fitBars(melody, p.chords.length);
          melody.bars.length = p.chords.length; // never more bars than chords
          song.melody = melody;
          commit();
          draw();
        } }, suggestion.shift < 0 ? `Remove ${n} bar${n === 1 ? '' : 's'} here` : `Add ${n} empty bar${n === 1 ? '' : 's'} here`)));
    }
    fill(fitBox,
      h('p', {}, h('b', {}, 'Fit with the chords: '), percent(overall.fit),
        h('span', { class: 'muted small' }, ' of the main-beat notes are notes of that bar’s chord. A tune that is lined up properly is usually above 70%. Green and red dots on the bars show where it fits or not.')),
      moves,
      lastMove && h('button', { type: 'button', class: 'btn small', onclick: () => { melody = lastMove; song.melody = melody; lastMove = null; commit(); draw(); } }, '↶ Undo the move'));
  }

  function drawBar() {
    const notes = melody.bars[bar];
    const room = roomIn(melody, bar);
    const chord = p.chords[bar];
    fill(barCard,
      h('div', { class: 'row between' },
        h('h3', {}, `Bar ${bar + 1} · ${chord.symbol}`),
        h('span', { class: room === 0 ? 'good-text' : 'muted small' }, room === 0 ? '✓ bar is full' : `${melody.pulses - room} of ${melody.pulses} counts used`)),
      notes.length
        ? h('div', { class: 'tune-notes' }, notes.map((n, i) => h('button', {
          type: 'button', class: `chip tune-note${n.m ? '' : ' rest'}`, title: 'Tap to remove this note',
          onclick: () => { stop(); notes.splice(i, 1); commit(); draw(); },
        }, noteText(n, flats), ' ×')))
        : h('p', { class: 'muted small' }, 'Nothing in this bar yet: pick a length, then tap a key. A bar with no notes plays the chord instead.'));
  }

  function drawKeys() {
    const notes = melody.bars[bar].filter(n => n.m).map(n => n.m);
    renderPanel(keysBox, {
      from: base,
      to: base + 24,
      marks: new Map(notes.map(m => [m, 'rh'])),
      label,
      showAll: true,
      onKey: m => press(m),
    });
    rangeLabel.textContent = `Keys ${label(base)}${Math.floor(base / 12) - 1} to ${label(base + 24)}${Math.floor((base + 24) / 12) - 1}`;
  }

  // ----- Pick by count: a grid of the notes that fit this bar's chord (rows) against the counts of the bar (columns) -----
  function hearWithChord(m) {
    const plan = handPlan(p.chords[bar], 'easy', { feel });
    plan.rh.notes.forEach(n => playNote(n, 0, 1.6, lane === 'lh' ? 0.4 : 0.28)); // the bar's chord, softly, so you can hear whether the note fits
    if (lane === 'rh') playNote(plan.lh.notes[0], 0, 1.8, 0.4);
    playNote(m, 0, lane === 'lh' ? 1.8 : 1.5, 0.95);
  }

  function drawGrid() {
    const pulses = melody.pulses;
    const cells = barToGrid(laneBars()[bar] ?? [], pulses);
    const all = Boolean(settings.tuneAll);
    const low = gridBase();
    const top = low + 19;
    const rows = candidateRows(p.chords[bar], scale, low, top, all);
    gridRange.textContent = `Keys ${keyName(low, flats)} to ${keyName(top, flats)}`;
    if (!cells) {
      fill(gridBox, h('p', { class: 'warn' }, 'This bar has notes that start between counts (from an imported file), so it can’t be shown on the grid. Use “Tap keys” to edit it.'));
      return;
    }
    const sounding = cells.map((_, c) => {
      for (let i = c; i >= 0; i--) if (cells[i] !== null) return cells[i];
      return null;
    });
    const set = (c, value) => {
      cells[c] = cells[c] === value ? null : value;
      laneBars()[bar] = gridToBar(cells);
      commit();
      if (cells[c] === value && value) hearWithChord(value);
      draw();
    };
    const cell = (c, value, label, chordTone) => h('button', {
      type: 'button',
      class: `cell${cells[c] === value ? ' on' : sounding[c] === value && cells[c] === null && sounding[c] !== null ? ' hold' : ''}${c % feel.group === 0 ? ' beat' : ''}`,
      'aria-label': `${label} on count ${c + 1}`,
      'aria-pressed': String(cells[c] === value),
      onclick: () => { stop(); set(c, value); },
    });
    fill(gridBox,
      h('div', { class: 'count-grid', style: `--cols:${pulses}` },
        h('span', { class: 'corner' }, 'Count'),
        Array.from({ length: pulses }, (_, c) => h('span', { class: `count-head${c % feel.group === 0 ? ' beat' : ''}` }, c + 1)),
        rows.map(({ m, chordTone, inKey }) => [
          h('span', { class: `row-label${chordTone ? ' chord-tone' : ''}${!chordTone && !inKey ? ' outside' : ''}` }, keyName(m, flats), chordTone && h('i', { 'aria-label': 'chord note' }, '●')),
          Array.from({ length: pulses }, (_, c) => cell(c, m, keyName(m, flats), chordTone)),
        ]),
        h('span', { class: 'row-label rest-label' }, 'rest'),
        Array.from({ length: pulses }, (_, c) => cell(c, 0, 'rest', false))));
  }

  // ----- Import a MusicXML file (read on this device; the top staff becomes the tune) -----
  const countName = f => (f.group === 3 ? `${f.pulses}/8` : f.group === 1 ? `${f.pulses}/4` : signatureOf(f).join('/'));
  function showImport(content, open = false) {
    fill(importBox, h('summary', {}, 'Have a music file? Import it (optional)'), content);
    importBox.open = open;
  }
  function offerImport() {
    const input = h('input', {
      type: 'file', accept: '.musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml,text/xml,application/xml', class: 'visually-hidden', id: 'tune-file',
      onchange: async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const result = readMusicXml(await scoreText(await file.arrayBuffer()));
          result.ok ? review(file.name, result) : problem(result.error);
        } catch (err) {
          problem(err.message || 'That file could not be read.');
        }
      },
    });
    showImport(h('div', { class: 'grid-gap' },
      h('p', { class: 'muted small' }, 'Have a MusicXML file (.musicxml, .xml or .mxl) of the sheet? Choose it here and the right hand (the top staff) becomes the tune. The file is read on this device and is not uploaded.'),
      input,
      h('label', { for: 'tune-file', class: 'btn small' }, 'Choose a file…')));
  }
  function problem(message) {
    showImport(h('div', { class: 'grid-gap' }, h('p', { class: 'warn' }, message), h('button', { type: 'button', class: 'btn small', onclick: offerImport }, 'Try another file')), true);
  }
  function review(name, { melody: found, info }) {
    const usable = Math.min(info.bars, p.chords.length);
    const same = found.pulses === analysis.feel.pulses && found.group === analysis.feel.group;
    showImport(h('div', { class: 'grid-gap' },
      h('p', {}, h('b', {}, name), `: ${info.bars} bars in ${info.meter}, ${info.notes} notes (right hand, top staff).`),
      info.bars > p.chords.length && h('p', { class: 'warn' }, `The song has ${p.chords.length} chords (one for each bar), so the first button uses only the first ${usable} bars.`),
      info.bars < p.chords.length && h('p', { class: 'muted small' }, `The file has fewer bars than the song has chords, so the last ${p.chords.length - info.bars} bars stay empty.`),
      !same && h('p', { class: 'warn' }, `This song is counted ${countName(analysis.feel)}, and the file is ${info.meter}. Using the file changes the song to ${info.meter} (its strumming pattern is replaced by plain hits).`),
      info.warnings.map(w => h('p', { class: 'muted small' }, w)),
      h('p', { class: 'muted small' }, 'You can fix any note afterwards, bar by bar, with the keys below.'),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn small primary', onclick: () => apply(found, info, usable, false) }, `Use these ${usable} bars`),
        info.bars > p.chords.length && h('button', { type: 'button', class: 'btn small', onclick: () => apply(found, info, info.bars, true) }, `Use all ${info.bars} bars (repeat the song’s chords)`),
        h('button', { type: 'button', class: 'btn small', onclick: offerImport }, 'Cancel')),
      info.bars > p.chords.length && h('p', { class: 'muted small' }, 'The second button adds the song’s chords again after the last one, until every bar has a chord. The chords in those extra bars are a guess: open Edit afterwards to correct them.')), true);
  }

  function apply(found, info, barCount, extend) {
    if (!isEmpty(song.melody) && !window.confirm('Replace the tune you have now with the one from the file?')) return;
    const same = found.pulses === analysis.feel.pulses && found.group === analysis.feel.group;
    if (extend && barCount > p.chords.length) {
      const symbols = p.chords.map(c => c.symbol);
      const extra = Array.from({ length: barCount - symbols.length }, (_, i) => symbols[i % symbols.length]);
      const lines = [];
      for (let i = 0; i < extra.length; i += 4) lines.push(extra.slice(i, i + 4).join(' '));
      song.text = `${song.text.trimEnd()}\n\n[Extra bars]\n${lines.join('\n')}`;
    }
    song.melody = { ...found, bars: found.bars.slice(0, barCount) };
    if (!same) song.meta = { ...song.meta, feel: cleanFeel({ bpm: analysis.feel.bpm, pulses: found.pulses, group: found.group, hits: Array.from({ length: found.pulses }, () => ({})) }) };
    song.updated = Date.now();
    save();
    reopen();
  }

  function draw() {
    drawChips();
    recorder.refresh();
    drawFit();
    drawBar();
    drawKeys();
    drawGrid();
    fill(textOutBox, asText({ bars: laneBars, bar: () => bar, title: lane === 'lh' ? 'Left hand' : 'Right hand', flats }));
    gridCard.hidden = entryMode !== 'grid';
    typeCard.hidden = entryMode !== 'type';
    keysCard.hidden = entryMode !== 'keys';
    for (const b of [playBtn, gridPlay]) b.textContent = engine ? '■ Stop' : '▶ Hear this bar';
    for (const b of [fromBtn, gridFrom]) b.textContent = engine ? '■ Stop' : '▶ Hear from this bar';
    chipsEl.querySelector('.chip.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  function put(m) {
    stop();
    const result = addNote(melody, bar, m, length);
    if (!result.ok) {
      toast(result.room > 0 ? `Only ${result.room} count${result.room === 1 ? '' : 's'} left in this bar: pick a shorter note.` : 'This bar is full. Tap the next bar.');
      return;
    }
    commit();
    if (result.full && bar < p.chords.length - 1) bar += 1; // on to the next bar
    draw();
  }

  function press(m) {
    playNote(m);
    put(m);
  }

  function stop() {
    if (!engine) return;
    engine.stop();
    engine = null;
    for (const b of [playBtn, gridPlay]) b.textContent = '▶ Hear this bar';
    for (const b of [fromBtn, gridFrom]) b.textContent = '▶ Hear from this bar';
  }

  function hear(from, to) {
    if (engine) return stop();
    const bars = [];
    for (let i = from; i < to; i++) {
      const tuneBar = melody.bars[i].some(n => n.m) ? melody.bars[i] : null;
      bars.push({ plan: handPlan(p.chords[i], currentStyle(), { feel }), tune: tuneBar, bass: melody.bass?.[i]?.some(n => n.m) ? melody.bass[i] : null });
    }
    engine = playSample({
      bars, feel, bpm: analysis.feel.bpm, metronome: true, everyPulse: false, countIn: true,
      onBar: k => { bar = from + k; drawChips(); drawBar(); drawKeys(); },
      onEnd: () => { stop(); draw(); },
    });
    draw();
  }

  for (const b of [playBtn, gridPlay]) b.onclick = () => hear(bar, bar + 1);
  for (const b of [fromBtn, gridFrom]) b.onclick = () => hear(bar, p.chords.length);

  const [top, bottom] = signatureOf(feel);
  const lengths = segmented(options.map(o => [String(o.d), `${o.name} (${o.d})`]), String(length), v => {
    length = +v;
    settings.tuneLength = length;
    saveSettings();
  }, 'How long the next note lasts, in counts');

  // record a hand by playing it on the real piano
  const recorder = recordCard({
    getFeel: () => feel,
    getBpm: () => analysis.feel.bpm,
    sub: () => (melody.group === 1 ? 2 : 1),
    startBar: () => bar,
    barsLeft: () => p.chords.length - bar,
    lanes: [
      { id: 'lh', title: 'Left hand (the bass line)', has: (from, count) => bassBars(melody, p.chords.length).slice(from, from + count).some(b => b.some(n => n.m)) },
      { id: 'rh', title: 'Right hand (the tune)', has: (from, count) => melody.bars.slice(from, from + count).some(b => b.some(n => n.m)) },
    ],
    defaultLane: 'rh',
    apply: (laneId, bars, from, count) => {
      const target = laneId === 'lh' ? bassBars(melody, p.chords.length) : melody.bars;
      for (let i = 0; i < count; i++) target[from + i] = bars[i] ?? [];
      commit();
      draw();
    },
  });

  const el = h('div', { class: 'tune' },
    h('div', { class: 'row between player-head' },
      h('button', { type: 'button', class: 'btn small', onclick: () => { stop(); done(); } }, '‹ Back to song'),
      h('h2', { class: 'song-name' }, `Tune · ${song.title}`),
      h('button', { type: 'button', class: 'btn small primary', onclick: () => { stop(); done(); } }, 'Done')),
    h('p', { class: 'muted small' },
      `Type in the tune from a sheet you own, one bar for each chord. This song counts ${top}/${bottom}: ${feel.pulses} counts in a bar (${countText(feel)}). ` +
      'Pick how long the note lasts, then tap its key; a bar fills up and moves on to the next. The tune is saved only on this device.'),
    mismatch && h('div', { class: 'card' },
      h('p', { class: 'warn' }, `This tune was entered with ${theirCount.pulses} counts in a bar, but the song now counts ${analysis.feel.pulses}, so playback skips it.`),
      h('button', { type: 'button', class: 'btn small danger', onclick: () => {
        if (!window.confirm('Delete this tune and start again with the song’s count?')) return;
        delete song.melody;
        save();
        done(true);
      } }, 'Start again with the song’s count')),
    importBox,
    chipsEl,
    fitBox,
    barCard,
    segmented([['type', 'Type it'], ['grid', 'Pick by count'], ['keys', 'Tap keys']], entryMode, v => { entryMode = v; settings.tuneMode = v; saveSettings(); draw(); }, 'How to enter the tune'),
    typeCard,
    gridCard,
    keysCard,
    recorder.el,
    h('p', { class: 'muted small' }, 'Tip: the notes that sound are the keys you tap, in the octave shown on the keyboard (middle C is C4). Your tune plays with the left hand of your chosen playing style; the right hand plays the tune instead of the chord.'));

  fill(keysCard,
      h('div', { class: 'style-label' }, 'How long is the next note?'),
      lengths,
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn small', onclick: () => put(0) }, 'Add a rest'),
        h('button', { type: 'button', class: 'btn small', onclick: () => { stop(); if (!melody.bars[bar].length && bar > 0) bar -= 1; /* a full bar moved on, so undo the note before */ if (undoNote(melody, bar)) { commit(); draw(); } } }, '↶ Undo'),
        h('button', { type: 'button', class: 'btn small', onclick: () => { stop(); melody.bars[bar].length = 0; commit(); draw(); } }, 'Clear this bar')),
      h('div', { class: 'row between' },
        h('button', { type: 'button', class: 'btn small', disabled: false, onclick: () => { base = Math.max(36, base - 12); drawKeys(); } }, '◀ Lower keys'),
        rangeLabel,
        h('button', { type: 'button', class: 'btn small', onclick: () => { base = Math.min(72, base + 12); drawKeys(); } }, 'Higher keys ▶')),
      h('div', { class: 'tune-keys' }, keysBox),
      h('div', { class: 'row wrap' }, playBtn, fromBtn))
  fill(gridCard,
    segmented([['lh', 'Left hand: the bass line'], ['rh', 'Right hand: the tune']], lane, v => { lane = v; draw(); }, 'Which hand to enter'),
    h('p', { class: 'muted small' }, 'Each row is a key you could use for this bar’s chord; ● marks the chord’s own notes, the safest choices. Tap a square to start that note on that count. It rings until the next note, and the “rest” row stops it. Every tap plays the note over the chord so you can hear if it fits.'),
    toggle('Show every key (also notes outside the song’s key, like a G♭ over B♭)', Boolean(settings.tuneAll), v => { settings.tuneAll = v; saveSettings(); draw(); }),
    gridBox,
    textOutBox,
    h('div', { class: 'row between' },
      h('button', { type: 'button', class: 'btn small', onclick: () => { shiftBase(-12); draw(); } }, '◀ Lower keys'),
      gridRange,
      h('button', { type: 'button', class: 'btn small', onclick: () => { shiftBase(12); draw(); } }, 'Higher keys ▶')),
    h('div', { class: 'row wrap' },
      h('button', { type: 'button', class: 'btn small', onclick: () => { stop(); laneBars()[bar] = []; commit(); draw(); } }, lane === 'lh' ? 'Clear this bar’s bass' : 'Clear this bar'),
      h('button', { type: 'button', class: 'btn small', onclick: () => { stop(); if (bar < p.chords.length - 1) bar += 1; draw(); } }, 'Next bar ▶')),
    h('div', { class: 'row wrap' }, gridPlay, gridFrom));
  fill(typeCard, typeEntry({
    pulses: melody.pulses, group: melody.group, flats,
    lanes: [
      { id: 'lh', title: 'Left hand (the bass line)', get: () => bassBars(melody, p.chords.length), set: (from, bars) => { const lane = bassBars(melody, p.chords.length); bars.forEach((b, i) => { lane[from + i] = b; }); } },
      { id: 'rh', title: 'Right hand (the tune)', get: () => melody.bars, set: (from, bars) => bars.forEach((b, i) => { melody.bars[from + i] = b; }) },
    ],
    barCount: () => p.chords.length,
    extendTo: n => n <= p.chords.length,
    afterApply: () => { stop(); commit(); draw(); },
  }));
  offerImport();
  draw();
  return { el, stop };
}
