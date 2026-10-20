// Quiz tab: flashcards with spaced repetition. Chords you miss come back more often.

import { h, segmented, toggle } from '../dom.js';
import { CHORD_TYPES, ROOTS, TYPE_BY_ID, LH_RANGE, RH_RANGE, makeChord, rhVoicing, lhPattern, handPlan, noteLabeler, noteName, gradeMarks } from '../theory.js';
import { renderBoard, renderPanel, keyboardSVG } from '../keyboard.js';
import { sheetElement } from '../sheet.js';
import { playNote, playBoth, playSequence, playPlan } from '../audio.js';
import { currentStyle, styleInfo } from '../style.js';
import { fingerPlan } from '../fingers.js';
import { settings, saveSettings, load, save } from '../store.js';
import { noteQuizView } from './note-quiz.js';

const POOLS = {
  basic: { label: 'Major & minor', types: ['maj', 'min'] },
  sevenths: { label: '+ 7ths', types: ['maj', 'min', '7', 'maj7', 'm7'] },
  all: { label: 'All types', types: CHORD_TYPES.filter(t => t.core).map(t => t.id) },
};
const MODES = [
  ['find', 'Find the keys'],
  ['piano', 'Play it'],
  ['name', 'Name it'],
  ['ear', 'Hear it'],
];
const MAX_BOX = 5; // Leitner boxes: 1 = keeps coming back, 5 = mastered

