// Sheets tab: printable cheat sheets for the music stand (A4, one topic per page).
// Everything is worked out by the same chord logic the rest of the app uses, so the sheets never disagree with it.

import { h, fill, segmented, toggle } from '../dom.js';
import { CHORD_TYPES, ROOTS, TYPE_BY_ID, STYLES, makeChord, noteLabeler, handPlan, parseSong, parseChord, easyBass } from '../theory.js';
import { analyzeSong, countText, simplerChord, songForm } from '../analyze.js';
import { handText } from '../style.js';
import { sheetSVG } from '../sheet.js';
import { keySignature, layoutPage, tuneSheetSVG } from '../tune-sheet.js';
import { fingerBars } from '../fingering.js';
import { isEmpty as tuneIsEmpty, prefersFlats } from '../melody.js';
import { DEFAULT_FEEL } from '../rhythm.js';
import { loadSongs, loadPieces, settings, saveSettings } from '../store.js';
import { markTies, pieceFeel, pieceIsEmpty } from '../piece.js';

const PAGES = 5;
const A4_WIDTH = 794; // pixels at 96 dpi

/** Flats and sharps as proper signs: Bb → B♭, C# → C♯, m7b5 → m7♭5. */
const fancy = s => String(s).replace(/([A-G])b/g, '$1♭').replace(/(\d)b/g, '$1♭').replace(/#/g, '♯');
const joinNotes = (chord, midis, sep) => midis.map(noteLabeler(chord)).map(fancy).join(sep);
const bassLine = chord => joinNotes(chord, handPlan(chord, 'bass').lh.notes, ' → ');
const chordNotes = chord => chord.notes.map(fancy).join('  ');
const steps = type => type.intervals.slice(1).map((iv, i) => iv - type.intervals[i]);

const paper = ({ num, title, footer, extra = '' }, ...children) => h('section', { class: `page ${extra}`.trim(), 'aria-label': `${footer}: ${title}` },
  h('header', { class: 'page-head' }, h('span', { class: 'page-num' }, num), h('h2', {}, title)),
  h('div', { class: 'page-body' }, children),
  h('footer', { class: 'page-foot' }, footer));
const page = (n, title, ...children) => paper({ num: n, title, footer: `Chord Coach · cheat sheet ${n} of ${PAGES}` }, ...children);

const table = (head, rows) => h('table', {},
  h('thead', {}, h('tr', {}, head.map(t => h('th', {}, t)))),
  h('tbody', {}, rows));

// ---------- 1 · Read any chord ----------

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}

/** One octave of keys with the half steps counted from C (0 to 12). */
function octaveDiagram() {
  const W = 62;
  const H = 150;
  const BW = 38;
  const BH = 92;
  const root = svg('svg', { viewBox: `0 0 ${W * 8} ${H + 34}`, class: 'octave', role: 'img', 'aria-label': 'One octave of piano keys, counted in half steps from C' });
  const whites = [['C', 0], ['D', 2], ['E', 4], ['F', 5], ['G', 7], ['A', 9], ['B', 11], ['C', 12]];
  whites.forEach(([name, steps], i) => {
    root.append(svg('rect', { x: i * W + 1, y: 1, width: W - 2, height: H, rx: 5, class: 'wk' }));
    root.append(svg('text', { x: i * W + W / 2, y: H - 36, class: 'wk-name' }, name));
    root.append(svg('text', { x: i * W + W / 2, y: H + 25, class: 'wk-step' }, String(steps)));
  });
  // [white key to the left, sharp name, flat name, half steps from C]
  [[0, 'C♯', 'D♭', 1], [1, 'D♯', 'E♭', 3], [3, 'F♯', 'G♭', 6], [4, 'G♯', 'A♭', 8], [5, 'A♯', 'B♭', 10]].forEach(([left, sharp, flat, count]) => {
    const x = (left + 1) * W - BW / 2;
    root.append(svg('rect', { x, y: 1, width: BW, height: BH, rx: 4, class: 'bk' }));
    root.append(svg('text', { x: x + BW / 2, y: 34, class: 'bk-name' }, sharp));
    root.append(svg('text', { x: x + BW / 2, y: 50, class: 'bk-name' }, flat));
    root.append(svg('text', { x: x + BW / 2, y: 80, class: 'bk-step' }, String(count)));
  });
  return root;
}

