// Everything is saved in this browser's localStorage (per device).

import { cleanPiece } from './piece.js';

const PREFIX = 'chordcoach.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Private mode or storage full: the app still works, it just won't remember.
  }
}

export const settings = Object.assign({
  tab: 'chords',
  showAll: false,
  fingers: true,
  volume: 80,
  muted: false,
  mixAudio: false,
  style: 'bass',
  sampleRange: 'section',
  sampleLoop: false,
  playerView: 'keys',
  useTune: true,
  tuneLength: 2,
  sheetSong: '',
  tuneSong: '',
  makerLane: 'lh',
  sheetGuide: true,
  sheetNames: false,
  sheetKeySig: false,
  sheetPerLine: 3,
  sheetMode: 'cheat',
  sheetStyle: 'bass',
  strumCount: '4',
  sheetRare: false,
  smooth: true,
  ghost: true,
  soundOnChange: false,
  quizMode: 'find',
  quizPool: 'basic',
  revealSound: true,
}, load('settings', {}));

export const saveSettings = () => save('settings', settings);

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

const EXAMPLES = [
  { title: 'Example: four-chord pop', text: '[Verse]\nC G Am F\nC G F F\n\n[Chorus]\nF C G Am\nF C G G' },
  { title: 'Example: 12-bar blues in A', text: 'A7 | A7 | A7 | A7\nD7 | D7 | A7 | A7\nE7 | D7 | A7 | E7' },
];

export function loadSongs() {
  const songs = load('songs', null);
  if (Array.isArray(songs)) return songs;
  const seeded = EXAMPLES.map((e, i) => ({ id: uid(), ...e, updated: Date.now() - i }));
  save('songs', seeded);
  return seeded;
}

export const saveSongs = songs => save('songs', songs);

// Pieces made in the Maker tab (see js/piece.js).
export function loadPieces() {
  const raw = load('pieces', []);
  return (Array.isArray(raw) ? raw : []).map(cleanPiece).filter(Boolean);
}

export const savePieces = pieces => save('pieces', pieces);