const shuffle = a => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function quizView() {
  if (settings.quizMode === 'mark') settings.quizMode = 'find'; // the old "Both hands" mode is now "Find the keys"
  let progress = load('quiz', {});
  const session = { right: 0, total: 0, streak: 0 };
  let card = null;
  let lastId = null;

  const stage = h('section', { class: 'card quiz-stage', 'aria-live': 'polite' });
  const stats = h('p', { class: 'quiz-stats' });
  const mastery = h('section', { class: 'card' });

  const cards = () => POOLS[settings.quizPool].types.flatMap(t => ROOTS.map(r => makeChord(r, TYPE_BY_ID[t])));
  // Ear training is tracked separately: recognising a chord by sound is a different skill from finding it.
  const PREFIX = { ear: 'ear:' };
  const keyOf = c => (PREFIX[settings.quizMode] || '') + c.id;
  const boxOf = c => progress[keyOf(c)]?.box || 0;

  function nextCard() {
    const list = cards();
    const weights = list.map(c => (c.id === lastId ? 0 : 2 ** (MAX_BOX - Math.max(1, boxOf(c)))));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    for (; i < list.length - 1; i++) if ((r -= weights[i]) <= 0) break;
    card = list[i];
    lastId = card.id;
    renderStage();
  }

  // `assisted`: solved with the hint, so it counts as practice but doesn't level the chord up.
  function grade(ok, assisted = false) {
    const p = progress[keyOf(card)] || { box: 0, seen: 0, right: 0 };
    p.seen++;
    if (ok && assisted) {
      p.box = Math.max(1, p.box);
    } else if (ok) {
      p.right++;
      p.box = Math.min(MAX_BOX, Math.max(1, p.box) + 1);
    } else {
      p.box = 1;
    }
    progress[keyOf(card)] = p;
    save('quiz', progress);
    session.total++;
    session.right += ok && !assisted ? 1 : 0;
    if (!assisted) session.streak = ok ? session.streak + 1 : 0;
    renderStats();
    renderMastery();
  }

  const planNow = () => handPlan(card, currentStyle());
  const answerBoard = () => {
    const el = h('div', { class: 'board' });
    const plan = planNow();
    renderBoard(el, { lh: plan.lh.notes, rh: plan.rh.notes, label: noteLabeler(card), showAll: settings.showAll, onKey: m => playNote(m), overview: false, fingers: settings.fingers ? fingerPlan(card, plan).map : undefined });
    return el;
  };
  const reveal = () => settings.revealSound && playPlan(planNow());
  const nextBtn = () => h('button', { type: 'button', class: 'btn primary', onclick: nextCard, autofocus: true }, 'Next chord →');
  const prompt = text => h('div', { class: 'prompt' },
    h('div', { class: 'muted small' }, text),
    h('div', { class: 'symbol big' }, card.symbol),
    h('div', { class: 'long' }, card.name));

  function renderStage() {
    if (settings.quizMode === 'find') findMode();
    else if (settings.quizMode === 'piano') pianoMode();
    else if (settings.quizMode === 'ear') earMode();
    else nameMode();
  }

  // Play it on the real piano, then reveal and be honest.
  function pianoMode() {
    const actions = h('div', { class: 'row' });
    const answer = h('div', {});
    actions.replaceChildren(h('button', {
      type: 'button',
      class: 'btn primary',
      onclick: () => {
        reveal();
        answer.replaceChildren(answerBoard());
        const done = ok => () => { grade(ok); nextCard(); };
        actions.replaceChildren(
          h('button', { type: 'button', class: 'btn bad-btn', onclick: done(false) }, '✗ Missed it'),
          h('button', { type: 'button', class: 'btn good-btn', onclick: done(true) }, '✓ Got it'));
      },
    }, 'Show answer'));
    stage.replaceChildren(
      prompt('Play this on your keyboard, both hands:'),
      h('p', { class: 'muted small' }, `${styleInfo().play} Then check.`),
      actions, answer);
  }

  // See both hands (no note names) and choose the chord. The lowest blue key is the root.
  function nameMode() {
    const style = currentStyle();
    const plan = planNow();
    const lh = plan.lh.notes;
    const rh = plan.rh.notes;
    const kb = h('div', { class: 'board' });
    const feedback = h('div', { class: 'feedback' });
    // Finger numbers would give the shape away, so they only appear once you have answered.
    const draw = (label, withFingers = false) => renderBoard(kb, { lh, rh, label, onKey: m => playNote(m), overview: false, fingers: withFingers && settings.fingers ? fingerPlan(card, plan).map : undefined });

    const pool = cards().filter(c => c.id !== card.id);
    const close = pool.filter(c => c.rootPc === card.rootPc || c.type === card.type);
    const options = shuffle([card, ...shuffle(close.length >= 3 ? close : pool).slice(0, 3)]);
    const buttons = options.map(o => h('button', {
      type: 'button',
      class: 'btn option',
      onclick: () => {
        if (feedback.childElementCount) return;
        const ok = o === card;
        grade(ok);
        buttons.forEach((b, i) => {
          if (options[i] === card) b.classList.add('good-btn');
          else if (options[i] === o) b.classList.add('bad-btn');
        });
        draw(noteLabeler(card), true);
        reveal();
        feedback.replaceChildren(
          h('p', { class: ok ? 'good' : 'bad' }, ok ? '✓ Correct!' : `It's ${card.symbol} (${card.notes.join(' + ')}).`),
          nextBtn());
      },
    }, o.symbol));

    draw(() => '');
    stage.replaceChildren(
      h('div', { class: 'prompt' }, h('div', { class: 'muted small' }, style === 'broken' ? 'Which chord is this? Hint: both hands play the same chord notes.' : 'Which chord is this? Hint: the lowest blue key is the root.')),
      kb,
      h('div', { class: 'options' }, buttons),
      feedback);
  }

  // Find the keys from memory on one keyboard: pick Blue (left hand) or Orange (right hand), then tap keys.
  // Three wrong checks and the answer is shown. The music sheet is an optional hint, and shows with the answer.
  function findMode() {
    const MAX_STRIKES = 3;
    const style = currentStyle();
    const plan = handPlan(card, style);
    const lhGoal = plan.lh.notes;
    const rhGoal = plan.rh.notes;
    const flats = card.root.includes('b') || card.root === 'F';
    const range = { from: LH_RANGE.from, to: RH_RANGE.to };
    const marks = new Map();
    let brush = 'lh';
    let strikes = 0;
    let hinted = false;
    let done = false;

    const sheet = h('div', { class: 'sheet-box' });
    const brushes = h('div', { class: 'brushes', role: 'group', 'aria-label': 'Which hand are you marking?' });
    const strikesEl = h('div', { class: 'strikes' });
    const scroller = h('div', { class: 'kb-scroll' });
    const overview = h('div', { class: 'overview' });
    const message = h('div', { class: 'feedback', 'aria-live': 'polite' });
    const actions = h('div', { class: 'row' });

    const drawStrikes = () => {
      strikesEl.setAttribute('aria-label', `${MAX_STRIKES - strikes} of ${MAX_STRIKES} strikes left`);
      strikesEl.replaceChildren(
        h('span', { class: 'muted small' }, 'Strikes'),
        ...Array.from({ length: MAX_STRIKES }, (_, i) => h('span', { class: 'strike' + (i < strikes ? ' used' : '') }, i < strikes ? '✕' : '')));
    };

    // The keyboard is wider than a phone screen: slide it sideways. Left hand lives on the left half, right hand on the right.
    const slideTo = hand => scroller.scrollTo({ left: hand === 'lh' ? 0 : scroller.scrollWidth / 2, behavior: 'smooth' });
    const drawBrushes = () => brushes.replaceChildren(...[['lh', 'Blue · Left'], ['rh', 'Orange · Right']].map(([id, text]) =>
      h('button', {
        type: 'button',
        class: `brush ${id}${brush === id ? ' active' : ''}`,
        'aria-pressed': String(brush === id),
        onclick: () => { brush = id; drawBrushes(); slideTo(id); },
      }, h('span', { class: `dot ${id}` }), text)));

    const drawKeys = (shown, label, onKey, fingers = null) => {
      renderPanel(scroller, { ...range, marks: shown, label, showAll: settings.showAll, onKey, fingers });
      overview.replaceChildren(
        keyboardSVG({ ...range, marks: shown, mini: true }),
        h('p', { class: 'muted small' }, 'Whole keyboard: C2 to B5. Slide the big keyboard sideways to reach the other keys.'));
    };

    const draw = () => drawKeys(marks, m => noteName(m, flats), m => {
      playNote(m);
      if (done) return;
      if (marks.get(m) === brush) marks.delete(m);
      else marks.set(m, brush);
      message.replaceChildren();
      draw();
    });

    const showSheet = () => sheet.replaceChildren(sheetElement({ chord: card, plan }));

    const hint = () => {
      hinted = true;
      showSheet();
      sheet.append(h('p', { class: 'muted small' }, 'You can still finish, but a chord solved with the hint won’t level up.'));
    };

    const finish = ok => {
      done = true;
      grade(ok, hinted);
      reveal();
      const answer = new Map([...lhGoal.map(m => [m, 'lh']), ...rhGoal.map(m => [m, 'rh'])]);
      drawKeys(answer, noteLabeler(card), m => playNote(m), settings.fingers ? fingerPlan(card, plan).map : null);
      showSheet();
      brushes.hidden = true;
      message.replaceChildren(h('p', { class: ok ? 'good' : 'bad' },
        !ok ? `Out of strikes. Here is the correct answer for ${card.symbol}.`
          : hinted ? '✓ Got it with the hint! Try this chord again later without it to level it up.'
            : strikes ? `✓ Got it, with ${strikes} strike${strikes === 1 ? '' : 's'}!` : '✓ Perfect, no strikes!'));
      actions.replaceChildren(nextBtn());
    };

    const part = (name, r) => `${name}: ${r.right} right${r.wrong ? `, ${r.wrong} wrong` : ''}${r.missing ? `, ${r.missing} missing` : ''}`;

    const check = () => {
      const result = gradeMarks(card, marks, style);
      if (result.empty) return message.replaceChildren(h('p', { class: 'bad' }, 'Mark some keys first.'));
      if (result.ok) return finish(true);

      strikes++;
      drawStrikes();
      if (strikes >= MAX_STRIKES) return finish(false);
      const left = MAX_STRIKES - strikes;
      const notesRight = !result.lh.wrong && !result.lh.missing && !result.rh.wrong && !result.rh.missing;
      const almost = style === 'broken'
        ? 'Almost! The notes are right, but the blue chord (left hand) should sit lower than the orange notes (right hand).'
        : style === 'strum'
          ? 'Almost! The notes are right, but the left hand is the root with its 5th above it.'
          : style === 'easy'
            ? 'Almost! The notes are right, but the left hand is only the root, one key.'
            : 'Almost! The notes are right, but the left hand goes root → 5th → octave, low to high, within one octave.';
      message.replaceChildren(h('p', { class: 'bad' },
        notesRight
          ? almost
          : `Not quite. ${part('Left hand', result.lh)} · ${part('Right hand', result.rh)}.`,
        ` ${left} strike${left === 1 ? '' : 's'} left.`));
    };

    sheet.append(h('button', { type: 'button', class: 'btn small', onclick: hint }, '💡 Hint: show the music sheet'));
    actions.replaceChildren(
      h('button', { type: 'button', class: 'btn', onclick: () => { marks.clear(); message.replaceChildren(); draw(); } }, 'Clear'),
      h('button', { type: 'button', class: 'btn primary', onclick: check }, 'Check'));

    drawStrikes();
    drawBrushes();
    draw();
    stage.replaceChildren(
      prompt('Find the keys for'),
      h('p', { class: 'muted small mark-hint' },
        style === 'broken'
          ? `Pick a colour, then tap keys. Blue = left hand: the whole chord (${lhGoal.length} keys), one octave lower than the right hand. Orange = right hand: the same ${card.pcs.length} notes, played one at a time.`
          : style === 'easy'
            ? `Pick a colour, then tap keys. Blue = left hand: 1 key, the root. Orange = right hand: the whole chord (${card.pcs.length} different notes).`
          : style === 'strum'
            ? `Pick a colour, then tap keys. Blue = left hand: 2 keys, the root and its 5th above it. Orange = right hand: the whole chord (${card.pcs.length} different notes), struck on every count.`
            : `Pick a colour, then tap keys. Blue = left hand: 3 keys, root → 5th → octave. Orange = right hand: ${card.pcs.length} different notes.`),
      sheet, strikesEl, brushes, scroller, overview, message, actions);
  }

  // Hear the chord and pick it. Every choice has the same root, so you're training your ear on the
  // chord's sound (major = bright, minor = sad…), which doesn't need perfect pitch.
  function earMode() {
    const lh = lhPattern(card);
    const rh = rhVoicing(card);
    const feedback = h('div', { class: 'feedback' });
    const answer = h('div', {});
    const together = () => playBoth([lh[0]], rh);
    const oneByOne = () => playSequence([lh[0], ...rh], 0, 0.45);

    const types = POOLS[settings.quizPool].types.filter(t => t !== card.type.id);
    const options = shuffle([card, ...shuffle(types).slice(0, 3).map(t => makeChord(card.root, TYPE_BY_ID[t]))]);
    const buttons = options.map(o => h('button', {
      type: 'button',
      class: 'btn option',
      onclick: () => {
        if (feedback.childElementCount) return;
        const ok = o === card;
        grade(ok);
        buttons.forEach((b, i) => {
          if (options[i] === card) b.classList.add('good-btn');
          else if (options[i] === o) b.classList.add('bad-btn');
        });
        answer.replaceChildren(answerBoard());
        feedback.replaceChildren(
          h('p', { class: ok ? 'good' : 'bad' }, ok ? `✓ Correct! That was ${card.name}.` : `It was ${card.symbol} (${card.type.name}).`),
          h('div', { class: 'row' },
            !ok && h('button', { type: 'button', class: 'btn', onclick: () => playBoth([lhPattern(o)[0]], rhVoicing(o)) }, `▶ Hear ${o.symbol}`),
            h('button', { type: 'button', class: 'btn', onclick: together }, `▶ Hear ${card.symbol}`),
            nextBtn()));
      },
    }, h('span', {}, o.symbol), h('small', { class: 'opt-sub' }, o.type.name)));

    stage.replaceChildren(
      h('div', { class: 'prompt' },
        h('div', { class: 'muted small' }, 'Listen, then pick the chord you heard'),
        h('div', { class: 'ear-icon', 'aria-hidden': 'true' }, '🎧')),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary', onclick: together }, '▶ Play chord'),
        h('button', { type: 'button', class: 'btn', onclick: oneByOne }, '▶ Note by note')),
      h('div', { class: 'options' }, buttons),
      h('p', { class: 'muted small ear-tip' },
        types.length === 1 ? 'Tip: major sounds bright and happy, minor sounds darker and sad.' : 'Tip: compare it with the plain major sound in your head first.'),
      feedback,
      answer);
    together(); // works after any tap (Next, switching mode); otherwise press Play
  }

  function renderStats() {
    const list = cards();
    const mastered = list.filter(c => boxOf(c) >= MAX_BOX).length;
    stats.replaceChildren(
      h('span', {}, `This session: ${session.right}/${session.total}`),
      h('span', {}, `Streak: ${session.streak}${session.streak >= 3 ? ' 🔥' : ''}`),
      h('span', {}, `Mastered: ${mastered}/${list.length}`));
  }

  function renderMastery() {
    const types = POOLS[settings.quizPool].types.map(t => TYPE_BY_ID[t]);
    mastery.replaceChildren(
      h('div', { class: 'row between' },
        h('h3', {}, settings.quizMode === 'ear' ? 'Your progress (by ear)' : 'Your progress'),
        h('button', {
          type: 'button',
          class: 'btn small',
          onclick: () => {
            if (!window.confirm('Reset all quiz progress?')) return;
            progress = {};
            save('quiz', progress);
            renderStats();
            renderMastery();
          },
        }, 'Reset')),
      h('div', { class: 'mastery', style: `--cols:${ROOTS.length}` },
        h('span', {}),
        ROOTS.map(r => h('span', { class: 'mh' }, r)),
        types.map(t => [
          h('span', { class: 'mh row-h' }, t.suffix || 'maj'),
          ROOTS.map(r => {
            const c = makeChord(r, t);
            const box = boxOf(c);
            return h('span', { class: `cell b${box}`, title: `${c.symbol}: ${box ? `level ${box} of ${MAX_BOX}` : 'not practised yet'}` });
          }),
        ])),
      h('div', { class: 'legend muted small' },
        h('span', {}, h('i', { class: 'cell b0' }), 'new'),
        h('span', {}, h('i', { class: 'cell b1' }), 'learning'),
        h('span', {}, h('i', { class: 'cell b3' }), 'getting there'),
        h('span', {}, h('i', { class: 'cell b5' }), 'mastered')));
  }

  const chordQuiz = h('div', { class: 'chord-quiz' },
    h('div', { class: 'quiz-controls' },
      segmented(MODES, settings.quizMode, v => {
        settings.quizMode = v;
        saveSettings();
        renderStats();
        renderMastery();
        nextCard();
      }, 'Quiz mode'),
      segmented(Object.entries(POOLS).map(([k, p]) => [k, p.label]), settings.quizPool, v => {
        settings.quizPool = v;
        saveSettings();
        lastId = null;
        renderStats();
        renderMastery();
        nextCard();
      }, 'Chords to practise'),
      toggle('Play the answer', settings.revealSound, v => { settings.revealSound = v; saveSettings(); })),
    stats, stage, mastery);

  // Two kinds of quiz: chords (the cards above) and reading single notes on a staff.
  const notes = noteQuizView();
  const kind = () => (settings.quizKind === 'notes' ? 'notes' : 'chords');
  const showKind = () => { chordQuiz.hidden = kind() !== 'chords'; notes.el.hidden = kind() !== 'notes'; };
  const el = h('div', { class: 'view' },
    segmented([['chords', 'Chords'], ['notes', 'Reading notes']], kind(), v => { settings.quizKind = v; saveSettings(); showKind(); }, 'Which quiz'),
    chordQuiz, notes.el);
  showKind();

  // The playing style is changed from the bar under the header; redraw the current card (the ear quiz doesn't depend on it).
  window.addEventListener('stylechange', () => card && settings.quizMode !== 'ear' && renderStage());

  renderStats();
  renderMastery();
  nextCard();
  return { el };
}
