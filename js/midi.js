// The piano connected by USB: which keys are down, and a way for the rest of the app to hear about them.
// Uses Web MIDI, which Chrome on a Mac (and Edge) has; Safari and the iPhone do not. Nothing is sent anywhere.

/** Read one MIDI message (an array of bytes). Returns { type: 'on' | 'off' | 'sustain', midi, velocity, down } or null. */
export function parseMidi(data) {
  if (!data || data.length < 2) return null;
  const status = data[0] & 0xf0;
  const a = data[1] ?? 0;
  const b = data[2] ?? 0;
  if (status === 0x90 && b > 0) return { type: 'on', midi: a, velocity: b / 127 };
  if (status === 0x80 || (status === 0x90 && b === 0)) return { type: 'off', midi: a, velocity: 0 };
  if (status === 0xb0 && a === 64) return { type: 'sustain', down: b >= 64 };
  return null;
}

/** The piano input: one shared object for the whole app. */
export function createPiano() {
  const listeners = new Set();
  const pressed = new Map(); // midi → velocity, for the keys that are down now
  let access = null;
  let state = { supported: typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function', connected: false, names: [], error: '' };
  let sustain = false;

  const emit = event => listeners.forEach(fn => { try { fn(event); } catch (e) { console.error(e); } });
  const status = patch => { state = { ...state, ...patch }; emit({ type: 'status', ...state }); };

  function handle(message) {
    const m = parseMidi(message.data);
    if (!m) return;
    if (m.type === 'sustain') {
      sustain = m.down;
      emit({ type: 'sustain', down: m.down });
      return;
    }
    if (m.type === 'on') pressed.set(m.midi, m.velocity);
    else pressed.delete(m.midi);
    emit({ ...m, time: typeof performance !== 'undefined' ? performance.now() : Date.now() });
  }

  function refresh() {
    const inputs = [...(access?.inputs?.values?.() ?? [])].filter(i => i.state !== 'disconnected');
    for (const input of inputs) input.onmidimessage = handle;
    status({ connected: inputs.length > 0, names: inputs.map(i => i.name || 'MIDI device'), error: '' });
  }

  return {
    get state() { return state; },
    get pressed() { return pressed; },
    get sustain() { return sustain; },
    /** Ask the browser for the piano (Chrome shows a permission question the first time). */
    async start() {
      if (!state.supported) {
        status({ error: 'This browser cannot read a piano. Use Chrome on your Mac.' });
        return false;
      }
      try {
        access = await navigator.requestMIDIAccess({ sysex: false });
        access.onstatechange = () => { pressed.clear(); refresh(); };
        refresh();
        return true;
      } catch (e) {
        status({ connected: false, names: [], error: e?.name === 'SecurityError' ? 'The browser did not allow it. Allow MIDI devices for this page and try again.' : 'Could not open the piano connection.' });
        return false;
      }
    },
    /** Hear about notes and status changes. Returns a function that stops listening. */
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** For tests and simulations: feed a message as if the piano sent it. */
    feed(data) { handle({ data }); },
  };
}

/** The one piano the whole app shares. */
export const piano = createPiano();
