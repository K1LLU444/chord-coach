// "Read the note": a single note on a staff; find it on the keyboard, or choose its name.

import { h, fill, segmented, toggle } from '../dom.js';
import { renderBoard } from '../keyboard.js';
import { noteStaffSVG } from '../tune-sheet.js';
import { playNote } from '../audio.js';
import { MAX_LIVES, answerGame, gradeNote, nameChoices, newGame, pickNote, spell } from '../note-quiz.js';
import { settings, saveSettings, load, save } from '../store.js';

const CLEFS = [['treble', 'Treble (right hand)'], ['bass', 'Bass (left hand)'], ['both', 'Both']];
const ANSWERS = [['tap', 'Tap the key'], ['name', 'Choose its name']];

export function noteQuizView() {
  const clef = () => (['treble', 'bass', 'both'].includes(settings.noteClef) ? settings.noteClef : 'treble');
  const answerMode = () => (settings.noteAnswer === 'name' ? 'name' : 'tap');
  let progress = load('notes', {});
  const session = { right: 0, total: 0, streak: 0 };
  let question = null;
  let lastMidi = null;
  let answered = false;
  let hinted = false;
  const livesOn = () => settings.noteLives !== false;
  let game = newGame(Number(settings.noteBest) || 0);

  const stats = h('p', { class: 'quiz-stats' });
  const stage = h('section', { class: 'card quiz-stage', 'aria-live': 'polite' });

  function renderStats() {
    const percent = session.total ? Math.round((session.right / session.total) * 100) : null;
    fill(stats,
      livesOn() && h('span', { class: 'lives', 'aria-label': `${game.lives} of ${MAX_LIVES} lives left` }, '♥'.repeat(game.lives), h('span', { class: 'lost' }, '♥'.repeat(MAX_LIVES - game.lives))),
      livesOn() && h('span', {}, `Round: ${game.score}`),
      livesOn() && h('span', {}, `Best: ${Math.max(game.best, game.score)}`),
      h('span', {}, `All answers: ${session.right} / ${session.total}${percent === null ? '' : ` (${percent}%)`}`),
      !livesOn() && h('span', {}, `Streak: ${session.streak}`));
  }

  function next() {
    const n = pickNote({ clef: clef(), accidentals: Boolean(settings.noteBlack), progress, lastMidi });
    question = { ...n, flats: n.flats };
    lastMidi = n.midi;
    answered = false;
    hinted = false;
    draw();
  }

  function answer(midi) {
    if (answered) return;
    answered = true;
    const ok = midi === question.midi;
    gradeNote(progress, question.midi, ok);
    save('notes', progress);
    session.total++;
    session.right += ok ? 1 : 0;
    session.streak = ok ? session.streak + 1 : 0;
    if (livesOn()) {
      game = answerGame(game, ok);
      if (game.over && game.best > (Number(settings.noteBest) || 0)) { settings.noteBest = game.best; saveSettings(); }
    }
    renderStats();
    playNote(question.midi);
    draw(ok ? { ok: true } : { ok: false, chosen: midi });
  }

  function draw(result = null) {
    const name = spell(question.midi, question.flats);
    const staff = h('div', { class: 'quiz-staff-box' }, noteStaffSVG({ midi: question.midi, clef: question.clef, flats: question.flats, guide: hinted || Boolean(result) }));
    const feedback = h('div', { class: 'feedback' });
    if (result) {
      const newBest = game.over && game.score > 0 && game.score >= game.best;
      fill(feedback,
        h('p', { class: result.ok ? 'good' : 'bad' }, result.ok ? `✓ Correct! ${name}` : `It's ${name}${result.chosen != null ? ` (you chose ${spell(result.chosen, question.flats)})` : ''}.`),
        game.over && livesOn()
          ? h('div', { class: 'game-over' },
            h('h3', {}, 'Out of lives'),
            h('p', {}, `You got ${game.score} right this round.${newBest ? ' That is your best so far!' : ` Your best is ${game.best}.`}`),
            h('button', { type: 'button', class: 'btn primary', onclick: again, autofocus: true }, 'Play again'))
          : h('button', { type: 'button', class: 'btn primary', onclick: next, autofocus: true }, 'Next note →'));
    }

    let answerArea;
    if (answerMode() === 'tap') {
      answerArea = h('div', { class: 'board' });
      const showKey = result ? [question.midi] : [];
      renderBoard(answerArea, {
        lh: question.midi < 60 ? showKey : [],
        rh: question.midi >= 60 ? showKey : [],
        label: m => spell(m, question.flats),
        showAll: Boolean(settings.noteShowKeys),
        onKey: m => (answered ? playNote(m) : answer(m)),
        overview: false,
      });
    } else {
      const options = nameChoices(question.midi, question.flats, question.clef, Boolean(settings.noteBlack));
      answerArea = h('div', { class: 'options' }, options.map(o => h('button', {
        type: 'button', class: 'btn', disabled: answered,
        onclick: () => answer(o.midi),
      }, o.label)));
    }

    fill(stage,
      h('div', { class: 'prompt' },
        h('div', { class: 'muted small' }, answerMode() === 'tap' ? 'Which key is this note? Tap it on the keyboard.' : 'What is this note called?')),
      staff,
      !result && h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn small', disabled: hinted, onclick: () => { hinted = true; draw(); } }, hinted ? 'Letters shown' : '💡 Hint: show the letters of the lines and spaces')),
      answerArea,
      feedback);
  }

  function again() {
    game = newGame(Number(settings.noteBest) || 0);
    renderStats();
    next();
  }

  const reset = () => {
    if (!window.confirm('Reset the note-reading progress?')) return;
    progress = {};
    save('notes', progress);
    session.right = session.total = session.streak = 0;
    settings.noteBest = 0;
    saveSettings();
    game = newGame(0);
    renderStats();
    next();
  };

  const el = h('div', { class: 'note-quiz' },
    h('div', { class: 'quiz-controls' },
      segmented(CLEFS, clef(), v => { settings.noteClef = v; saveSettings(); lastMidi = null; next(); }, 'Which staff'),
      segmented(ANSWERS, answerMode(), v => { settings.noteAnswer = v; saveSettings(); draw(); }, 'How to answer'),
      toggle('Include sharps and flats (black keys)', Boolean(settings.noteBlack), v => { settings.noteBlack = v; saveSettings(); next(); }),
      toggle('3 lives: a wrong answer costs a life', livesOn(), v => { settings.noteLives = v; saveSettings(); game = newGame(Number(settings.noteBest) || 0); renderStats(); next(); }),
      toggle('Name every key on the keyboard (easier)', Boolean(settings.noteShowKeys), v => { settings.noteShowKeys = v; saveSettings(); draw(); })),
    stats, stage,
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn small', onclick: reset }, 'Reset progress')),
    h('p', { class: 'muted small' }, 'Middle C is C4. Notes you miss come back more often. The keyboard shows C3, C4 … so you can find your place; the dark keys are the sharps and flats.'));

  renderStats();
  next();
  return { el };
}
