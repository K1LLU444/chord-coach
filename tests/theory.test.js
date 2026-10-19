import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChord, lhPattern, rhVoicing, smoothVoicings, parseSong, noteLabeler, enharmonicHints, pcOf, RH_RANGE, gradeMarks, lhChord, handPlan,
} from '../js/theory.js';

// The original beginner table: chord → left hand pattern, right hand triad.
const TABLE = `
A Major|A E A|A C# E
A Minor|A E A|A C E
Bb Major|Bb F Bb|Bb D F
Bb Minor|Bb F Bb|Bb Db F
B Major|B F# B|B D# F#
B Minor|B F# B|B D F#
C Major|C G C|C E G
C Minor|C G C|C Eb G
C# Major|C# G# C#|C# F G#
C# Minor|C# G# C#|C# E G#
D Major|D A D|D F# A
D Minor|D A D|D F A
Eb Major|Eb Bb Eb|Eb G Bb
Eb Minor|Eb Bb Eb|Eb Gb Bb
E Major|E B E|E G# B
E Minor|E B E|E G B
F Major|F C F|F A C
F Minor|F C F|F Ab C
F# Major|F# C# F#|F# A# C#
F# Minor|F# C# F#|F# A C#
G Major|G D G|G B D
G Minor|G D G|G Bb D
Ab Major|Ab Eb Ab|Ab C Eb
Ab Minor|Ab Eb Ab|Ab B Eb`.trim().split('\n').map(l => l.split('|'));

const pcs = names => names.split(' ').map(pcOf);

for (const [name, lh, rh] of TABLE) {
  test(`table row: ${name}`, () => {
    const c = parseChord(name);
    assert.ok(c, 'parses');
    assert.deepEqual(lhPattern(c).map(m => m % 12), pcs(lh), 'left hand keys');
    assert.deepEqual(rhVoicing(c).map(m => m % 12), pcs(rh), 'right hand keys');
  });
}

test('textbook spelling for the two tricky rows', () => {
  assert.deepEqual(parseChord('C# Major').notes, ['C#', 'E#', 'G#']);
  assert.deepEqual(parseChord('Ab Minor').notes, ['Ab', 'Cb', 'Eb']);
  assert.ok(enharmonicHints(parseChord('C#')).includes('E# is the same key as F'));
  assert.ok(enharmonicHints(parseChord('G#m')).includes('G# is the same key as Ab'));
});

test('parses many ways of writing chords', () => {
  const cases = {
    'Am': 'Am', 'am': 'Am', 'a minor': 'Am', 'F#m7': 'F#m7', 'Bbmaj7': 'Bbmaj7', 'CM7': 'Cmaj7',
    'c sharp minor': 'C#m', 'B flat': 'Bb', 'Dsus': 'Dsus4', 'G7sus4': 'G7sus4', 'C/E': 'C/E',
    'Ddim': 'Ddim', 'C°': 'Cdim', 'Eaug': 'Eaug', 'C+': 'Caug', 'Cadd9': 'Cadd9', 'Bø': 'Bm7b5',
  };
  for (const [input, symbol] of Object.entries(cases)) assert.equal(parseChord(input)?.symbol, symbol, input);
  assert.equal(parseChord('Cmaj7#11').symbol, 'Cmaj7');
  assert.equal(parseChord('C13').symbol, 'C7');
  for (const word of ['Ahead', 'Bed', 'Go', 'Do', 'Cause', 'Email', 'hello']) assert.equal(parseChord(word, { strict: true }), null, word);
});

test('slash chord puts the bass note in the left hand', () => {
  const c = parseChord('C/E');
  assert.deepEqual(lhPattern(c).map(m => m % 12), [4, 4]);
  assert.equal(noteLabeler(c)(lhPattern(c)[0]), 'E');
});

test('inversions stay inside the right-hand panel and move the hand less', () => {
  const chords = 'C G Am F'.split(' ').map(s => parseChord(s));
  const v = smoothVoicings(chords);
  for (const { notes } of v) {
    assert.ok(notes[0] >= RH_RANGE.from && notes.at(-1) <= RH_RANGE.to);
  }
  assert.equal(v[0].k, 0, 'first chord in root position');
  const span = v.flatMap(x => x.notes);
  assert.ok(Math.max(...span) - Math.min(...span) <= 12, 'whole progression fits under one hand position');
});

test('song parsing: sections, bars, ChordPro, lyrics skipped', () => {
  const song = parseSong(`[Verse]
| C  G | Am F |
Chorus: F C G G (x2)
   C          G
When I find myself
[C]Let it [G]be`);
  assert.deepEqual(song.chords.map(c => c.symbol), ['C', 'G', 'Am', 'F', 'F', 'C', 'G', 'G', 'C', 'G', 'C', 'G']);
  assert.deepEqual(song.sections, [{ name: 'Verse', start: 0 }, { name: 'Chorus', start: 4 }]);
  assert.equal(song.ignored, 1);
});

test('Ultimate Guitar markup → chord lines, lyrics and tabs dropped', async () => {
  const { ugToText } = await import('../js/theory.js');
  const ug = '[Intro]\r\n[ch]Bb[/ch]  [ch]Dm[/ch]\r\n\r\n[Verse 1]\r\n[tab][ch]Eb[/ch]   [ch]Ebm[/ch]\r\n  Some lyric words[/tab]\r\n' +
    '[Guitar Solo]\r\n[tab]e|--6-6-8--|\r\nB|--6-6-6--|[/tab]\r\n[Outro]\r\n[ch]F7[/ch]';
  assert.equal(ugToText(ug), '[Intro]\nBb Dm\n\n[Verse 1]\nEb Ebm\n\n[Outro]\nF7');
  assert.equal(ugToText('[ch]G[/ch] [ch]D/F#[/ch] [ch]Em7[/ch]', 2), 'A E/Ab F#m7');
});

