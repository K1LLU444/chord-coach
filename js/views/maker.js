// Maker tab: build a piece of your own from a sheet you are reading — pick the time signature, then fill the bars
// of each hand by count. It gives you a printable sheet and falling notes. Nothing here depends on a chord chart.

import { h, fill, toast, segmented, toggle } from '../dom.js';
import { playNote } from '../audio.js';
import { playSample } from '../player.js';
import { buildTimeline, fallingView } from '../falling.js';
import { barToGrid, gridToBar, keyName, keyScale, prefersFlats } from '../melody.js';
import { METERS, KEYS, MAX_BARS, addBars, changeMeter, copyBar, newPiece, pieceBars, pieceFeel, pieceIsEmpty, removeLastBar } from '../piece.js';
import { settings, saveSettings, loadPieces, savePieces, uid } from '../store.js';
import { drawCountGrid } from './count-grid.js';
import { asText, typeEntry } from './type-entry.js';
import { fallStage } from './stage.js';
import { practicePanel } from './practice-controls.js';
import { clampRange, cleanHands, cleanSpeed, speedBpm } from '../practice.js';
import { piano } from '../midi.js';
import { startWaitRun } from './wait-run.js';
import { recordCard } from './record-card.js';
import { keyName as noteLabel } from '../melody.js';

const BLACK = new Set([1, 3, 6, 8, 10]);
const keyLabel = k => k || 'No key (show every key the same)';

