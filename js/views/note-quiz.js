// "Read the note": a single note on a staff; find it on the keyboard, or choose its name.

import { h, fill, segmented, toggle } from '../dom.js';
import { renderBoard } from '../keyboard.js';
import { noteStaffSVG } from '../tune-sheet.js';
import { playNote } from '../audio.js';
import { TRIES, gradeNote, nameChoices, newTries, pickNote, solvedFirstTry, spell, tryAnswer } from '../note-quiz.js';
import { settings, saveSettings, load, save } from '../store.js';
import { piano } from '../midi.js';

const CLEFS = [['treble', 'Treble (right hand)'], ['bass', 'Bass (left hand)'], ['both', 'Both']];
const ANSWERS = [['tap', 'Tap the key'], ['name', 'Choose its name']];

export function noteQuizView() {
  const clef = () => (['treble', 'bass', 'both'].includes(settings.noteClef) ? settings.noteClef : 'treble');
  const answerMode = () => (settings.noteAnswer === 'name' ? 'name' : 'tap');
  let progress = load('notes', {});
  const session = { right: 0, total: 0, streak: 0 };
  let question = null;
  let lastMidi = null;
  let hinted = false;
  let tries = newTries();
  let wrongPicks = new Set(); // keys already tried (wrongly) for this note
  const triesOn = () => settings.noteLives !== false;
  const maxTries = () => (triesOn() ? TRIES : 1);

  const stats = h('p', { class: 'quiz-stats' });
  const stage = h('section', { class: 'card quiz-stage', 'aria-live': 'polite' });

  function renderStats() {
    const percent = session.total ? Math.round((session.right / session.total) * 100) : null;
    fill(stats,
      triesOn() && h('span', { class: 'lives', 'aria-label': `${tries.left} of ${tries.max} tries left for this note` },
        '♥'.repeat(tries.left), h('span', { class: 'lost' }, '♥'.repeat(tries.max - tries.left))),
      h('span', {}, `Right first time: ${session.right} of ${session.total}${percent === null ? '' : ` (${percent}%)`}`),
      h('span', {}, `Streak: ${session.streak}`));
  }

  function next() {
    const n = pickNote({ clef: clef(), accidentals: Boolean(settings.noteBlack), progress, lastMidi });
    question = { ...n, flats: n.flats };
    lastMidi = n.midi;
    tries = newTries(maxTries());
    wrongPicks = new Set();
    hinted = false;
    renderStats();
    draw();
  }

  // One answer. A wrong one costs a try (three tries for each note); when the tries run out the answer is shown.
  function answer(midi, viaPiano = false) {
    if (tries.done || wrongPicks.has(midi)) return;
    const ok = midi === question.midi;
    tries = tryAnswer(tries, ok);
    if (!ok) wrongPicks.add(midi);
    if (tries.done) {
      const first = solvedFirstTry(tries);
      gradeNote(progress, question.midi, first);
      save('notes', progress);
      session.total++;
      session.right += first ? 1 : 0;
      session.streak = first ? session.streak + 1 : 0;
      playNote(question.midi);
      renderStats();
      draw({ finished: true, ok, chosen: midi });
      // with the piano, a right answer moves on by itself after a split second
      if (viaPiano && ok) {
        const mine = question;
        setTimeout(() => { if (question === mine && tries.done && !el.closest('[hidden]')) next(); }, 800);
      }
    } else {
      if (tries.left === 1) hinted = true; // the last try comes with the letters of the staff
      renderStats();
      draw({ retry: true, chosen: midi });
    }
  }

  function draw(result = null) {
    const finished = Boolean(result?.finished);
    const name = spell(question.midi, question.flats);
    const staff = h('div', { class: 'quiz-staff-box' }, noteStaffSVG({ midi: question.midi, clef: question.clef, flats: question.flats, guide: hinted || finished }));
    const feedback = h('div', { class: 'feedback' });
    if (result?.retry) {
      fill(feedback, h('p', { class: 'bad' },
        `Not ${spell(result.chosen, question.flats)}. ${tries.left} ${tries.left === 1 ? 'try' : 'tries'} left for this note.${tries.left === 1 ? ' The letters of the lines and spaces are shown to help.' : ''}`));
    } else if (finished) {
      fill(feedback,
        h('p', { class: result.ok ? 'good' : 'bad' },
          result.ok ? `✓ Correct! ${name}${tries.wrong ? ` (try ${tries.wrong + 1})` : ''}` : `It's ${name}. No tries left for this note.`),
        h('button', { type: 'button', class: 'btn primary', onclick: next, autofocus: true }, 'Next note →'));
    }

    let answerArea;
    if (answerMode() === 'tap') {
      answerArea = h('div', { class: 'board' });
      const showKey = finished ? [question.midi] : [];
      renderBoard(answerArea, {
        lh: question.midi < 60 ? showKey : [],
        rh: question.midi >= 60 ? showKey : [],
        label: m => spell(m, question.flats),
        showAll: Boolean(settings.noteShowKeys),
        onKey: m => (tries.done ? playNote(m) : answer(m)),
        overview: false,
      });
    } else {
      const options = nameChoices(question.midi, question.flats, question.clef, Boolean(settings.noteBlack));
      answerArea = h('div', { class: 'options' }, options.map(o => h('button', {
        type: 'button', class: `btn${wrongPicks.has(o.midi) ? ' bad-btn' : ''}${finished && o.midi === question.midi ? ' good-btn' : ''}`, disabled: tries.done || wrongPicks.has(o.midi),
        onclick: () => answer(o.midi),
      }, o.label)));
    }

    fill(stage,
      h('div', { class: 'prompt' },
        h('div', { class: 'muted small' }, answerMode() === 'tap' ? 'Which key is this note? Tap it on the keyboard, or press it on your piano.' : 'What is this note called?')),
      staff,
      !tries.done && h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn small', disabled: hinted, onclick: () => { hinted = true; draw(result); } }, hinted ? 'Letters shown' : '💡 Hint: show the letters of the lines and spaces')),
      answerArea,
      feedback);
  }

  const reset = () => {
    if (!window.confirm('Reset the note-reading progress?')) return;
    progress = {};
    save('notes', progress);
    session.right = session.total = session.streak = 0;
    next();
  };

  const el = h('div', { class: 'note-quiz' },
    h('div', { class: 'quiz-controls' },
      segmented(CLEFS, clef(), v => { settings.noteClef = v; saveSettings(); lastMidi = null; next(); }, 'Which staff'),
      segmented(ANSWERS, answerMode(), v => { settings.noteAnswer = v; saveSettings(); draw(); }, 'How to answer'),
      toggle('Include sharps and flats (black keys)', Boolean(settings.noteBlack), v => { settings.noteBlack = v; saveSettings(); next(); }),
      toggle('3 tries for each note (off: one try)', triesOn(), v => { settings.noteLives = v; saveSettings(); next(); }),
      toggle('Name every key on the keyboard (easier)', Boolean(settings.noteShowKeys), v => { settings.noteShowKeys = v; saveSettings(); draw(); })),
    stats, stage,
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn small', onclick: reset }, 'Reset progress')),
    h('p', { class: 'muted small' }, 'Middle C is C4. Notes you miss come back more often. The keyboard shows C3, C4 … so you can find your place; the dark keys are the sharps and flats.'));

  renderStats();
  next();
  // the real piano: pressing the key is answering (when this quiz is on screen)
  piano.on(e => { if (e.type === 'on' && !el.closest('[hidden]') && el.isConnected && question && !tries.done) answer(e.midi, true); });
  return { el };
}