function readChordsPage(n) {
  const order = ['maj', 'min', '7', 'm7', 'maj7', 'sus2', 'sus4', 'dim', 'aug', '6', 'add9'];
  const rows = order.map(id => {
    const type = TYPE_BY_ID[id];
    const c = makeChord('C', type);
    return h('tr', {},
      h('td', { class: 'ch' }, type.name),
      h('td', { class: 'ch' }, `C${type.suffix}`),
      h('td', {}, 'root ', steps(type).map(s => `+${s}`).join(' ')),
      h('td', { class: 'muted' }, type.intervals.slice(1).map(i => `+${i}`).join(' ')),
      h('td', {}, chordNotes(c)));
  });
  return page(n, 'Read any chord',
    h('div', { class: 'box' },
      octaveDiagram(),
      h('p', { class: 'note' }, h('b', {}, 'Half step'), ' = the very next key, white or black. The numbers count half steps from C. ',
        h('b', {}, 'E → F'), ' and ', h('b', {}, 'B → C'), ' are only one step apart (no black key between them).')),
    h('div', { class: 'two' },
      h('div', { class: 'box' },
        h('h3', {}, '1 · The letter is the root'),
        h('p', {}, 'It is the key the chord starts on. ', h('b', {}, '♯'), ' = the key just to the right. ', h('b', {}, '♭'), ' = the key just to the left (B♭ is the black key left of B).')),
      h('div', { class: 'box' },
        h('h3', {}, '2 · Count up from the root'),
        h('p', {}, 'The ending says which notes to add. Count half steps up from the root for each note. The ', h('b', {}, '5th = +7'), ' and the ', h('b', {}, 'octave = +12'), '.'))),
    table(['Chord type', 'Written', 'Step by step', 'From the root', 'Example on C'], rows),
    h('div', { class: 'two' },
      h('div', { class: 'box lh-box' },
        h('h3', {}, 'Example: Fm (F minor)'),
        h('p', {}, 'F → ', h('b', {}, '+3'), ' = A♭ → ', h('b', {}, '+4'), ' = C. The chord is ', h('b', {}, 'F + A♭ + C'), '.')),
      h('div', { class: 'box rh-box' },
        h('h3', {}, 'Example: B♭ (major)'),
        h('p', {}, 'B♭ → ', h('b', {}, '+4'), ' = D → ', h('b', {}, '+3'), ' = F. The chord is ', h('b', {}, 'B♭ + D + F'), '.'))),
    h('p', { class: 'note' }, 'Your CT-S300 has 61 keys, C2 to C7. ', h('b', {}, 'Middle C'), ' is the 3rd C from the left. The left hand plays below it and the right hand from it upward.'));
}

// ---------- 2 · Playing styles ----------

const STYLE_TEXT = {
  bass: {
    lh: 'root → +7 → +12, one key at a time',
    rh: 'the chord together: root, +4, +3 (major) or root, +3, +4 (minor)',
    feel: 'Bass notes are spread over the bar; the chord is struck at the start and again in the middle.',
    good: 'Slow songs and waltz feels. A full sound from simple parts.',
  },
  strum: {
    lh: 'root → +7, one key at a time (root on count 1, the 5th in the middle of the bar)',
    rh: 'the same chord, struck together on every count',
    feel: 'Count 1-2-3-4 (or 1-2-3 4-5-6) and hit the chord on each count. Press the accented count harder.',
    good: 'Songs with a guitar strum, like “Until I Found You”.',
  },
  broken: {
    lh: 'the chord together, one octave lower than the right hand',
    rh: 'the same notes one at a time, low to high, then round again',
    feel: 'Left hand presses the chord on count 1 (and again mid-bar). Right hand plays one note on every count.',
    good: 'Gentle, flowing, picked-guitar style playing.',
  },
};

