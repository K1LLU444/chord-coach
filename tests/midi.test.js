import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi, createPiano } from '../js/midi.js';
import { identifyChord, keyList } from '../js/chord-detect.js';

test('MIDI messages: note on, note off (including velocity 0), the sustain pedal, and ignored messages', () => {
  assert.deepEqual(parseMidi([0x90, 60, 100]), { type: 'on', midi: 60, velocity: 100 / 127 });
  assert.deepEqual(parseMidi([0x93, 72, 64]).type, 'on'); // any channel
  assert.deepEqual(parseMidi([0x80, 60, 40]), { type: 'off', midi: 60, velocity: 0 });
  assert.deepEqual(parseMidi([0x90, 60, 0]), { type: 'off', midi: 60, velocity: 0 }); // note on with velocity 0 is a note off
  assert.deepEqual(parseMidi([0xb0, 64, 127]), { type: 'sustain', down: true });
  assert.deepEqual(parseMidi([0xb0, 64, 0]), { type: 'sustain', down: false });
  assert.equal(parseMidi([0xb0, 7, 100]), null); // volume, not used
  assert.equal(parseMidi([0xf8]), null); // clock
  assert.equal(parseMidi([]), null);
  assert.equal(parseMidi(null), null);
});

test('the piano object keeps track of the keys that are down and tells listeners', () => {
  const piano = createPiano();
  const seen = [];
  piano.on(e => seen.push(e.type === 'status' ? 'status' : `${e.type}:${e.midi ?? e.down}`));
  piano.feed([0x90, 60, 90]);
  piano.feed([0x90, 64, 90]);
  assert.deepEqual([...piano.pressed.keys()], [60, 64]);
  piano.feed([0x80, 60, 0]);
  assert.deepEqual([...piano.pressed.keys()], [64]);
  piano.feed([0xb0, 64, 127]);
  assert.equal(piano.sustain, true);
  assert.deepEqual(seen, ['on:60', 'on:64', 'off:60', 'sustain:true']);
});

test('chords from the keys pressed: any order, any octave, the lowest key names a slash chord', () => {
  assert.equal(identifyChord([60, 64, 67])[0].symbol, 'C');
  assert.equal(identifyChord([67, 72, 76])[0].symbol, 'C/G'); // C E G with G lowest
  assert.equal(identifyChord([58, 62, 65])[0].symbol, 'Bb');
  assert.equal(identifyChord([62, 65, 69])[0].symbol, 'Dm');
  assert.equal(identifyChord([55, 58, 62])[0].symbol, 'Gm');
  assert.equal(identifyChord([65, 69, 72, 75])[0].symbol, 'F7');
  assert.equal(identifyChord([60, 64]).length, 0); // two notes are not a chord
  assert.equal(identifyChord([60]).length, 0);
  assert.equal(keyList([62, 58, 65], true), 'B♭3 D4 F4');
});