test('guitar tab lines are not read as chords', () => {
  const song = parseSong('[Solo]\nBb Dm\ne|--6-6-8/10--|\nB|--6-6-6----|\nD|-----------|\nA|-----------|\nE|-----------|\nF7');
  assert.deepEqual(song.chords.map(c => c.symbol), ['Bb', 'Dm', 'F7']);
  assert.deepEqual(parseSong('C | G | Am | F |').chords.map(c => c.symbol), ['C', 'G', 'Am', 'F']);
  assert.deepEqual(parseSong('E | B7 | E').chords.map(c => c.symbol), ['E', 'B7', 'E']);
});

test('marked keys are graded: any octave and inversion, left hand root → 5th → octave', () => {
  const marks = (lh, rh) => new Map([...lh.map(m => [m, 'lh']), ...rh.map(m => [m, 'rh'])]);
  const C = parseChord('C');
  assert.equal(gradeMarks(C, marks([36, 43, 48], [60, 64, 67])).ok, true);
  assert.equal(gradeMarks(C, marks([48, 55, 60], [64, 67, 72])).ok, true, 'other octaves and an inversion');
  assert.equal(gradeMarks(C, marks([36, 43, 48], [60, 64, 67, 72])).ok, true, 'doubled root is fine');

  const order = gradeMarks(C, marks([36, 48, 55], [60, 64, 67]));
  assert.equal(order.ok, false);
  assert.deepEqual([order.lh.right, order.lh.wrong, order.lh.missing, order.lh.shape], [3, 0, 0, false]);

  const partial = gradeMarks(C, marks([36], [60, 63, 67]));
  assert.deepEqual(partial.lh, { right: 1, wrong: 0, missing: 2, shape: false });
  assert.deepEqual(partial.rh, { right: 2, wrong: 1, missing: 1, shape: true });
  assert.equal(partial.ok, false);

  assert.equal(gradeMarks(C, new Map()).empty, true);
  assert.equal(gradeMarks(parseChord('Cdim'), marks([36, 42, 48], [60, 63, 66])).ok, true, 'dim has a flat 5th in the left hand');
  assert.equal(gradeMarks(parseChord('Cmaj7'), marks([36, 43, 48], [60, 64, 67])).ok, false, 'a 7th chord needs its 4th note');
});

test('left hand chord: every chord note once, between C3 and B3', () => {
  assert.deepEqual(lhChord(parseChord('C')), [48, 52, 55]);
  assert.deepEqual(lhChord(parseChord('F')), [48, 53, 57], 'F A C stacked as C F A so it stays in the window');
  assert.deepEqual(lhChord(parseChord('B')), [51, 54, 59]);
  assert.deepEqual(lhChord(parseChord('C/E')), [40, 48, 52, 55], 'slash chord adds its bass note below');
  for (const root of ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']) {
    for (const type of ['', 'm', '7', 'maj7', 'm7b5', '9']) {
      const chord = parseChord(root + type);
      const notes = lhChord(chord);
      assert.ok(notes.every(m => m >= 48 && m <= 59), chord.symbol);
      assert.deepEqual([...new Set(notes.map(m => m % 12))].sort((a, b) => a - b), [...chord.pcs].sort((a, b) => a - b), chord.symbol);
    }
  }
});

test('hand plan: which hand plays together and which one at a time', () => {
  const C = parseChord('C');
  const bass = handPlan(C, 'bass');
  assert.deepEqual([bass.lh.together, bass.rh.together], [false, true]);
  assert.deepEqual(bass.lh.notes, [36, 43, 48]);
  const broken = handPlan(C, 'broken', { inversion: 1 });
  assert.deepEqual([broken.lh.together, broken.rh.together], [true, false]);
  assert.deepEqual(broken.rh.notes, [64, 67, 72], '1st inversion, played low to high');
  assert.deepEqual(handPlan(C, 'broken', { rh: [67, 72, 76] }).rh.notes, [67, 72, 76], 'a ready-made voicing wins');
});

test('grading the "chord + broken notes" style', () => {
  const marks = (lh, rh) => new Map([...lh.map(m => [m, 'lh']), ...rh.map(m => [m, 'rh'])]);
  const C = parseChord('C');
  assert.equal(gradeMarks(C, marks([48, 52, 55], [60, 64, 67]), 'broken').ok, true);
  assert.equal(gradeMarks(C, marks([40, 48, 55], [64, 67, 72]), 'broken').ok, true, 'any octave below middle C, any inversion');
  const misplaced = gradeMarks(C, marks([60, 64, 67], [72, 76, 79]), 'broken');
  assert.equal(misplaced.ok, false);
  assert.deepEqual([misplaced.lh.wrong, misplaced.lh.missing, misplaced.lh.shape], [0, 0, false], 'right notes, wrong place');
  const partial = gradeMarks(C, marks([48, 52], [60, 63, 67]), 'broken');
  assert.deepEqual(partial.lh, { right: 2, wrong: 0, missing: 1, shape: true });
  assert.deepEqual(partial.rh, { right: 2, wrong: 1, missing: 1, shape: true });
  assert.equal(gradeMarks(C, marks([36, 43, 48], [60, 64, 67]), 'bass').ok, true, 'bass style is unchanged');
});