function stylesPage(n) {
  const fm = parseChord('Fm');
  const label = noteLabeler(fm);
  const cards = ['bass', 'strum', 'broken'].map(id => {
    const info = STYLES.find(s => s.id === id);
    const text = STYLE_TEXT[id];
    const plan = handPlan(fm, id);
    return h('div', { class: 'style-card' },
      h('h3', {}, info.name),
      h('p', {}, h('b', { class: 'lh-t' }, 'Left hand: '), text.lh),
      h('p', {}, h('b', { class: 'rh-t' }, 'Right hand: '), text.rh),
      h('p', { class: 'small' }, text.feel),
      h('p', { class: 'small' }, h('b', {}, 'Good for: '), text.good),
      h('div', { class: 'example' },
        h('div', { class: 'example-title' }, 'Example: Fm'),
        h('p', {}, h('b', { class: 'lh-t' }, 'L '), fancy(handText(plan.lh, label))),
        h('p', {}, h('b', { class: 'rh-t' }, 'R '), fancy(handText(plan.rh, label)))));
  });

  return page(n, 'The three playing styles',
    h('div', { class: 'three' }, cards),
    h('div', { class: 'box' },
      h('p', {}, h('b', { class: 'rh-t' }, 'The right hand uses the same notes in every style'), ' (the chord). Only the timing changes: held, struck on every count, or one at a time.'),
      h('p', {}, h('b', { class: 'lh-t' }, 'The left hand is what changes'), ': bass notes (root, +7, octave), just two bass notes, or the whole chord.')),
    h('div', { class: 'box' },
      h('h3', {}, 'Which style fits a song?'),
      h('p', {}, 'Listen to what plays under the singing. ', h('b', {}, 'Repeated chord hits'), ' → Strum or Bass + chord. ',
        h('b', {}, 'Flowing single notes'), ' → Chord + broken notes.')),
    h('div', { class: 'box' },
      h('h3', {}, 'Fingers (1 thumb · 2 index · 3 middle · 4 ring · 5 pinky, both hands)'),
      table(['What', 'Fingers'], [
        ['Right hand chord, 3 notes', '1 · 3 · 5'],
        ['Right hand chord, 4 notes (7th chords)', '1 · 2 · 3 · 5'],
        ['Right hand, one note at a time', 'the same fingers; keep your hand over the keys'],
        ['Left hand bass pattern (Bass + chord): root, 5th, octave', '5 · 2 · 1'],
        ['Left hand bass (Strum): root, 5th', '5 · 1'],
        ['Left hand chord (Chord + broken notes), 3 notes', '5 · 3 · 1'],
        ['Left hand chord, 4 notes', '5 · 3 · 2 · 1'],
      ].map(([what, fingers]) => h('tr', {}, h('td', {}, what), h('td', { class: 'ch' }, fingers))))),
    h('p', { class: 'note' }, 'These are the common beginner fingerings. If one feels cramped, use the one that is comfortable for your hand. The thumb may land on a black key (like B♭); that is normal.'));
}

// ---------- 3 · All major and minor chords ----------

function allChordsPage(n) {
  const make = typeId => ROOTS.map(root => {
    const c = makeChord(root, TYPE_BY_ID[typeId]);
    return h('tr', {},
      h('td', { class: 'ch big' }, fancy(c.symbol)),
      h('td', {}, chordNotes(c)),
      h('td', { class: 'lh-t' }, bassLine(c)));
  });
  const head = ['Chord', 'Chord notes', 'Left-hand bass'];
  return page(n, 'All major and minor chords',
    h('div', { class: 'two tables' },
      h('div', {}, h('h3', {}, 'Major'), table(head, make('maj'))),
      h('div', {}, h('h3', {}, 'Minor'), table(head, make('min')))),
    h('div', { class: 'box' },
      h('p', {}, h('b', { class: 'rh-t' }, 'Right hand'), ' = the chord notes together (Bass + chord, Strum) or one at a time (Chord + broken notes).'),
      h('p', {}, h('b', { class: 'lh-t' }, 'Left hand'), ' = the bass notes shown (Bass + chord uses all three, Strum uses the first two). In Chord + broken notes the left hand plays the chord notes together, one octave lower.')));
}

