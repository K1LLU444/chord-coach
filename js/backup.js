// Save everything you made (songs, Maker pieces, quiz progress) to one file, and load it on another device.

import { cleanPiece } from './piece.js';

export const BACKUP_APP = 'chord-coach';
const isPlain = x => x && typeof x === 'object' && !Array.isArray(x);

/** The text of a backup file: { app, version, saved, songs, pieces, quiz, notes }. */
export function buildBackup({ songs = [], pieces = [], quiz = {}, notes = {} }, now = Date.now()) {
  return JSON.stringify({ app: BACKUP_APP, version: 1, saved: now, songs, pieces, quiz, notes });
}

/** Read a backup file's text and keep only what is safe: { songs, pieces, quiz, notes }, or { error } in plain words. */
export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(String(text));
  } catch {
    return { error: 'That file is not a Chord Coach backup.' };
  }
  if (!isPlain(raw) || raw.app !== BACKUP_APP) return { error: 'That file is not a Chord Coach backup.' };
  const songs = (Array.isArray(raw.songs) ? raw.songs : [])
    .filter(s => isPlain(s) && typeof s.id === 'string' && typeof s.text === 'string')
    .map(s => ({ ...s, title: String(s.title ?? '').slice(0, 200), updated: Number(s.updated) || 0 }));
  const pieces = (Array.isArray(raw.pieces) ? raw.pieces : []).map(cleanPiece).filter(Boolean);
  return { songs, pieces, quiz: isPlain(raw.quiz) ? raw.quiz : {}, notes: isPlain(raw.notes) ? raw.notes : {} };
}

/** Put a list of things with ids together: the same id keeps the one saved last; new ones are added. */
function mergeById(current, incoming) {
  const byId = new Map(current.map(x => [x.id, x]));
  for (const x of incoming) {
    const have = byId.get(x.id);
    if (!have || (Number(x.updated) || 0) > (Number(have.updated) || 0)) byId.set(x.id, x);
  }
  return [...byId.values()];
}

/** What this device holds plus what the backup holds. Nothing is deleted; for progress, what is here wins. */
export function mergeBackup(current, incoming) {
  return {
    songs: mergeById(current.songs ?? [], incoming.songs),
    pieces: mergeById(current.pieces ?? [], incoming.pieces),
    quiz: { ...incoming.quiz, ...(current.quiz ?? {}) },
    notes: { ...incoming.notes, ...(current.notes ?? {}) },
  };
}
