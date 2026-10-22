import test from 'node:test';
import assert from 'node:assert/strict';
import { volumeToGain, setVolume, volumeState } from '../js/audio.js';

test('volume curve: 80% is the level the app always had, quieter below, a little louder above', () => {
  assert.equal(volumeToGain(0), 0);
  assert.ok(Math.abs(volumeToGain(0.8) - 0.8) < 1e-9, '80% = the original gain of 0.8');
  assert.equal(volumeToGain(1), 1.25);
  let last = -1;
  for (let v = 0; v <= 1.0001; v += 0.05) {
    assert.ok(volumeToGain(v) > last, 'always getting louder as the slider goes up');
    last = volumeToGain(v);
  }
  assert.equal(volumeToGain(-5), 0, 'below the slider does nothing odd');
  assert.equal(volumeToGain(9), 1.25, 'above the slider is capped');
});

test('setVolume remembers the level and the mute switch (before any sound has played)', () => {
  setVolume(0.3, false);
  assert.deepEqual([volumeState().volume, volumeState().muted], [0.3, false]);
  assert.ok(Math.abs(volumeState().gain - volumeToGain(0.3)) < 1e-9);
  setVolume(0.3, true);
  assert.equal(volumeState().gain, 0, 'muted is silent');
  setVolume(0.3, false);
  assert.ok(volumeState().gain > 0, 'unmuting brings the level back');
  setVolume('nonsense', false);
  assert.equal(volumeState().volume, 0, 'a bad value cannot break it');
  setVolume(0.8, false);
});

import { isSilent, setSilent, isMixing, setMixing, playNote, createSession, audioNow } from '../js/audio.js';

test('silent mode: muting (or a volume of 0) makes the app silent, and silent sounds do nothing', () => {
  setVolume(0.5, false);
  assert.equal(isSilent(), false);
  setVolume(0.5, true);
  assert.equal(isSilent(), true);
  setVolume(0, false);
  assert.equal(isSilent(), true);
  setVolume(0.8, false);
  assert.equal(isSilent(), false);
  setSilent(true);
  assert.doesNotThrow(() => playNote(60));
  assert.equal(createSession().out, null); // no sound session is opened while silent
  assert.equal(audioNow(), 0);
  setSilent(false);
});

test('mixing with other sound can be switched on and off', () => {
  setMixing(true);
  assert.equal(isMixing(), true);
  setMixing(false);
  assert.equal(isMixing(), false);
});