// ---------- 4 · 7ths and other chords ----------

function seventhsPage(n) {
  const types = [['7', '7th'], ['m7', 'minor 7th'], ['maj7', 'major 7th'], ['sus2', 'sus2'], ['sus4', 'sus4']].map(([id, name]) => [TYPE_BY_ID[id], name]);
  const rows = ROOTS.map(root => h('tr', {},
    h('td', { class: 'ch big' }, fancy(root)),
    types.map(([type]) => h('td', {}, chordNotes(makeChord(root, type))))));
  const head = ['Root', ...types.map(([type, name]) => `${name} (${type.suffix || ''}) · ${steps(type).length ? 'root ' + steps(type).map(s => `+${s}`).join(' ') : ''}`)];
  return page(n, '7th and other chords',
    table(head, rows),
    h('div', { class: 'two' },
      h('div', { class: 'box' },
        h('h3', {}, 'Too hard? Play it simpler'),
        h('p', {}, h('b', {}, '7, m7, maj7'), ' → play the plain major or minor chord (F7 → F, Am7 → Am). ', h('b', {}, 'sus'), ' chords → play the plain major chord.')),
      h('div', { class: 'box' },
        h('h3', {}, 'The extra note'),
        h('p', {}, h('b', {}, '7'), ' adds +10 from the root. ', h('b', {}, 'maj7'), ' adds +11. ', h('b', {}, 'm7'), ' = minor chord + 10. ', h('b', {}, 'sus2'), ' swaps the 3rd for +2; ', h('b', {}, 'sus4'), ' for +5.'))),
    h('p', { class: 'note' }, 'The left hand plays the same bass notes as for the plain chord (root, +7, octave). The right hand adds the extra note.'));
}

// ---------- 5 · One of your songs ----------

function songPage(n, song) {
  if (!song) {
    return page(n, 'Your song', h('p', { class: 'empty' }, 'No songs yet. Add one in the Songs tab, then come back and pick it here.'));
  }
  const a = analyzeSong(song);
  const form = songForm(song);
  const unique = [...new Map(parseSong(song.text).chords.map(c => [c.symbol, c])).values()];
  const best = STYLES.find(s => s.id === a.style);
  const accents = a.feel.hits.map((hit, i) => (hit.accent ? i + 1 : null)).filter(Boolean);
  const fact = (name, value) => h('div', { class: 'fact' }, h('span', { class: 'fact-name' }, name), h('span', { class: 'fact-value' }, value));

  const rows = unique.map(c => {
    const simple = simplerChord(c);
    return h('tr', {},
      h('td', { class: 'ch big' }, fancy(c.symbol)),
      h('td', {}, chordNotes(c)),
      h('td', { class: 'lh-t' }, bassLine(c)),
      h('td', { class: 'muted' }, simple.symbol !== c.symbol ? `or ${fancy(simple.symbol)}` : ''));
  });

  return page(n, song.title,
    h('div', { class: 'facts' },
      a.key && fact('Key', fancy(a.key)),
      fact('Tempo', `${a.feel.bpm} bpm`),
      fact('Count', countText(a.feel)),
      fact('Bar', a.signature),
      fact('Best style', best.name)),
    h('p', { class: 'note' }, a.hasPattern ? a.why : `${a.why} Default count shown.`),
    a.style === 'strum' && h('div', { class: 'box rh-box' },
      h('p', {}, h('b', { class: 'rh-t' }, 'Strum: '), `strike the chord on every count (${countText(a.feel)})`, accents.length ? `, harder on ${accents.join(' and ')}` : '', '.'),
      h('p', {}, h('b', { class: 'lh-t' }, 'Left hand: '), 'the root on count 1 and its 5th on count ', String(Math.floor(a.feel.pulses / 2) + 1), '.')),
    h('h3', {}, 'Order of the song'),
    h('p', { class: 'form' }, form.order.join('  →  ')),
    h('h3', {}, 'The chords, line by line'),
    form.groups.map(g => h('div', { class: 'line' },
      h('span', { class: 'line-name' }, g.names.join(' · ')),
      h('span', { class: 'line-chords' }, g.chords.map(c => h('span', { class: 'cc' }, fancy(c)))))),
    h('h3', {}, 'The chords you need'),
    table(['Chord', 'Chord notes', 'Left-hand bass', 'Easier'], rows));
}