export function makerView() {
  let pieces = loadPieces();
  let stop = null; // stops any playing when the screen changes
  let stopFull = null; // leaves full screen when the screen changes
  const el = h('div', { class: 'view' });
  const persist = () => savePieces(pieces);

  function show(next, piece) {
    stop?.();
    stop = null;
    stopFull?.();
    stopFull = null;
    el.replaceChildren(next === 'list' ? listUI() : next === 'new' ? setupUI() : pieceUI(piece));
    window.scrollTo(0, 0);
  }

  // ---------- the list ----------

  function listUI() {
    const sorted = [...pieces].sort((a, b) => b.updated - a.updated);
    return h('div', {},
      h('div', { class: 'row between' },
        h('h2', {}, 'Your pieces'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => show('new') }, '+ New piece')),
      sorted.length
        ? h('ul', { class: 'song-list' }, sorted.map(p => h('li', {}, h('button', { type: 'button', class: 'song-item card', onclick: () => show('edit', p) },
          h('span', { class: 'song-title' }, p.title),
          h('span', { class: 'song-preview' }, `${METERS.find(m => m.pulses === p.pulses && m.group === p.group)?.id} · ${p.bars} bars · ${p.bpm} bpm`,
            pieceIsEmpty(p) ? h('span', { class: 'muted' }, ' · empty') : null)))))
        : h('p', { class: 'empty' }, 'No pieces yet. Tap “New piece”, choose the time signature of the sheet you are reading, then build it bar by bar.'),
      h('p', { class: 'muted small' }, 'Pieces are saved on this device. You pick the notes yourself, from a sheet you own or from your own head, so nothing is copied from anywhere. Each piece gives you falling notes and a printable sheet.'));
  }

  // ---------- starting a piece ----------

  function setupUI() {
    const title = h('input', { class: 'input', placeholder: 'Title', value: '', 'aria-label': 'Title' });
    const meter = h('select', { class: 'input', 'aria-label': 'Time signature' }, METERS.map(m => h('option', { value: m.id }, m.label)));
    const bpm = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 30, max: 200, value: 80, 'aria-label': 'Tempo in beats per minute' });
    const key = h('select', { class: 'input', 'aria-label': 'Key' }, KEYS.map(k => h('option', { value: k }, keyLabel(k))));
    const bars = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, max: MAX_BARS, value: 8, 'aria-label': 'Number of bars' });
    const field = (label, input, hint) => h('label', { class: 'field' }, h('span', { class: 'style-label' }, label), input, hint && h('span', { class: 'muted small' }, hint));
    return h('div', { class: 'grid-gap setup' },
      h('div', { class: 'row between' },
        h('button', { type: 'button', class: 'btn small', onclick: () => show('list') }, 'Cancel'),
        h('h2', {}, 'New piece')),
      field('Title', title),
      field('Time signature', meter, 'Look at the two numbers after the clef on your sheet.'),
      field('Tempo (beats per minute)', bpm, 'For 6/8, a beat is three counts. 60–70 is slow and gentle.'),
      field('Key (optional)', key, 'Only used for naming notes (B♭ or A♯) and to dim the keys outside the key. You can change it later.'),
      field('Number of bars', bars, 'You can add or remove bars any time.'),
      h('button', {
        type: 'button', class: 'btn primary',
        onclick: () => {
          const piece = newPiece({ id: uid(), title: title.value, meter: meter.value, bpm: bpm.value, key: key.value, bars: bars.value });
          pieces.push(piece);
          persist();
          show('edit', piece);
        },
      }, 'Create the piece'));
  }

  // ---------- editing a piece ----------

  function pieceUI(piece) {
    const flats = prefersFlats(piece.key);
    let bar = 0;
    let lane = settings.makerLane === 'rh' ? 'rh' : 'lh';
    let rhBase = 60;
    let lhBase = 36;
    let engine = null;
    const fall = fallingView();
    const feel = () => pieceFeel(piece);

    let entryMode = settings.makerEntry === 'grid' ? 'grid' : 'type';
    const chipsEl = h('div', { class: 'song-chips tune-chips' });
    const typeCard = h('section', { class: 'card' });
    const barCard = h('section', { class: 'card tune-bar' });
    const gridBox = h('div', { class: 'grid-wrap' });
    const rangeLabel = h('span', { class: 'muted small' });
    const status = h('p', { class: 'muted small practice-status', 'aria-live': 'polite' });
    const playBtn = h('button', { type: 'button', class: 'btn primary' });
    const fromBtn = h('button', { type: 'button', class: 'btn' });
    const bpmLabel = h('span', { class: 'tempo-label' });
    const options = { loop: false, countIn: true, metronome: true, wait: false };
    const practice = { from: 1, to: piece.bars, speed: cleanSpeed(settings.practiceSpeed), hands: cleanHands(settings.practiceHands) };
    const span = () => clampRange(practice.from, practice.to, piece.bars);

    const commit = () => {
      piece.updated = Date.now();
      persist();
    };
    const lanes = () => (lane === 'lh' ? piece.lh : piece.rh);
    const base = () => (lane === 'lh' ? lhBase : rhBase);
    const scale = () => (piece.key ? keyScale(piece.key) : null);

    // ----- falling notes (and the sheet's sound) -----
    const timeline = () => buildTimeline(pieceBars(piece), feel(), piece.bpm, 1, practice.hands);
    function drawFall() {
      if (engine) return;
      fall.load(timeline());
      fall.show(bar * piece.pulses);
    }

    function halt() {
      engine?.stop();
      engine = null;
      fall.halt();
      status.textContent = '';
      labelButtons();
      drawFall();
    }
    stop = halt;

    function labelButtons() {
      const r = span();
      const bpmNow = speedBpm(piece.bpm, practice.speed);
      const range = r.from === 1 && r.to === piece.bars ? 'all' : `bars ${r.from}–${r.to}`;
      playBtn.textContent = engine ? '■ Stop' : `▶ ${options.loop ? 'Loop' : 'Play'} ${range}${practice.speed === 100 ? '' : ` at ${bpmNow} bpm`}`;
      fromBtn.textContent = engine ? '■ Stop' : `▶ From bar ${bar + 1} to ${r.to >= bar + 1 ? r.to : piece.bars}`;
    }

    // Play bars from → to (0-based, inclusive) at the chosen speed and with the chosen hands.
    function play(from, to) {
      if (engine) return halt();
      if (pieceIsEmpty(piece)) return toast('Add some notes first.');
      const slice = pieceBars(piece).slice(from, to + 1);
      const f = feel();
      const bpm = speedBpm(piece.bpm, practice.speed);
      if (options.wait && piano.state.connected) {
        // wait mode: the notes wait for the keys pressed on the real piano
        engine = startWaitRun({
          fall, timeline: buildTimeline(slice, f, bpm, from + 1, practice.hands), feel: f, bpm, countIn: options.countIn, loop: options.loop,
          label: m => noteLabel(m, flats),
          onBar: i => { bar = from + i; drawChips(); },
          onStatus: t => { status.textContent = t; },
          onDone: stats => { halt(); status.textContent = `Done: ${stats.clean} of ${stats.steps} played right the first time, ${stats.wrong} wrong key${stats.wrong === 1 ? '' : 's'}.`; },
        });
        labelButtons();
        return;
      }
      fall.load(buildTimeline(slice, f, bpm, from + 1, practice.hands), { loop: options.loop });
      engine = playSample({
        bars: slice, feel: f, bpm, hands: practice.hands, metronome: options.metronome, everyPulse: false, countIn: options.countIn, loop: options.loop,
        onBar: (k, pass) => {
          bar = from + k;
          status.textContent = `${options.loop ? `Round ${pass + 1} · ` : ''}Bar ${bar + 1} of ${piece.bars}`;
          drawChips();
        },
        onPulse: (_pulse, isCount) => { if (isCount) status.textContent = 'Count-in…'; },
        onEnd: () => { halt(); },
      });
      fall.run(() => engine?.pulse() ?? 0);
      labelButtons();
    }

    // ----- bar chips -----
    function drawChips() {
      fill(chipsEl,
        piece.rh.map((_, i) => {
          const notes = piece.rh[i].some(n => n.m) || piece.lh[i].some(n => n.m);
          return h('button', {
            type: 'button', class: `chip${notes ? ' full' : ''}${i === bar ? ' active' : ''}`, 'data-i': i, 'aria-label': `Bar ${i + 1}`,
            onclick: () => { if (engine) halt(); bar = i; draw(); },
          }, h('span', { class: 'chip-num' }, i + 1), piece.chords[i] || '·');
        }));
    }

    // ----- the grid -----
    function drawGrid() {
      const f = feel();
      const sub = piece.sub;
      const cells = barToGrid(lanes()[bar] ?? [], f.pulses, sub);
      const low = base();
      const rows = [];
      const sc = scale();
      for (let m = low + 19; m >= low; m--) {
        const outside = sc && !sc.has(m % 12);
        const black = BLACK.has(m % 12);
        rows.push({ m, label: keyName(m, flats), className: `${black ? 'black-key' : ''}${m % 12 === 0 ? ' c-key' : ''}${outside ? ' outside' : ''}` });
      }
      rangeLabel.textContent = `Keys ${keyName(low, flats)} to ${keyName(low + 19, flats)}`;
      if (!cells) {
        fill(gridBox, h('div', { class: 'grid-gap' },
          h('p', { class: 'warn' }, 'This bar has notes that start between the grid’s columns. Switch “Half counts” on to see them, or clear the bar.')));
        return;
      }
      drawCountGrid(gridBox, {
        cells, pulses: f.pulses, sub, group: f.group, rows,
        onSet: (c, value) => {
          if (engine) halt();
          cells[c] = cells[c] === value ? null : value;
          lanes()[bar] = gridToBar(cells, sub);
          commit();
          if (cells[c] === value && value) playNote(value, 0, lane === 'lh' ? 1.8 : 1.4, 0.95);
          draw();
        },
      });
    }

    // ----- the bar card -----
    function drawBarCard() {
      const chordInput = h('input', {
        class: 'input chord-input', placeholder: 'e.g. Bb', maxlength: 12, value: piece.chords[bar], 'aria-label': `Chord name above bar ${bar + 1} (optional)`,
        onchange: e => { piece.chords[bar] = e.target.value.trim(); commit(); drawChips(); drawFall(); },
      });
      fill(barCard,
        h('div', { class: 'row between' },
          h('h3', {}, `Bar ${bar + 1} of ${piece.bars}`),
          h('label', { class: 'row small' }, h('span', { class: 'muted' }, 'Chord name (optional)'), chordInput)),
        segmented([['lh', 'Left hand (bass)'], ['rh', 'Right hand (treble)']], lane, v => { lane = v; settings.makerLane = v; saveSettings(); draw(); }, 'Which hand to enter'),
        h('p', { class: 'muted small' }, 'Tap a square to start that key on that count. It rings until your next note, and the “rest” row stops it. Tap again to remove it. Dimmed keys are outside the key; keys with black backgrounds are the black keys.'),
        gridBox,
        asText({ bars: lanes, bar: () => bar, title: lane === 'lh' ? 'Left hand' : 'Right hand', flats }),
        h('div', { class: 'row between' },
          h('button', { type: 'button', class: 'btn small', onclick: () => { if (lane === 'lh') lhBase = Math.max(24, lhBase - 12); else rhBase = Math.max(36, rhBase - 12); draw(); } }, '◀ Lower keys'),
          rangeLabel,
          h('button', { type: 'button', class: 'btn small', onclick: () => { if (lane === 'lh') lhBase = Math.min(60, lhBase + 12); else rhBase = Math.min(84, rhBase + 12); draw(); } }, 'Higher keys ▶')),
        h('div', { class: 'row wrap' },
          h('button', { type: 'button', class: 'btn small', onclick: () => { lanes()[bar] = []; commit(); draw(); } }, lane === 'lh' ? 'Clear left hand here' : 'Clear right hand here'),
          h('button', {
            type: 'button', class: 'btn small', disabled: bar >= piece.bars - 1,
            onclick: () => { copyBar(piece, bar, bar + 1); commit(); bar += 1; draw(); },
          }, 'Copy this bar to the next ▶'),
          h('button', { type: 'button', class: 'btn small', disabled: bar >= piece.bars - 1, onclick: () => { bar += 1; draw(); } }, 'Next bar ▶')));
    }

    let lastBars = piece.bars;
    function draw() {
      if (practice.to === lastBars) practice.to = piece.bars; // a range that was the whole piece stays the whole piece
      lastBars = piece.bars;
      panel?.refresh();
      recorder?.refresh();
      drawChips();
      barCard.hidden = entryMode !== 'grid';
      typeCard.hidden = entryMode !== 'type';
      drawBarCard();
      drawGrid();
      labelButtons();
      drawFall();
      chipsEl.querySelector('.chip.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }

    const setBpm = (v, save = true) => {
      piece.bpm = Math.max(30, Math.min(200, Math.round(v)));
      bpmLabel.textContent = `${piece.bpm} bpm`;
      if (save) commit();
      if (!engine) drawFall();
    };

    // The falling notes with the practice controls: which bars, how fast, which hand, loop; and a size / full screen choice.
    const panel = practicePanel({
      count: () => piece.bars,
      range: () => span(),
      setRange: (a, b) => { practice.from = a; practice.to = b; },
      current: () => bar,
      speed: () => practice.speed,
      setSpeed: v => { practice.speed = cleanSpeed(v); settings.practiceSpeed = practice.speed; saveSettings(); },
      hands: () => practice.hands,
      setHands: v => { practice.hands = cleanHands(v); settings.practiceHands = practice.hands; saveSettings(); },
      loop: () => options.loop,
      setLoop: v => { options.loop = v; },
      wait: () => options.wait,
      setWait: v => { options.wait = v; },
      onChange: () => { if (engine) halt(); else drawFall(); labelButtons(); },
    });
    fall.setNames({ flats });
    const stage = fallStage({
      fall,
      title: 'Falling notes and practice',
      controls: [
        status,
        h('div', { class: 'row wrap' }, playBtn, fromBtn),
        panel.el,
        h('div', { class: 'settings-row collapsible' },
          toggle('Count-in bar', options.countIn, v => { options.countIn = v; }),
          toggle('Click', options.metronome, v => { options.metronome = v; })),
      ],
    });
    panel.el.classList.add('collapsible');
    stopFull = stage.exit;
    piano.on(e => { if (e.type === 'status') panel.refresh(); });

    // recording a hand by playing it on the real piano
    const recorder = recordCard({
      getFeel: feel,
      getBpm: () => piece.bpm,
      sub: () => piece.sub,
      startBar: () => bar,
      barsLeft: () => piece.bars - bar,
      lanes: [
        { id: 'lh', title: 'Left hand', has: (from, count) => piece.lh.slice(from, from + count).some(b => b.some(n => n.m)) },
        { id: 'rh', title: 'Right hand', has: (from, count) => piece.rh.slice(from, from + count).some(b => b.some(n => n.m)) },
      ],
      defaultLane: 'rh',
      apply: (laneId, bars, from, count) => {
        const target = laneId === 'lh' ? piece.lh : piece.rh;
        for (let i = 0; i < count; i++) target[from + i] = bars[i] ?? []; // bars after the last played note are emptied
        commit();
        draw();
      },
    });

    const meterName = METERS.find(m => m.pulses === piece.pulses && m.group === piece.group)?.id;
    const view = h('div', { class: 'maker' },
      h('div', { class: 'row between player-head' },
        h('button', { type: 'button', class: 'btn small', onclick: () => show('list') }, '‹ Pieces'),
        h('h2', { class: 'song-name' }, piece.title),
        h('div', { class: 'row' },
          h('button', {
            type: 'button', class: 'btn small',
            onclick: () => {
              const name = window.prompt('Title of the piece:', piece.title);
              if (name?.trim()) { piece.title = name.trim().slice(0, 80); commit(); show('edit', piece); }
            },
          }, 'Rename'),
          h('button', {
            type: 'button', class: 'btn small primary',
            onclick: () => {
              settings.sheetMode = 'tune';
              settings.tuneSong = `piece:${piece.id}`;
              saveSettings();
              window.dispatchEvent(new CustomEvent('gototab', { detail: 'sheets' }));
            },
          }, 'Sheet to print'))),
      h('div', { class: 'settings-row' },
        h('label', { class: 'row small' }, h('span', { class: 'muted' }, 'Time signature'),
          h('select', {
            class: 'input', 'aria-label': 'Time signature',
            onchange: e => {
              const result = changeMeter(piece, e.target.value);
              if (!result.ok) { toast(result.message); e.target.value = meterName; return; }
              commit();
              show('edit', piece);
            },
          }, METERS.map(m => h('option', { value: m.id, selected: m.id === meterName }, m.label))))),
      h('div', { class: 'tempo-row' },
        h('span', { class: 'style-label' }, 'Tempo'),
        h('input', { type: 'range', min: 30, max: 200, step: 1, value: piece.bpm, 'aria-label': 'Tempo in beats per minute', oninput: e => setBpm(+e.target.value) }),
        bpmLabel),
      h('div', { class: 'settings-row' },
        h('label', { class: 'row small' }, h('span', { class: 'muted' }, 'Key'),
          h('select', {
            class: 'input', 'aria-label': 'Key',
            onchange: e => { piece.key = e.target.value; commit(); show('edit', piece); },
          }, KEYS.map(k => h('option', { value: k, selected: k === piece.key }, k || 'none')))),
        toggle(piece.group === 1 ? 'Half counts (to place eighth notes)' : 'Finer grid (half counts)', piece.sub === 2, v => { piece.sub = v ? 2 : 1; commit(); draw(); })),
      h('div', { class: 'row between' },
        h('span', { class: 'muted small' }, 'Bars'),
        h('div', { class: 'row' },
          h('button', {
            type: 'button', class: 'btn small',
            onclick: () => {
              if (!removeLastBar(piece) && piece.bars > 1) {
                if (!window.confirm(`Bar ${piece.bars} has notes. Remove it anyway?`)) return;
                removeLastBar(piece, true);
              }
              bar = Math.min(bar, piece.bars - 1);
              commit();
              draw();
            },
          }, '− Last bar'),
          h('button', {
            type: 'button', class: 'btn small',
            onclick: () => {
              if (piece.bars >= MAX_BARS) return toast(`A piece can have up to ${MAX_BARS} bars.`);
              addBars(piece, 4);
              commit();
              draw();
            },
          }, '+ 4 bars'))),
      chipsEl,
      segmented([['type', 'Type it'], ['grid', 'Tap squares']], entryMode, v => { entryMode = v; settings.makerEntry = v; saveSettings(); draw(); }, 'How to enter the music'),
      typeCard,
      barCard,
      recorder.el,
      stage.el,
      h('button', {
        type: 'button', class: 'btn danger',
        onclick: () => {
          if (!window.confirm(`Delete “${piece.title}”?`)) return;
          pieces = pieces.filter(p => p.id !== piece.id);
          persist();
          show('list');
        },
      }, 'Delete this piece'));

    // the typed entry: a line of each hand at a time, from any bar
    fill(typeCard, typeEntry({
      pulses: piece.pulses, group: piece.group, flats,
      lanes: [
        { id: 'lh', title: 'Left hand (bass staff)', get: () => piece.lh, set: (from, bars) => bars.forEach((b, i) => { piece.lh[from + i] = b; }) },
        { id: 'rh', title: 'Right hand (treble staff)', get: () => piece.rh, set: (from, bars) => bars.forEach((b, i) => { piece.rh[from + i] = b; }) },
      ],
      barCount: () => piece.bars,
      extendTo: n => {
        if (n > MAX_BARS) return false;
        if (n > piece.bars) addBars(piece, n - piece.bars);
        return true;
      },
      afterApply: () => { if (engine) halt(); commit(); draw(); },
    }));

    playBtn.onclick = () => play(span().from - 1, span().to - 1);
    fromBtn.onclick = () => play(bar, Math.max(bar, span().to - 1));
    setBpm(piece.bpm, false);
    draw();
    return view;
  }

  show('list');
  return { el, onHide: () => { stop?.(); stopFull?.(); } };
}
