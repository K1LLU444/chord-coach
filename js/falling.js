// "Falling notes": bars drop towards a keyboard and each key lights up when it is time to press it.
// buildTimeline and keyRange are plain logic (tested); fallingView draws on a canvas.

import { h } from './dom.js';
import { barEvents, eventSeconds, pulseSeconds } from './rhythm.js';
import { noteName } from './theory.js';

const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = m => BLACK.has(m % 12);

/**
 * Lay a sample out in time. bars = [{ plan, tune?, fingers?, label? }] (plan from handPlan, tune = the bar's melody,
 * bass = the bar's own bass line, tuneFingers / bassFingers = a finger for each note of those lines, fingers = Map(midi → 1…5)
 * for chord notes, label = the chord name). Times are in pulses from the start of the first bar.
 * `firstBar` is the number shown for the first bar (a sample that starts at bar 9 begins with 9);
 * `hands` ('both', 'lh' or 'rh') leaves out the other hand, for practising one hand at a time.
 * Returns { notes: [{ midi, hand, start, len, finger, tune }], total, pulses, labels, firstBar }.
 */
export function buildTimeline(bars, feel, bpm, firstBar = 1, hands = 'both') {
  const step = pulseSeconds(feel, bpm);
  const notes = [];
  bars.forEach((bar, i) => {
    let tuneAt = 0;
    let bassAt = 0;
    for (const e of barEvents(bar.plan, feel, bar.tune, bar.bass)) {
      // fingers of a tune or a bass line come from the line as a whole; chord notes use the bar's own map
      const lineFinger = e.tune ? bar.tuneFingers?.[tuneAt++] : e.bass ? bar.bassFingers?.[bassAt++] : undefined;
      if (hands !== 'both' && e.hand !== hands) continue;
      const len = Math.min(eventSeconds(e, step) / step, feel.pulses * 2);
      for (const midi of e.notes) {
        notes.push({ midi, hand: e.hand, start: i * feel.pulses + e.pulse, len, finger: e.tune || e.bass ? lineFinger || null : bar.fingers?.get(midi) ?? null, tune: Boolean(e.tune) });
      }
    }
  });
  return { notes, total: bars.length * feel.pulses, pulses: feel.pulses, group: feel.group, labels: bars.map(b => b.label ?? ''), firstBar };
}

/** The keys to draw: whole octaves (C to B) that hold every note, at least two octaves, inside the 61-key CT-S300 (C2–C7). */
export function keyRange(notes) {
  if (!notes.length) return { from: 48, to: 83 };
  let lo = Math.min(...notes.map(n => n.midi));
  let hi = Math.max(...notes.map(n => n.midi));
  let from = Math.floor(lo / 12) * 12;
  let to = Math.floor(hi / 12) * 12 + 11;
  while (to - from + 1 < 24) {
    if (to + 12 <= 95) to += 12;
    else from -= 12;
  }
  return { from: Math.max(36, from), to: Math.min(96, to) };
}

const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim() || '#888';