// ---------- Music sheets: every chord on a staff, one playing style per page ----------

// The common chord types come first (the same nine the Chords tab shows first); the rarer ones are optional.
const COMMON_TYPES = ['maj', 'min', '7', 'm7', 'maj7', 'sus2', 'sus4', 'dim', 'aug'];
const RARER_TYPES = ['6', 'm6', 'add9', 'madd9', '9', 'm9', 'maj9', '7sus4', 'dim7', 'm7b5', 'mMaj7'];
const STYLE_ORDER = ['bass', 'strum', 'broken'];
// The strum count: 4 counts (4/4), or 6 counts in two triplet groups (6/8, like the song's own strum).
const SIX_FEEL = { bpm: 67, pulses: 6, group: 3, hits: [{}, {}, {}, { accent: true }, {}, {}] };
const feelFor = count => (count === '6' ? SIX_FEEL : DEFAULT_FEEL);

const HOW = {
  bass: () => 'Left hand: single bass notes (root, 5th, octave). Right hand: the whole chord, held.',
  strum: feel => `Left hand: the root on count 1 and its 5th in the middle of the bar. Right hand: the whole chord struck on every count (${countText(feel)}); the beams join each group.`,
  broken: () => 'Left hand: the whole chord together, one octave lower. Right hand: the same notes one at a time, low to high.',
};

function musicPage(num, total, styleId, type, feel) {
  const info = STYLES.find(s => s.id === styleId);
  const cells = ROOTS.map(root => {
    const chord = makeChord(root, type);
    const plan = handPlan(chord, styleId, { feel });
    const label = noteLabeler(chord);
    return h('figure', { class: 'mini' },
      sheetSVG({ chord, plan, compact: true }),
      h('figcaption', {},
        h('div', {}, h('b', { class: 'lh-t' }, 'L '), fancy(handText(plan.lh, label))),
        h('div', {}, h('b', { class: 'rh-t' }, 'R '), fancy(handText(plan.rh, label)))));
  });
  return paper({ num, title: `${info.name} · ${type.name}`, footer: `Chord Coach · music sheets · ${info.name} · page ${num} of ${total}`, extra: 'music' },
    h('div', { class: 'music-legend' },
      h('span', { class: 'legend-item' }, h('i', { class: 'swatch lh' }), 'Left hand (bass staff)'),
      h('span', { class: 'legend-item' }, h('i', { class: 'swatch rh' }), 'Right hand (treble staff)'),
      h('span', { class: 'how' }, HOW[styleId](feel))),
    h('div', { class: 'mini-grid' }, cells),
    h('p', { class: 'note' }, 'Staff letters. Lines: treble E G B D F, bass G B D F A. Spaces: treble F A C E, bass A C E G. The two numbers after the clefs are the time signature (how many counts in the bar).'));
}

// ---------- Tune sheet: a song's tune and held bass notes, in lines of four bars ----------

