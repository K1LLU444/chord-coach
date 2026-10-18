// Quiz tab: flashcards with spaced repetition. Chords you miss come back more often.

import { h, segmented, toggle } from '../dom.js';
import { CHORD_TYPES, ROOTS, TYPE_BY_ID, RH_RANGE, makeChord, rhVoicing, lhPattern, noteLabeler, noteName } from '../theory.js';
import { renderBoard, renderPanel } from '../keyboard.js';
import { playNote, playBoth, playSequence } from '../audio.js';
import { settings, saveSettings, load, save } from '../store.js';

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
  let progress = load('quiz', {});
  const session = { right: 0, total: 0, streak: 0 };
  let card = null;
  let lastId = null;

  const stage = h('section', { class: 'card quiz-stage', 'aria-live': 'polite' });
  const stats = h('p', { class: 'quiz-stats' });
  const mastery = h('section', { class: 'card' });

  const cards = () => POOLS[settings.quizPool].types.flatMap(t => ROOTS.map(r => makeChord(r, TYPE_BY_ID[t])));
  // Ear training is tracked separately: recognising a chord by sound is a different skill from finding it.
  const keyOf = c => (settings.quizMode === 'ear' ? 'ear:' : '') + c.id;
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

  function grade(ok) {
    const p = progress[keyOf(card)] || { box: 0, seen: 0, right: 0 };
    p.seen++;
    if (ok) {
      p.right++;
      p.box = Math.min(MAX_BOX, Math.max(1, p.box) + 1);
    } else {
      p.box = 1;
    }
    progress[keyOf(card)] = p;
    save('quiz', progress);
    session.total++;
    session.right += ok ? 1 : 0;
    session.streak = ok ? session.streak + 1 : 0;
    renderStats();
    renderMastery();
  }

  const answerBoard = () => {
    const el = h('div', { class: 'board' });
    renderBoard(el, { lh: lhPattern(card), rh: rhVoicing(card), label: noteLabeler(card), showAll: settings.showAll, onKey: m => playNote(m), overview: false });
    return el;
  };
  const reveal = () => settings.revealSound && playBoth(lhPattern(card), rhVoicing(card));
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

  // Tap the right-hand notes on the screen keyboard (any octave, any order).
  function findMode() {
    const picks = new Set();
    let done = false;
    const kb = h('div', { class: 'kb-box' });
    const feedback = h('div', { class: 'feedback' });
    const actions = h('div', { class: 'row' });

    const draw = () => {
      const marks = new Map([...picks].map(m => [m, done ? (card.pcs.includes(m % 12) ? 'right' : 'wrong') : 'pick']));
      const label = done ? noteLabeler(card) : m => noteName(m);
      renderPanel(kb, {
        ...RH_RANGE, marks, label, showAll: settings.showAll,
        onKey: m => {
          playNote(m);
          if (done) return;
          picks.has(m) ? picks.delete(m) : picks.add(m);
          draw();
        },
      });
    };

    const check = () => {
      if (!picks.size) return;
      const chosen = new Set([...picks].map(m => m % 12));
      const ok = chosen.size === card.pcs.length && card.pcs.every(pc => chosen.has(pc));
      done = true;
      grade(ok);
      draw();
      reveal();
      feedback.replaceChildren(
        h('p', { class: ok ? 'good' : 'bad' }, ok ? '✓ Correct!' : `Not quite. ${card.symbol} is ${card.notes.join(' + ')}.`),
        answerBoard());
      actions.replaceChildren(nextBtn());
    };

    actions.replaceChildren(
      h('button', { type: 'button', class: 'btn', onclick: () => { picks.clear(); draw(); } }, 'Clear'),
      h('button', { type: 'button', class: 'btn primary', onclick: check }, 'Check'));
    draw();
    stage.replaceChildren(prompt('Tap the right-hand keys for'), kb, actions, feedback);
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
      h('p', { class: 'muted small' }, 'Left hand: root → 5th → octave. Right hand: the chord. Then check.'),
      actions, answer);
  }

  // See both hands (no note names) and choose the chord. The lowest blue key is the root.
  function nameMode() {
    const lh = lhPattern(card);
    const rh = rhVoicing(card);
    const kb = h('div', { class: 'board' });
    const feedback = h('div', { class: 'feedback' });
    const draw = label => renderBoard(kb, { lh, rh, label, onKey: m => playNote(m), overview: false });

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
        draw(noteLabeler(card));
        reveal();
        feedback.replaceChildren(
          h('p', { class: ok ? 'good' : 'bad' }, ok ? '✓ Correct!' : `It's ${card.symbol} (${card.notes.join(' + ')}).`),
          nextBtn());
      },
    }, o.symbol));

    draw(() => '');
    stage.replaceChildren(
      h('div', { class: 'prompt' }, h('div', { class: 'muted small' }, 'Which chord is this? Hint: the lowest blue key is the root.')),
      kb,
      h('div', { class: 'options' }, buttons),
      feedback);
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

  const el = h('div', { class: 'view' },
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

  renderStats();
  renderMastery();
  nextCard();
  return { el };
}
