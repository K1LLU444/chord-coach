// Music theory: chord parsing, note spelling, keyboard voicings and song parsing.
// Pitch classes (pc) are 0–11 with C = 0. Keys are MIDI numbers (middle C = 60).

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** The 12 roots, spelled the way the original chord table spells them. */
export const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Casio CT-S300: 61 keys from C2 (MIDI 36) to C7 (MIDI 96). */
export const KEYBOARD = { from: 36, to: 96 };
/** Left hand plays in the lowest two octaves, right hand from middle C up. */
export const LH_RANGE = { from: 36, to: 59 };
export const RH_RANGE = { from: 60, to: 83 };

export const CHORD_TYPES = [
  { id: 'maj', suffix: '', name: 'Major', intervals: [0, 4, 7], degrees: [1, 3, 5], core: true, aliases: ['', 'maj', 'major', 'M'] },
  { id: 'min', suffix: 'm', name: 'Minor', intervals: [0, 3, 7], degrees: [1, 3, 5], core: true, aliases: ['m', 'min', 'minor', '-'] },
  { id: '7', suffix: '7', name: 'Dominant 7th', intervals: [0, 4, 7, 10], degrees: [1, 3, 5, 7], core: true, aliases: ['7', 'dom7'] },
  { id: 'maj7', suffix: 'maj7', name: 'Major 7th', intervals: [0, 4, 7, 11], degrees: [1, 3, 5, 7], core: true, aliases: ['maj7', 'M7', 'major7', 'ma7', 'Δ', 'Δ7'] },
  { id: 'm7', suffix: 'm7', name: 'Minor 7th', intervals: [0, 3, 7, 10], degrees: [1, 3, 5, 7], core: true, aliases: ['m7', 'min7', 'minor7', '-7'] },
  { id: 'sus2', suffix: 'sus2', name: 'Suspended 2nd', intervals: [0, 2, 7], degrees: [1, 2, 5], core: true, aliases: ['sus2'] },
  { id: 'sus4', suffix: 'sus4', name: 'Suspended 4th', intervals: [0, 5, 7], degrees: [1, 4, 5], core: true, aliases: ['sus4', 'sus'] },
  { id: 'dim', suffix: 'dim', name: 'Diminished', intervals: [0, 3, 6], degrees: [1, 3, 5], core: true, aliases: ['dim', '°', 'diminished'] },
  { id: 'aug', suffix: 'aug', name: 'Augmented', intervals: [0, 4, 8], degrees: [1, 3, 5], core: true, aliases: ['aug', '+', '+5', '#5', 'augmented'] },
  { id: '6', suffix: '6', name: 'Major 6th', intervals: [0, 4, 7, 9], degrees: [1, 3, 5, 6], aliases: ['6', 'maj6', 'M6'] },
  { id: 'm6', suffix: 'm6', name: 'Minor 6th', intervals: [0, 3, 7, 9], degrees: [1, 3, 5, 6], aliases: ['m6', 'min6'] },
  { id: 'add9', suffix: 'add9', name: 'Add 9', intervals: [0, 4, 7, 14], degrees: [1, 3, 5, 9], aliases: ['add9', 'add2', '2'] },
  { id: 'madd9', suffix: 'madd9', name: 'Minor add 9', intervals: [0, 3, 7, 14], degrees: [1, 3, 5, 9], aliases: ['madd9', 'madd2', 'm2', 'minadd9'] },
  { id: '9', suffix: '9', name: 'Dominant 9th', intervals: [0, 4, 7, 10, 14], degrees: [1, 3, 5, 7, 9], aliases: ['9'] },
  { id: 'maj9', suffix: 'maj9', name: 'Major 9th', intervals: [0, 4, 7, 11, 14], degrees: [1, 3, 5, 7, 9], aliases: ['maj9', 'M9'] },
  { id: 'm9', suffix: 'm9', name: 'Minor 9th', intervals: [0, 3, 7, 10, 14], degrees: [1, 3, 5, 7, 9], aliases: ['m9', 'min9'] },
  { id: '7sus4', suffix: '7sus4', name: 'Dominant 7th sus4', intervals: [0, 5, 7, 10], degrees: [1, 4, 5, 7], aliases: ['7sus4', '7sus', 'sus47'] },
  { id: 'dim7', suffix: 'dim7', name: 'Diminished 7th', intervals: [0, 3, 6, 9], degrees: [1, 3, 5, 7], aliases: ['dim7', '°7'] },
  { id: 'm7b5', suffix: 'm7b5', name: 'Half-diminished', intervals: [0, 3, 6, 10], degrees: [1, 3, 5, 7], aliases: ['m7b5', 'm7-5', 'min7b5', 'ø', 'ø7'] },
  { id: 'mMaj7', suffix: 'mMaj7', name: 'Minor-major 7th', intervals: [0, 3, 7, 11], degrees: [1, 3, 5, 7], aliases: ['mMaj7', 'mM7', 'minmaj7'] },
];

