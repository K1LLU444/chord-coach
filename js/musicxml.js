// Read the right-hand tune out of a MusicXML file (.musicxml, .xml, or the zipped .mxl), on this device.
// Plain logic with its own small XML reader, so it works the same in the browser and in the tests.

const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// ---------- a small XML reader ----------

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };
const decode = s => s.replace(/&(lt|gt|amp|quot|apos);|&#(\d+);|&#x([0-9a-f]+);/gi, (m, name, dec, hex) => (name ? ENTITIES[`&${name.toLowerCase()};`] : String.fromCodePoint(dec ? +dec : parseInt(hex, 16))));

/** Parse XML text into { name, attrs, children, text }. Throws on text that isn't well-formed enough to read. */
export function parseXml(xml) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const tag = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = tag.exec(xml))) {
    const top = stack.at(-1);
    if (m[1] !== undefined) top.text += m[1];
    else if (m[6] !== undefined) top.text += decode(m[6]);
    else if (m[2] !== undefined) {
      if (stack.length < 2 || top.name !== m[2]) throw new Error('The file is not valid XML.');
      stack.pop();
    } else if (m[3] !== undefined) {
      const attrs = {};
      for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
      const el = { name: m[3], attrs, children: [], text: '' };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    }
  }
  if (stack.length !== 1) throw new Error('The file is not valid XML.');
  return root.children[0] ?? null;
}

const kids = (el, name) => el.children.filter(c => c.name === name);
const kid = (el, name) => el.children.find(c => c.name === name);
const num = (el, name) => {
  const v = Number(kid(el, name)?.text.trim());
  return Number.isFinite(v) ? v : null;
};

