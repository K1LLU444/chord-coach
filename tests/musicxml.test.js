import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { parseXml, readMusicXml, meterToCount, scoreText } from '../js/musicxml.js';

// A made-up two-bar score in 6/8 (divisions = 2 per quarter, so an eighth is 1): bar 1 has a rest, then B♭4 C5 D5 as eighths;
// bar 2 has a dotted quarter E♭5 with a chord note G5 above it, a tied pair, and a left-hand staff that must be ignored.
const note = (step, octave, duration, extra = '', alter = 0) => `<note>${extra}<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch><duration>${duration}</duration></note>`;
const SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>2</divisions><time><beats>6</beats><beat-type>8</beat-type></time><staves>2</staves></attributes>
<note><rest/><duration>3</duration><staff>1</staff></note>
${note('B', 4, 1, '', -1).replace('</note>', '<staff>1</staff></note>')}
${note('C', 5, 1).replace('</note>', '<staff>1</staff></note>')}
${note('D', 5, 1).replace('</note>', '<staff>1</staff></note>')}
<backup><duration>6</duration></backup>
${note('B', 2, 6, '', -1).replace('</note>', '<staff>2</staff></note>')}
</measure>
<measure number="2">
${note('E', 5, 3, '', -1).replace('</note>', '<staff>1</staff></note>')}
<note><chord/><pitch><step>G</step><octave>5</octave></pitch><duration>3</duration><staff>1</staff></note>
${note('D', 5, 2).replace('</note>', '<tie type="start"/><staff>1</staff></note>')}
${note('D', 5, 1).replace('</note>', '<tie type="stop"/><staff>1</staff></note>')}
<backup><duration>6</duration></backup>
${note('G', 2, 6).replace('</note>', '<staff>2</staff></note>')}
</measure></part></score-partwise>`;

test('the XML reader handles tags, attributes, text, comments and the DOCTYPE line', () => {
  const doc = parseXml('<?xml version="1.0"?><!DOCTYPE a PUBLIC "x" "y"><a k="1"><!-- hi --><b>5 &amp; 6</b><c/></a>');
  assert.equal(doc.name, 'a');
  assert.equal(doc.attrs.k, '1');
  assert.equal(doc.children[0].text, '5 & 6');
  assert.equal(doc.children[1].name, 'c');
  assert.throws(() => parseXml('<a><b></a>'));
});

test('a 6/8 score becomes a tune: rests, flats, the top note of a chord, ties, and only the top staff', () => {
  const r = readMusicXml(SCORE);
  assert.equal(r.ok, true);
  assert.deepEqual({ pulses: r.melody.pulses, group: r.melody.group }, { pulses: 6, group: 3 });
  assert.deepEqual(r.melody.bars[0], [{ m: 0, d: 3 }, { m: 70, d: 1 }, { m: 72, d: 1 }, { m: 74, d: 1 }]);
  assert.deepEqual(r.melody.bars[1], [{ m: 79, d: 3 }, { m: 74, d: 3 }]); // G5 over E♭5; the tied D5s are one long note
  assert.equal(r.info.meter, '6/8');
  assert.equal(r.info.bars, 2);
  assert.equal(r.info.notes, 5);
});

test('4/4 with quarter notes counts one pulse per quarter', () => {
  const xml = `<score-partwise><part id="P"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    ${note('C', 4, 1)}${note('D', 4, 2)}${note('E', 4, 1)}</measure></part></score-partwise>`;
  const r = readMusicXml(xml);
  assert.deepEqual(r.melody.bars[0], [{ m: 60, d: 1 }, { m: 62, d: 2 }, { m: 64, d: 1 }]);
  assert.deepEqual({ pulses: r.melody.pulses, group: r.melody.group }, { pulses: 4, group: 1 });
});

test('a short first bar (a pick-up) is lined up at its end', () => {
  const xml = `<score-partwise><part id="P"><measure number="0" implicit="yes"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    ${note('G', 4, 1)}</measure><measure number="1">${note('C', 5, 4)}</measure></part></score-partwise>`;
  const r = readMusicXml(xml);
  assert.deepEqual(r.melody.bars[0], [{ m: 0, d: 3 }, { m: 67, d: 1 }]);
});

test('problems are explained, not thrown', () => {
  assert.equal(readMusicXml('hello').ok, false);
  assert.match(readMusicXml('<html></html>').error, /not MusicXML/);
  const odd = `<score-partwise><part id="P"><measure number="1"><attributes><divisions>1</divisions><time><beats>5</beats><beat-type>2</beat-type></time></attributes>${note('C', 4, 5)}</measure></part></score-partwise>`;
  assert.match(readMusicXml(odd).error, /5\/2 is not supported/);
  const noNotes = `<score-partwise><part id="P"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><rest/><duration>4</duration></note></measure></part></score-partwise>`;
  assert.match(readMusicXml(noNotes).error, /No right-hand notes/);
});

test('which time signatures the app can count', () => {
  assert.deepEqual(meterToCount(6, 8), { pulses: 6, group: 3 });
  assert.deepEqual(meterToCount(3, 4), { pulses: 3, group: 1 });
  assert.deepEqual(meterToCount(12, 8), { pulses: 12, group: 3 });
  assert.equal(meterToCount(7, 8), null);
  assert.equal(meterToCount(2, 2), null);
});

// A tiny zip writer for the test (one stored file, one deflated file), to check the .mxl reader.
function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data, deflate } of files) {
    const raw = Buffer.from(data);
    const body = deflate ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, body);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(deflate ? 8 : 0, 10);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...parts, centralBytes, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

test('a zipped .mxl file is opened through its container.xml', async () => {
  const container = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score/main.xml"/></rootfiles></container>';
  for (const deflate of [false, true]) {
    const buffer = zip([{ name: 'META-INF/container.xml', data: container, deflate }, { name: 'score/main.xml', data: SCORE, deflate }]);
    const text = await scoreText(buffer);
    assert.equal(readMusicXml(text).ok, true);
  }
});

test('plain XML bytes are read as they are', async () => {
  const bytes = new TextEncoder().encode(SCORE);
  const text = await scoreText(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  assert.equal(readMusicXml(text).info.notes, 5);
});

test('a scan that merged two 6/8 bars into one 12/8 bar is cut back into 6/8 bars', () => {
  // made-up: divisions 2 (an eighth = 1). Bar 1 is declared 12/8 and holds two bars of six eighths; bar 2 is declared 6/8.
  const run = (start, count) => Array.from({ length: count }, (_, i) => note('C', 5, 1)).join('');
  const xml = `<score-partwise><part id="P">
    <measure number="1"><attributes><divisions>2</divisions><time><beats>12</beats><beat-type>8</beat-type></time></attributes>${note('C', 5, 6)}${note('D', 5, 3)}${note('E', 5, 3)}</measure>
    <measure number="2"><attributes><time><beats>6</beats><beat-type>8</beat-type></time></attributes>${note('F', 5, 6)}</measure></part></score-partwise>`;
  const r = readMusicXml(xml);
  assert.equal(r.ok, true);
  assert.equal(r.info.meter, '6/8');
  assert.equal(r.info.bars, 3);
  assert.deepEqual(r.melody.bars.map(b => b.map(n => n.m)), [[72], [74, 76], [77]]);
  assert.match(r.info.warnings[0], /12\/8 as well as 6\/8/);
  assert.deepEqual(r.info.oddBars, []);
});

test('a bar that is not a full bar long is reported so it can be checked', () => {
  const xml = `<score-partwise><part id="P"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${note('C', 4, 4)}</measure>
    <measure number="2">${note('D', 4, 3)}</measure><measure number="3">${note('E', 4, 4)}</measure></part></score-partwise>`;
  const r = readMusicXml(xml);
  assert.deepEqual(r.info.oddBars, [2]);
  assert.match(r.info.warnings.at(-1), /Bar 2 does not add up/);
});
