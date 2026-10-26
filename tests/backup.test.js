import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, mergeBackup } from '../js/backup.js';
import { newPiece } from '../js/piece.js';

const piece = (id, updated) => ({ ...newPiece({ id, title: id, meter: '6/4', bpm: 80, key: 'A', bars: 2 }), updated });

test('a backup file round-trips songs, pieces and progress', () => {
  const songs = [{ id: 's1', title: 'One', text: 'C G', updated: 5 }];
  const text = buildBackup({ songs, pieces: [piece('p1', 9)], quiz: { C: 3 }, notes: { 60: 1 } });
  const back = parseBackup(text);
  assert.equal(back.error, undefined);
  assert.deepEqual(back.songs, songs);
  assert.equal(back.pieces[0].id, 'p1');
  assert.deepEqual(back.quiz, { C: 3 });
});

test('a file that is not a backup is refused in plain words, and bad entries are dropped', () => {
  assert.match(parseBackup('hello').error, /not a Chord Coach backup/);
  assert.match(parseBackup('{"app":"other"}').error, /not a Chord Coach backup/);
  const back = parseBackup(JSON.stringify({ app: 'chord-coach', songs: [{ id: 1 }, { id: 'ok', text: 'x' }], pieces: [{ nope: true }] }));
  assert.deepEqual(back.songs.map(s => s.id), ['ok']);
  assert.deepEqual(back.pieces, []);
});

test('loading merges: new things are added, the newest copy of the same id wins, nothing is lost', () => {
  const current = { songs: [{ id: 'a', text: 'old', updated: 1 }], pieces: [piece('p1', 10), piece('p2', 1)], quiz: { C: 1 }, notes: {} };
  const incoming = { songs: [{ id: 'a', text: 'new', updated: 2 }, { id: 'b', text: 'b', updated: 1 }], pieces: [piece('p1', 5), piece('p3', 1)], quiz: { C: 9, D: 2 }, notes: { 60: 1 } };
  const m = mergeBackup(current, incoming);
  assert.deepEqual(m.songs.map(s => [s.id, s.text]), [['a', 'new'], ['b', 'b']]);
  assert.deepEqual(m.pieces.map(p => [p.id, p.updated]), [['p1', 10], ['p2', 1], ['p3', 1]]);
  assert.deepEqual(m.quiz, { C: 1, D: 2 });
  assert.deepEqual(m.notes, { 60: 1 });
});