function tunePagesFor({ title, key, bpm, feel, bars, flats, signature }) {
  const signature_ = keySignature(key);
  const useSignature = Boolean(settings.sheetKeySig); // the key signature is an option; by default each ♭ or ♯ is written beside its note
  const hasSignature = useSignature && signature_.letters.length > 0;
  // bars on a line: fewer bars means more room for each note; long bars (9/8, 12/8) always get two to a line
  const chosen = [2, 3, 4].includes(settings.sheetPerLine) ? settings.sheetPerLine : 3;
  const perLine = feel.pulses >= 9 ? Math.min(chosen, 2) : chosen;
  // in plain words, e.g. "play every B as B♭ and every E as E♭" (the black key just to the left)
  const signatureText = hasSignature
    ? `Key signature: ${signature_.letters.length} ${signature_.kind === 'flat' ? 'flat' : 'sharp'}${signature_.letters.length === 1 ? '' : 's'} at the start of each line. Play ${signature_.letters.map(l => `every ${l} as ${l}${signature_.kind === 'flat' ? '♭' : '♯'}`).join(' and ')} (the black key just to the ${signature_.kind === 'flat' ? 'left' : 'right'}), in every octave, with both hands.`
    : '';
  const groups = layoutPage(bars.length, perLine);
  const count = h('span', { class: 'fact-value' }, countText(feel));
  return groups.map((lines, i) => paper(
    { num: i + 1, title, footer: `Chord Coach · ${title} · page ${i + 1} of ${groups.length}`, extra: 'tune-page' },
    i === 0 && h('div', { class: 'facts' },
      key && h('div', { class: 'fact' }, h('span', { class: 'fact-name' }, 'Key'), h('span', { class: 'fact-value' }, fancy(key))),
      h('div', { class: 'fact' }, h('span', { class: 'fact-name' }, 'Tempo'), h('span', { class: 'fact-value' }, `${bpm} bpm`)),
      h('div', { class: 'fact' }, h('span', { class: 'fact-name' }, 'Bar'), h('span', { class: 'fact-value' }, signature)),
      h('div', { class: 'fact' }, h('span', { class: 'fact-name' }, 'Count'), count)),
    h('div', { class: 'music-legend' },
      h('span', { class: 'legend-item' }, h('i', { class: 'swatch rh' }), 'Right hand (treble staff)'),
      h('span', { class: 'legend-item' }, h('i', { class: 'swatch lh' }), 'Left hand (bass staff)'),
      h('span', { class: 'how' }, `The number at the start of a line is its first bar. ${hasSignature ? 'The flats or sharps at the start of each line are the key signature: they apply to every note of that letter. A sign in front of a note changes it for the rest of that bar.'   : 'A ♭ or ♯ beside a note means play the black key to its left (♭) or right (♯); a ♮ means the plain white key.'} A curved line joins two notes that are played as one long note.`)),
    hasSignature && h('div', { class: 'box rh-box' }, h('b', {}, signatureText)),
    settings.sheetGuide !== false && h('p', { class: 'note' }, h('b', {}, 'Reading the letters on the left: '),
      'they name every line and space of the staff. ', h('b', {}, 'Treble'), ' (right hand): lines E G B D F, spaces F A C E. ', h('b', {}, 'Bass'), ' (left hand): lines G B D F A, spaces A C E G. ',
      'Middle C sits between the two staves on its own short line. A letter that is bigger and coloured is used in that line of music.'),
    tuneSheetSVG({ lines, bars, feel, flats, firstLine: i === 0, guide: settings.sheetGuide !== false, noteNames: Boolean(settings.sheetNames), fingers: settings.sheetFingers !== false, keyText: hasSignature ? key : '', perLine })));
}

const signatureOfFeel = (feel, fallback) => (feel.group === 3 ? `${feel.pulses}/8` : feel.group === 1 ? `${feel.pulses}/4` : fallback);

/** The tune sheet of a song: its tune on the treble staff, its own bass line (or the held root of each chord) on the bass staff. */
function tunePages(song) {
  const a = analyzeSong(song);
  const feel = { ...a.feel, pulses: song.melody.pulses, group: song.melody.group };
  const chords = parseSong(song.text).chords;
  const long = feel.group === 1 ? 2 : 3;
  const rightFingers = fingerBars(song.melody.bars, 'rh', feel.pulses, long);
  const leftFingers = song.melody.bass ? fingerBars(song.melody.bass, 'lh', feel.pulses, long) : null;
  const bars = chords.map((chord, i) => ({
    chord: fancy(chord.symbol), melody: song.melody.bars[i] ?? [], bassLine: song.melody.bass?.[i] ?? null, bass: easyBass(chord),
    tuneFingers: rightFingers[i] ?? [], bassFingers: leftFingers?.[i] ?? [5], // a held bass root is played with the little finger
  }));
  return tunePagesFor({ title: song.title, key: a.key, bpm: a.feel.bpm, feel, bars, flats: prefersFlats(song.meta?.key), signature: signatureOfFeel(feel, a.signature) });
}