// ---------- the zipped .mxl form ----------

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The text of one file inside a zip (stored or deflated). */
async function unzipText(buffer, wanted) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('That .mxl file could not be opened.');
  const entries = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = [];
  for (let i = 0; i < entries; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('That .mxl file could not be opened.');
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    files.push({ name, method, size, offset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  const file = typeof wanted === 'string' ? files.find(f => f.name === wanted) : files.find(f => wanted(f.name));
  if (!file) return null;
  const start = file.offset + 30 + view.getUint16(file.offset + 26, true) + view.getUint16(file.offset + 28, true);
  const data = bytes.subarray(start, start + file.size);
  const raw = file.method === 0 ? data : file.method === 8 ? await inflate(data) : null;
  if (!raw) throw new Error('That .mxl file uses a compression this app cannot read.');
  return new TextDecoder().decode(raw);
}

/** The score text of a file's bytes: plain XML as it is, a zipped .mxl unzipped. */
export async function scoreText(buffer) {
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const container = await unzipText(buffer, 'META-INF/container.xml');
    const rootfile = container && kid(kid(parseXml(container), 'rootfiles') ?? { children: [] }, 'rootfile');
    const path = rootfile?.attrs['full-path'];
    const text = path ? await unzipText(buffer, path) : await unzipText(buffer, n => /\.(musicxml|xml)$/i.test(n) && !n.startsWith('META-INF'));
    if (!text) throw new Error('No score was found inside that .mxl file.');
    return text;
  }
  return new TextDecoder().decode(buffer);
}

// ---------- reading the music ----------

/** How the app counts a time signature: { pulses, group } or null when it can't (see js/rhythm.js). */
export function meterToCount(beats, beatType) {
  if (beatType === 4 && beats >= 2 && beats <= 12) return { pulses: beats, group: 1 };
  if (beatType === 8 && beats % 3 === 0 && beats >= 3 && beats <= 12) return { pulses: beats, group: 3 };
  return null;
}

/**
 * Read the right hand (the top staff of the first part) as a one-note-at-a-time tune.
 * Returns { ok: true, melody: { pulses, group, bars }, info } or { ok: false, error }.
 * info = { bars, notes, meter: '6/8', warnings: [] }.
 * Where the right hand plays several notes at once, the highest one is kept. Ties that cross a bar line are
 * played again at the start of the next bar. Repeat signs are not expanded.
 */
export function readMusicXml(text) {
  let doc;
  try {
    doc = parseXml(text);
  } catch {
    return { ok: false, error: 'That file is not a MusicXML file I can read.' };
  }
  if (!doc || !['score-partwise', 'score-timewise'].includes(doc.name)) return { ok: false, error: 'That file is not MusicXML (it has no score in it).' };
  if (doc.name === 'score-timewise') return { ok: false, error: 'This is a “timewise” MusicXML file, which is rare. In MuseScore, export it again as plain MusicXML.' };
  const part = kid(doc, 'part');
  if (!part) return { ok: false, error: 'The score has no music in it.' };

  const warnings = [];
  let divisions = 1;
  const declared = [];
  const bars = [];
  let notes = 0;
  let dropped = 0;
  let sawRepeat = false;

  kids(part, 'measure').forEach((measure, index) => {
    const events = [];
    let cursor = 0;
    let lastStart = 0;
    let span = 0;
    for (const el of measure.children) {
      if (el.name === 'attributes') {
        divisions = num(el, 'divisions') ?? divisions;
        const time = kid(el, 'time');
        if (time) {
          const beats = Number(kid(time, 'beats')?.text);
          const type = Number(kid(time, 'beat-type')?.text);
          declared.push({ text: `${beats}/${type}`, count: meterToCount(beats, type) });
        }
      } else if (el.name === 'backup') cursor -= num(el, 'duration') ?? 0;
      else if (el.name === 'forward') cursor += num(el, 'duration') ?? 0;
      else if (el.name === 'barline' && kid(el, 'repeat')) sawRepeat = true;
      else if (el.name === 'note') {
        const chord = Boolean(kid(el, 'chord'));
        const duration = num(el, 'duration') ?? 0;
        const start = chord ? lastStart : cursor;
        lastStart = start;
        if (!chord) cursor += duration;
        if (kid(el, 'grace') || kid(el, 'cue')) continue;
        if ((num(el, 'staff') ?? 1) !== 1) continue;
        const pitch = kid(el, 'pitch');
        if (kid(el, 'rest')) {
          if (!chord) events.push({ start, dur: duration, midi: 0 });
        } else if (pitch) {
          const octave = num(pitch, 'octave') ?? 4;
          const step = kid(pitch, 'step')?.text.trim();
          const alter = num(pitch, 'alter') ?? 0;
          if (step in STEP_PC) events.push({ start, dur: duration, midi: (octave + 1) * 12 + STEP_PC[step] + Math.round(alter), tieStop: kids(el, 'tie').some(t => t.attrs.type === 'stop') });
        }
        span = Math.max(span, start + duration);
      }
    }
    bars.push({ events, span, implicit: measure.attrs.implicit === 'yes' && index === 0 });
  });

  if (!declared.length) return { ok: false, error: 'The file does not say what time signature it is in.' };
  // Scans often get a time signature wrong or miss every other bar line. The bar to use is the shortest one the file
  // mentions (6/8 rather than 12/8), and longer bars that are whole multiples of it are cut into bars of that length.
  const usable = declared.filter(d => d.count);
  if (!usable.length) return { ok: false, error: `The time signature ${declared[0].text} is not supported yet. The app counts in quarter notes (4/4, 3/4 …) or eighths in threes (6/8, 9/8, 12/8).` };
  const target = usable.reduce((a, b) => (b.count.group === a.count.group && b.count.pulses < a.count.pulses && a.count.pulses % b.count.pulses === 0 ? b : a));
  const count = target.count;
  const meter = target.text;
  const different = [...new Set(declared.map(d => d.text))].filter(t => t !== meter);
  if (different.length) warnings.push(`The file mentions ${different.join(' and ')} as well as ${meter}. Bars are cut into ${meter} bars, which is how the sheet is counted.`);

  const perPulse = divisions * (count.group === 1 ? 1 : 0.5); // divisions in one pulse
  const barDivisions = count.pulses * perPulse;
  const toPulses = d => Math.round((d / perPulse) * 2) / 2;
  const odd = [];

  const readBar = (events, span, implicit) => {
    // A note tied to the one before it (in the same bar) is the same note, held longer.
    for (const e of events) {
      const before = e.tieStop && events.find(x => x !== e && x.midi === e.midi && x.start + x.dur === e.start && !x.merged);
      if (before) {
        before.dur += e.dur;
        e.merged = true;
      }
    }
    const live = events.filter(e => !e.merged);
    // Keep the highest note where several start together, and cut each note off where the next one starts.
    const onsets = [...new Set(live.filter(e => e.midi).map(e => e.start))].sort((a, b) => a - b);
    const picked = onsets.map((start, i) => {
      const here = live.filter(e => e.midi && e.start === start);
      const top = here.reduce((a, b) => (b.midi > a.midi ? b : a));
      const longest = Math.max(...here.map(e => e.dur));
      const limit = (onsets[i + 1] ?? Math.max(span, start + longest)) - start;
      return { start, dur: Math.min(longest, limit), midi: top.midi };
    });
    const offset = implicit && span > 0 ? Math.max(0, count.pulses - toPulses(span)) : 0; // a short first bar (a pick-up) is lined up at its end
    const tune = [];
    let at = 0;
    for (const n of picked) {
      const start = toPulses(n.start) + offset;
      const d = toPulses(n.dur);
      if (d < 0.5) {
        dropped++;
        continue;
      }
      if (start >= at && start + d <= count.pulses + 1e-9) {
        if (start > at) tune.push({ m: 0, d: start - at });
        tune.push({ m: n.midi, d });
        notes++;
        at = start + d;
      } else dropped++;
    }
    return tune;
  };

  const out = [];
  for (const bar of bars) {
    const pieces = !bar.implicit && bar.span > barDivisions * 1.5 ? Math.round(bar.span / barDivisions) : 1;
    const adds = bar.implicit || Math.abs(bar.span - barDivisions) < perPulse / 4 || pieces > 1 ? null : true; // a bar that is not the length of a bar
    if (adds && bar.span > 0 && bar.events.some(e => e.midi)) odd.push(out.length + 1);
    for (let k = 0; k < pieces; k++) {
      const from = k * barDivisions;
      const events = bar.events
        .map(e => ({ ...e, start: e.start - from }))
        .filter(e => e.start >= -1e-6 && e.start < barDivisions - 1e-6)
        .map(e => ({ ...e, dur: Math.min(e.dur, barDivisions - e.start) }));
      out.push(readBar(events, pieces > 1 ? barDivisions : bar.span, bar.implicit));
    }
  }

  if (!notes) return { ok: false, error: 'No right-hand notes were found. The tune is read from the top staff of the first part.' };
  if (sawRepeat) warnings.push('The score has repeat signs. They are not played again here, so the tune is only as long as it is written.');
  if (odd.length) warnings.push(`Bar${odd.length === 1 ? '' : 's'} ${odd.slice(0, 12).join(', ')}${odd.length > 12 ? ' …' : ''} ${odd.length === 1 ? 'does' : 'do'} not add up to a full bar. If the file came from scanning a sheet, a rhythm was probably misread there, so check ${odd.length === 1 ? 'it' : 'them'} against the sheet.`);
  if (dropped) warnings.push(`${dropped} note${dropped === 1 ? ' was' : 's were'} left out (grace notes, tiny rhythms, or notes that did not fit their bar).`);
  return { ok: true, melody: { pulses: count.pulses, group: count.group, bars: out }, info: { bars: out.length, notes, meter, warnings, oddBars: odd } };
}