export function fallingView() {
  const canvas = h('canvas', { class: 'falling', role: 'img', 'aria-label': 'Falling notes: blue is the left hand, orange is the right hand' });
  let timeline = { notes: [], total: 0, pulses: 4, group: 1, labels: [], firstBar: 1 };
  let range = keyRange([]);
  let loop = false;
  let raf = 0;
  let last = 0; // the pulse that was drawn last, so a resize can redraw it
  let live = { pressed: new Set(), required: new Set() }; // the real piano: keys down, and keys the music is waiting for
  let names = { on: true, flats: false, fingers: true }; // note names on the bars (Bb3 …) and finger numbers
  let layout = 'small'; // 'small' | 'medium' | 'large' | 'full' (fills its parent)

  function size() {
    const width = canvas.clientWidth;
    if (!width) return null;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    let height;
    if (layout === 'full') {
      canvas.style.height = ''; // the page's CSS makes the canvas fill what is left of the screen
      height = Math.max(240, canvas.clientHeight);
    } else {
      const limit = Math.max(260, window.innerHeight * 0.8);
      height = Math.round(layout === 'large' ? Math.min(limit, Math.max(380, width * 0.78))
        : layout === 'medium' ? Math.min(limit, Math.max(300, width * 0.85, 0), 560)
          : Math.min(340, Math.max(220, width * 0.7)));
      canvas.style.height = `${height}px`;
    }
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    return { width, height, ratio };
  }

  function draw(pulse) {
    last = pulse;
    const dims = size();
    if (!dims) return;
    const { width, height, ratio } = dims;
    const k = Math.min(2.2, Math.max(1, width / 420)); // text and badges grow on a wide screen
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const colors = {
      bg: css(canvas, '--surface-2'), text: css(canvas, '--text'), muted: css(canvas, '--muted'), border: css(canvas, '--border'),
      accent: css(canvas, '--accent'), accentText: css(canvas, '--accent-text'),
      lh: css(canvas, '--lh'), rh: css(canvas, '--rh'), white: css(canvas, '--key-white'), black: css(canvas, '--key-black'), edge: css(canvas, '--key-edge'),
    };
    const { from, to } = range;
    const whites = [];
    for (let m = from; m <= to; m++) if (!isBlack(m)) whites.push(m);
    const keyW = width / whites.length;
    const xOf = new Map(whites.map((m, i) => [m, i * keyW]));
    const kbH = Math.max(46, Math.min(78 * Math.max(1, k * 0.9), keyW * 4.2));
    const blackH = kbH * 0.62;
    const blackW = keyW * 0.62;
    const hitY = height - kbH;
    const window_ = timeline.pulses * 1.6; // how far ahead you can see, in pulses
    const pps = hitY / window_;
    const geometry = m => (isBlack(m)
      ? { x: xOf.get(m - 1) + keyW - blackW / 2, w: blackW }
      : { x: xOf.get(m) + 1, w: keyW - 2 });

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, hitY);

    // Faint lanes behind the white keys, and the bar lines with their chord names.
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    for (const m of whites) {
      const x = xOf.get(m);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, hitY);
      ctx.stroke();
    }
    const offsets = loop && timeline.total ? [0, timeline.total] : [0];
    const yAt = t => hitY - (t - pulse) * pps;
    ctx.font = `600 ${12 * k}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
    ctx.textBaseline = 'bottom';
    for (const offset of offsets) {
      for (let b = 0; b <= timeline.labels.length; b++) {
        const y = yAt(offset + b * timeline.pulses);
        if (y < -4 || y > hitY + 4) continue;
        ctx.strokeStyle = colors.muted;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (b < timeline.labels.length) {
          // The bar's number sits in a small badge on the left of its line, and falls with it.
          const number = String(timeline.firstBar + b);
          const badgeW = (10 + number.length * 7) * k;
          ctx.fillStyle = colors.accent;
          ctx.beginPath();
          ctx.roundRect(3, y - 20 * k, badgeW, 17 * k, 6 * k);
          ctx.fill();
          ctx.fillStyle = colors.accentText;
          ctx.font = `800 ${12 * k}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(number, 3 + badgeW / 2, y - 11.5 * k);
          ctx.font = `600 ${12 * k}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
          ctx.textBaseline = 'bottom';
          if (timeline.labels[b]) {
            ctx.fillStyle = colors.text;
            ctx.textAlign = 'left';
            ctx.fillText(timeline.labels[b], badgeW + 8, y - 4 * k);
          }
        }
      }
    }

    // Which bar is playing now, always in view just above the keyboard.
    if (timeline.total) {
      const index = Math.floor(Math.max(0, pulse) / timeline.pulses + 1e-9);
      const text = pulse < -0.01 ? 'Count-in' : `Bar ${timeline.firstBar + Math.min(index, timeline.labels.length - 1)}`;
      ctx.font = `800 ${13 * k}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
      const w = ctx.measureText(text).width + 16 * k;
      ctx.fillStyle = colors.text;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(width - w - 4, hitY - 28 * k, w, 22 * k, 8 * k);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.bg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, width - w / 2 - 4, hitY - 17 * k);
      ctx.textBaseline = 'bottom';
    }

    // The falling notes. A note that is sounding is cut off at the keyboard.
    const active = new Map();
    for (const offset of offsets) {
      for (const n of timeline.notes) {
        const start = offset + n.start;
        const end = start + n.len;
        if (end < pulse - 0.05 || start > pulse + window_) continue;
        const keyBox = geometry(n.midi);
        // a bar for a black key is a little wider than the key itself, so its name fits
        const w = isBlack(n.midi) ? Math.min(keyW - 2, keyBox.w * 1.3) : keyBox.w;
        const x = keyBox.x + (keyBox.w - w) / 2;
        const bottom = Math.min(yAt(start), hitY);
        const top = Math.max(yAt(end), -8);
        if (bottom <= top) continue;
        const color = n.hand === 'lh' ? colors.lh : colors.rh;
        const sounding = start <= pulse && pulse < end;
        if (sounding) active.set(n.midi, color);
        ctx.fillStyle = color;
        ctx.globalAlpha = sounding ? 1 : 0.88;
        ctx.beginPath();
        ctx.roundRect(x + 1, top, Math.max(2, w - 2), Math.max(3, bottom - top - 1), 4);
        ctx.fill();
        ctx.globalAlpha = 1;
        // The key's name with its octave (Bb3) at the foot of the bar, and the finger number above it when there is room.
        const label = names.on ? `${noteName(n.midi, names.flats)}${Math.floor(n.midi / 12) - 1}` : '';
        let labelSize = 13 * k;
        if (label) {
          // shrink the name until it fits inside the bar
          ctx.font = `800 ${labelSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
          const wide = ctx.measureText(label).width;
          if (wide > w - 6) labelSize *= (w - 6) / wide;
        }
        const room = bottom - top;
        let nameShown = false;
        if (label && labelSize >= 8 && room > labelSize + 6) {
          ctx.fillStyle = '#fff';
          ctx.font = `800 ${labelSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x + w / 2, bottom - labelSize * 0.8);
          nameShown = true;
        }
        if (n.finger && names.fingers && w > 9) {
          const size = Math.max(10, Math.min(15 * k, w * 0.8));
          const at = nameShown ? bottom - labelSize * 0.8 - size * 1.15 : bottom - 9;
          if (at - size * 0.5 > top) {
            ctx.fillStyle = '#fff';
            ctx.font = `800 ${size}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(n.finger, x + w / 2, at);
          }
        }
        ctx.textBaseline = 'bottom';
      }
    }

    // The keyboard, with the keys that should be down coloured in.
    for (const m of whites) {
      const { x, w } = geometry(m);
      ctx.fillStyle = active.get(m) || colors.white;
      ctx.strokeStyle = colors.edge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, hitY, w, kbH - 1, [0, 0, 4, 4]);
      ctx.fill();
      ctx.stroke();
      if (m % 12 === 0 && keyW > 9) {
        ctx.fillStyle = active.has(m) ? '#fff' : colors.muted;
        ctx.font = `600 ${10 * k}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`C${m / 12 - 1}`, x + w / 2, height - 4);
      }
    }
    for (let m = from; m <= to; m++) {
      if (!isBlack(m)) continue;
      const { x, w } = geometry(m);
      ctx.fillStyle = active.get(m) || colors.black;
      ctx.beginPath();
      ctx.roundRect(x, hitY, w, blackH, [0, 0, 3, 3]);
      ctx.fill();
    }
    // The real piano: a ring round the keys the music is waiting for, and the keys you have down (green when they are right).
    for (const m of live.required) {
      if (m < from || m > to) continue;
      const { x, w } = geometry(m);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 1, hitY + 2, w - 2, (isBlack(m) ? blackH : kbH) - 6);
    }
    for (const m of live.pressed) {
      if (m < from || m > to) continue;
      const { x, w } = geometry(m);
      ctx.fillStyle = live.required.has(m) || active.has(m) ? '#2fb463' : '#d9534f';
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x + 1, hitY + 2, w - 2, (isBlack(m) ? blackH : kbH) - 6);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = colors.text;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hitY);
    ctx.lineTo(width, hitY);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (typeof ResizeObserver === 'function') new ResizeObserver(() => draw(last)).observe(canvas);

  return {
    el: canvas,
    /** Set what falls. `keys` can fix the keys shown (otherwise they fit the notes). */
    load(next, { loop: repeat = false } = {}) {
      timeline = next;
      loop = repeat;
      range = keyRange(next.notes);
    },
    /** Show one moment without animating. */
    show(pulse = 0) { this.halt(); draw(pulse); },
    /** Animate: getPulse() says where in the sample we are now (negative during the count-in). */
    run(getPulse) {
      cancelAnimationFrame(raf);
      const frame = () => {
        let p = getPulse();
        if (loop && timeline.total && p >= 0) p %= timeline.total;
        draw(p);
        raf = requestAnimationFrame(frame);
      };
      frame();
    },
    halt() { cancelAnimationFrame(raf); raf = 0; },
    /** 'small' | 'medium' | 'large' | 'full' (fills the space its parent gives it). */
    setLayout(mode) { layout = mode; draw(last); },
    /** Note names and finger numbers on the bars: { on, flats, fingers } — any can be left out to keep it as it was. */
    setNames(next) { names = { ...names, ...next }; draw(last); },
    /** The real piano: { pressed: Set of keys down, required: Set of keys the music waits for }. */
    setLive(next) { live = { pressed: next.pressed ?? live.pressed, required: next.required ?? live.required }; draw(last); },
    redraw: () => draw(last),
  };
}