/** The sheet of a piece made in the Maker: exactly the notes that were entered. */
function piecePages(piece) {
  const feel = pieceFeel(piece);
  const long = piece.group === 1 ? 2 : 3;
  const rightFingers = fingerBars(piece.rh, 'rh', piece.pulses, long);
  const leftFingers = fingerBars(piece.lh, 'lh', piece.pulses, long);
  const rhBars = markTies(piece.rh, piece.pulses);
  const lhBars = markTies(piece.lh, piece.pulses);
  const bars = piece.rh.map((_, i) => ({ chord: fancy(piece.chords[i] || ''), melody: rhBars[i], bassLine: lhBars[i], bass: null, tuneFingers: rightFingers[i], bassFingers: leftFingers[i] }));
  return tunePagesFor({ title: piece.title, key: piece.key, bpm: piece.bpm, feel, bars, flats: prefersFlats(piece.key), signature: signatureOfFeel(feel, '') });
}

// ---------- the tab ----------

export function sheetsView() {
  const pages = h('div', { class: 'sheet-pages' });
  const controls = h('div', { class: 'card sheets-controls' });
  const el = h('div', { class: 'view', id: 'sheets-root' }, controls, pages);
  const mode = () => (['music', 'tune'].includes(settings.sheetMode) ? settings.sheetMode : 'cheat');
  const style = () => (STYLE_ORDER.includes(settings.sheetStyle) ? settings.sheetStyle : 'bass');
  const count = () => (settings.strumCount === '6' ? '6' : '4');
  const types = () => (settings.sheetRare ? [...COMMON_TYPES, ...RARER_TYPES] : COMMON_TYPES);
  const set = (key, value) => { settings[key] = value; saveSettings(); draw(); };

  const fit = () => {
    const room = el.clientWidth || A4_WIDTH;
    pages.style.zoom = String(Math.min(1, (room - 4) / A4_WIDTH));
  };

  // What can be printed as a tune sheet: pieces made in the Maker, and songs that have a tune.
  const tuneItems = songs => [
    ...loadPieces().filter(p => !pieceIsEmpty(p)).map(p => ({ id: `piece:${p.id}`, title: `${p.title} (Maker)`, build: () => piecePages(p) })),
    ...songs.filter(s => !tuneIsEmpty(s.melody)).map(s => ({ id: s.id, title: s.title, build: () => tunePages(s) })),
  ];
  const tuneSelect = songs => {
    const list = tuneItems(songs);
    return h('select', {
      class: 'input', 'aria-label': 'Piece or song for the tune sheet', disabled: list.length === 0,
      onchange: e => set('tuneSong', e.target.value),
    }, list.length ? list.map(s => h('option', { value: s.id, selected: s.id === settings.tuneSong }, s.title)) : [h('option', {}, 'Nothing to print yet')]);
  };

  function drawControls(songs) {
    const songSelect = h('select', {
      class: 'input', 'aria-label': 'Song for cheat sheet 5', disabled: songs.length === 0,
      onchange: e => set('sheetSong', e.target.value),
    }, songs.map(s => h('option', { value: s.id, selected: s.id === settings.sheetSong }, s.title)));
    fill(controls,
      h('div', { class: 'row wrap' },
        segmented([['cheat', 'Cheat sheets (5 pages)'], ['music', 'Music sheets (every chord)'], ['tune', 'Tune sheet (a piece or song)']], mode(), v => set('sheetMode', v), 'Which sheets'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => window.print() }, '🖨 Print / Save as PDF')),
      mode() === 'music' && h('div', { class: 'row wrap' },
        h('span', { class: 'style-label' }, 'Playing style (one per page set)'),
        segmented(STYLE_ORDER.map(id => [id, STYLES.find(s => s.id === id).name]), style(), v => set('sheetStyle', v), 'Playing style for the music sheets')),
      mode() === 'music' && style() === 'strum' && h('div', { class: 'row wrap' },
        h('span', { class: 'style-label' }, 'Strum count'),
        segmented([['4', '4 counts (4/4)'], ['6', '6 counts (6/8)']], count(), v => set('strumCount', v), 'Strum count')),
      mode() === 'music' && toggle(`Also include the rarer chords (6th, 9th, dim7 … ${RARER_TYPES.length} more pages)`, Boolean(settings.sheetRare), v => set('sheetRare', v)),
      mode() === 'tune' && h('label', { class: 'sheet-pick' }, h('span', { class: 'muted small' }, 'Piece or song'), tuneSelect(songs)),
      mode() === 'tune' && toggle('Letter guide on the left (names every line and space)', settings.sheetGuide !== false, v => set('sheetGuide', v)),
      mode() === 'tune' && toggle('Key signature at the start of each line, instead of a ♭ or ♯ beside every note', Boolean(settings.sheetKeySig), v => set('sheetKeySig', v)),
      mode() === 'tune' && h('div', { class: 'row wrap' }, h('span', { class: 'style-label' }, 'Bars on a line'), segmented([['2', '2 (most room)'], ['3', '3'], ['4', '4']], String([2, 3, 4].includes(settings.sheetPerLine) ? settings.sheetPerLine : 3), v => set('sheetPerLine', Number(v)), 'Bars on a line')),
      mode() === 'tune' && toggle('Write each note’s name next to it (like B♭4)', Boolean(settings.sheetNames), v => set('sheetNames', v)),
      mode() === 'tune' && toggle('Suggested finger numbers (1 thumb … 5 little finger)', settings.sheetFingers !== false, v => set('sheetFingers', v)),
      mode() === 'cheat' && h('label', { class: 'sheet-pick' }, h('span', { class: 'muted small' }, 'Sheet 5 is for the song'), songSelect),
      h('p', { class: 'muted small' }, mode() === 'tune'
        ? 'A piece from the Maker, or the tune of a song, on a staff: the right hand on the treble staff, the left hand on the bass staff. One A4 page holds 20 bars.'
        : mode() === 'music'
        ? `${types().length} A4 pages for the style you picked: one chord type per page, all 12 roots. Left hand blue, right hand orange. Print each style on its own pages.`
        : 'Five A4 pages, one topic each, with big text for a music stand.',
      ' In the print window choose A4 and switch on “Background graphics”. On iPhone: Share → Print.'));
  }

  function draw() {
    const songs = loadSongs();
    const chosen = songs.find(s => s.id === settings.sheetSong) ?? songs.find(s => s.source) ?? songs[0] ?? null;
    if (chosen) settings.sheetSong = chosen.id;
    drawControls(songs);
    if (mode() === 'tune') {
      const list = tuneItems(songs);
      const pick = list.find(s => s.id === settings.tuneSong) ?? list[0];
      if (pick) settings.tuneSong = pick.id;
      pages.replaceChildren(...(pick
        ? pick.build()
        : [h('p', { class: 'empty' }, 'Nothing to print yet. Make a piece in the Maker tab, or open a song and tap “+ Tune”.')]));
    } else if (mode() === 'music') {
      const feel = feelFor(count());
      pages.replaceChildren(...types().map((id, i) => musicPage(i + 1, types().length, style(), TYPE_BY_ID[id], feel)));
    } else {
      pages.replaceChildren(readChordsPage(1), stylesPage(2), allChordsPage(3), seventhsPage(4), songPage(5, chosen));
    }
    fit();
  }

  draw();
  new ResizeObserver(fit).observe(el);
  return { el, onShow: draw };
}