export const TYPE_BY_ID = Object.fromEntries(CHORD_TYPES.map(t => [t.id, t]));

// Case matters for short symbols (M7 = major 7th, m7 = minor 7th); longer words match in any case.
const EXACT = new Map();
const LOOSE = new Map();
for (const t of CHORD_TYPES) {
  for (const a of t.aliases) {
    if (!EXACT.has(a)) EXACT.set(a, t);
    if (/M/.test(a) && a.length <= 3) continue;
    if (!LOOSE.has(a.toLowerCase())) LOOSE.set(a.toLowerCase(), t);
  }
}
// What may trail a known chord when we simplify an unusual one (Cmaj7#11 → Cmaj7).
const EXTENSIONS = /^(?:[#b+-]?\d+|add\d+|sus\d*|alt|no\d+|omit\d+)+$/i;

function lookupType(s) {
  return EXACT.get(s) || LOOSE.get(s.toLowerCase()) || null;
}

function resolveType(suffix) {
  const s = suffix.replace(/[\s()]/g, '');
  const t = lookupType(s);
  if (t) return { type: t, simplified: false };
  for (let i = s.length - 1; i > 0; i--) {
    const prefix = lookupType(s.slice(0, i));
    if (prefix && EXTENSIONS.test(s.slice(i))) return { type: prefix, simplified: true };
  }
  if (/^(11|13)/.test(s) && EXTENSIONS.test(s)) return { type: TYPE_BY_ID['7'], simplified: true };
  return null;
}

export function pcOf(name) {
  const acc = name.slice(1);
  const shift = acc === '#' ? 1 : acc === 'b' ? -1 : 0;
  return (LETTER_PC[name[0]] + shift + 12) % 12;
}

const prefersFlats = root => root.includes('b') || root === 'F';

/** Plain key name for a MIDI note or pitch class. */
export function noteName(n, flats = false) {
  return (flats ? FLATS : SHARPS)[((n % 12) + 12) % 12];
}

// Spell a chord tone by counting letters from the root (so C# major has E#, not F).
function spell(root, rootPc, interval, degree) {
  const letter = LETTERS[(LETTERS.indexOf(root[0]) + degree - 1) % 7];
  const target = (rootPc + interval) % 12;
  let diff = (target - LETTER_PC[letter] + 12) % 12;
  if (diff > 6) diff -= 12;
  if (diff === 0) return letter;
  if (diff === 1) return letter + '#';
  if (diff === -1) return letter + 'b';
  return noteName(target, prefersFlats(root)); // avoid double sharps/flats for beginners
}

export function makeChord(root, type, bass = null, original = null) {
  const rootPc = pcOf(root);
  const pcs = type.intervals.map(iv => (rootPc + iv) % 12);
  const notes = type.intervals.map((iv, i) => spell(root, rootPc, iv, type.degrees[i]));
  const bassPc = bass ? pcOf(bass) : null;
  return {
    root,
    rootPc,
    type,
    pcs,
    notes,
    bass,
    bassPc,
    original,
    symbol: root + type.suffix + (bass ? '/' + bass : ''),
    name: `${root} ${type.name}${bass ? ' over ' + bass : ''}`,
    id: `${ROOTS[rootPc]}|${type.id}`,
  };
}

/**
 * Parse "Am", "F#m7", "Bb Major", "c sharp minor", "C/E"…
 * strict: root letter must be uppercase (used for pasted songs, so lyrics like "a" are not chords).
 */
export function parseChord(input, { strict = false } = {}) {
  if (input == null) return null;
  const s = String(input).trim()
    .replace(/♯/g, '#').replace(/♭/g, 'b')
    .replace(/\s+sharp\b/gi, '#').replace(/\s+flat\b/gi, 'b');
  const m = s.match(strict ? /^([A-G])([#b]?)(.*)$/ : /^([A-Ga-g])([#b]?)(.*)$/);
  if (!m) return null;
  let rest = m[3];
  let bass = null;
  const slash = rest.match(strict ? /^(.*)\/([A-G])([#b]?)$/ : /^(.*)\/\s*([A-Ga-g])([#b]?)$/);
  if (slash) {
    rest = slash[1];
    bass = slash[2].toUpperCase() + slash[3];
  }
  const r = resolveType(rest);
  if (!r) return null;
  return makeChord(m[1].toUpperCase() + m[2], r.type, bass, r.simplified ? s : null);
}

/** midi → note name as spelled in this chord (falls back to a plain name). */
export function noteLabeler(chord) {
  const map = new Map(chord.pcs.map((pc, i) => [pc, chord.notes[i]]));
  if (chord.bass && !map.has(chord.bassPc)) map.set(chord.bassPc, chord.bass);
  const flats = prefersFlats(chord.root);
  return midi => map.get(midi % 12) ?? noteName(midi, flats);
}

/** Friendly notes like "E# is the same key as F". */
export function enharmonicHints(chord) {
  const hints = [];
  const seen = new Set();
  const add = (name, pc) => {
    if (seen.has(name)) return;
    seen.add(name);
    const plain = ROOTS[pc];
    if (name !== plain && name !== SHARPS[pc] && name !== FLATS[pc]) hints.push(`${name} is the same key as ${plain}`);
  };
  if (!ROOTS.includes(chord.root)) hints.push(`${chord.root} is the same key as ${ROOTS[chord.rootPc]}`);
  chord.notes.forEach((n, i) => add(n, chord.pcs[i]));
  return hints;
}

function nextAtOrAbove(pc, min) {
  return min + (((pc - min) % 12) + 12) % 12;
}

/** Right-hand notes for an inversion (0 = root position), stacked upward from `low`. */
export function rhVoicing(chord, inversion = 0, low = RH_RANGE.from) {
  const n = chord.pcs.length;
  const k = ((inversion % n) + n) % n;
  const order = chord.pcs.slice(k).concat(chord.pcs.slice(0, k));
  const out = [];
  let min = low;
  for (const pc of order) {
    const note = nextAtOrAbove(pc, min);
    out.push(note);
    min = note + 1;
  }
  return out;
}

/** Left hand: root → 5th → octave (for slash chords: bass note + its octave). */
export function lhPattern(chord) {
  const root = nextAtOrAbove(chord.bassPc ?? chord.rootPc, LH_RANGE.from);
  if (chord.bass) return [root, root + 12];
  const fifth = chord.type.intervals.find(i => i >= 6 && i <= 8) ?? 7;
  return [root, root + fifth, root + 12];
}

export function inversionName(k) {
  return ['Root position', '1st inversion', '2nd inversion', '3rd inversion', '4th inversion'][k] ?? `Inversion ${k}`;
}

// How far the hand travels between two shapes: each note's distance to the nearest note of the other shape.
function movement(a, b) {
  const near = (n, set) => Math.min(...set.map(m => Math.abs(m - n)));
  return (a.reduce((s, n) => s + near(n, b), 0) + b.reduce((s, n) => s + near(n, a), 0)) / 2;
}

/** For a chord sequence, choose the inversion that keeps the right hand moving the least. */
export function smoothVoicings(chords) {
  let prev = null;
  return chords.map(chord => {
    const options = [];
    for (let k = 0; k < chord.pcs.length; k++) {
      const notes = rhVoicing(chord, k);
      if (notes[notes.length - 1] <= RH_RANGE.to) options.push({ k, notes });
    }
    if (!options.length) options.push({ k: 0, notes: rhVoicing(chord, 0) });
    if (!prev) return (prev = options[0]);
    let best = options[0];
    let bestCost = Infinity;
    for (const o of options) {
      const centre = o.notes.reduce((s, n) => s + n, 0) / o.notes.length;
      const cost = movement(prev.notes, o.notes) + 0.25 * o.k + 0.1 * Math.abs(centre - 67);
      if (cost < bestCost) [best, bestCost] = [o, cost];
    }
    return (prev = best);
  });
}

const IGNORE_TOKEN = /^(?:x\d+|\d+x|[-–—.\/%:|]+|N\.?C\.?|\*+)$/i;

/**
 * Pull chords out of pasted text. Accepts plain chord lines ("C G Am F"), bar lines ("| C | G |"),
 * section headers ("[Chorus]" or "Verse 1:"), ChordPro ("[C]Let it [G]be") and chords-over-lyrics
 * (lyric lines are skipped).
 */
export function parseSong(text) {
  const chords = [];
  const sections = [];
  const unknown = new Set();
  const simplified = new Set();
  let ignored = 0;
  const STRICT = { strict: true };
  const push = c => {
    chords.push(c);
    if (c.original) simplified.add(`${c.original} → ${c.symbol}`);
  };

  for (const raw of String(text || '').split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;

    const h1 = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    const h2 = line.match(/^([A-Za-z][A-Za-z0-9 ]*?)\s*:\s*(.*)$/);
    const header = h1 && !parseChord(h1[1], STRICT) ? h1 : h2 && !parseChord(h2[1], STRICT) ? h2 : null;
    if (header) {
      sections.push({ name: header[1].trim(), start: chords.length });
      line = header[2].trim();
      if (!line) continue;
    }

    // Guitar tab lines like "e|--6-6-8--|" or "E|------|" (the string name is not a chord).
    if (/^[A-Ga-g][#b]?\s*\|(?=.*--)[-\d\s|hpbrx\/\\~().*^]*$/.test(line)) {
      ignored++;
      continue;
    }

    if (/\[[^\]]+\]/.test(line)) {
      const found = [...line.matchAll(/\[([^\]]+)\]/g)].map(m => parseChord(m[1], STRICT)).filter(Boolean);
      if (found.length) {
        found.forEach(push);
        continue;
      }
    }

    const tokens = line.split(/[\s,|]+/)
      .map(t => t.replace(/^[(\[]+|[)\]]+$/g, ''))
      .filter(t => t && !IGNORE_TOKEN.test(t));
    if (!tokens.length) continue;
    const parsed = tokens.map(t => [t, parseChord(t, STRICT)]);
    const good = parsed.filter(([, c]) => c).length;
    if (good / tokens.length >= 0.6) {
      for (const [t, c] of parsed) c ? push(c) : unknown.add(t);
    } else {
      ignored++;
    }
  }
  return { chords, sections, unknown: [...unknown], simplified: [...simplified], ignored };
}

/** Move a chord up by n semitones (used for guitar capo). Uses the root spellings from ROOTS. */
export function transposeChord(chord, n) {
  const shift = pc => ROOTS[(((pc + n) % 12) + 12) % 12];
  return makeChord(shift(chord.rootPc), chord.type, chord.bass ? shift(chord.bassPc) : null);
}

/**
 * Convert Ultimate Guitar's markup ("[Verse 1]", "[ch]Bb[/ch]", "[tab]…[/tab]") into plain chord lines
 * with section headers. Lyrics and guitar tabs are dropped. With a capo, chords are raised so they
 * match the recording (a guitar with capo 2 playing "G" sounds like A).
 */
export function ugToText(content, capo = 0) {
  const out = [];
  const lastIsHeader = () => /^\[.*\]$/.test(out.at(-1) ?? '');
  const dropEmptySection = () => {
    if (!lastIsHeader()) return;
    out.pop();
    if (out.at(-1) === '') out.pop();
  };
  const fix = sym => {
    const c = capo ? parseChord(sym, { strict: true }) : null;
    return c ? transposeChord(c, capo).symbol : sym;
  };
  for (const line of String(content || '').replace(/\[\/?tab\]/g, '').split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]\/]+)\]\s*$/);
    if (header && header[1] !== 'ch') {
      dropEmptySection(); // previous section had no chords (e.g. only guitar tab)
      if (out.length) out.push('');
      out.push(`[${header[1].trim()}]`);
      continue;
    }
    const chords = [...line.matchAll(/\[ch\](.*?)\[\/ch\]/g)].map(m => m[1].trim()).filter(Boolean);
    if (chords.length) out.push(chords.map(fix).join(' '));
  }
  dropEmptySection();
  return out.join('\n').trim();
}

/**
 * Compare keys marked on a keyboard with a chord's answer. marks: Map(midi → 'lh' | 'rh').
 * Left hand must be root → 5th → octave (low to high) but may sit in any octave.
 * Right hand needs exactly the chord's notes, in any octave or order (so any inversion works).
 */
export function gradeMarks(chord, marks) {
  const blue = [...marks].filter(([, hand]) => hand === 'lh').map(([m]) => m).sort((a, b) => a - b);
  const orange = [...marks].filter(([, hand]) => hand === 'rh').map(([m]) => m);
  const goal = lhPattern(chord);

  const pool = goal.map(m => m % 12);
  let lhRight = 0;
  for (const m of blue) {
    const i = pool.indexOf(m % 12);
    if (i > -1) {
      pool.splice(i, 1);
      lhRight++;
    }
  }
  const lh = {
    right: lhRight,
    wrong: blue.length - lhRight,
    missing: goal.length - lhRight,
    shape: blue.length === goal.length && blue.every((m, i) => m - blue[0] === goal[i] - goal[0]) && blue[0] % 12 === goal[0] % 12,
  };

  const found = new Set(orange.map(m => m % 12).filter(pc => chord.pcs.includes(pc))).size;
  const rh = {
    right: found,
    wrong: orange.filter(m => !chord.pcs.includes(m % 12)).length,
    missing: chord.pcs.length - found,
  };

  return {
    empty: marks.size === 0,
    ok: lh.shape && !lh.wrong && !lh.missing && !rh.wrong && !rh.missing,
    lh,
    rh,
  };
}
