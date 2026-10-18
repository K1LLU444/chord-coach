// Tiny DOM helpers.

const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected']);

/** h('button', { class: 'btn', onclick }, 'Label') */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

let toastTimer;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) document.body.append((el = h('div', { class: 'toast', role: 'status' })));
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/** Segmented control: options = [[value, label], …] */
export function segmented(options, current, onChange, label) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  for (const [value, text] of options) {
    wrap.append(h('button', {
      type: 'button',
      'aria-pressed': String(value === current),
      onclick: () => {
        wrap.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false'));
        wrap.querySelector(`[data-v="${CSS.escape(String(value))}"]`).setAttribute('aria-pressed', 'true');
        onChange(value);
      },
      'data-v': value,
    }, text));
  }
  return wrap;
}

export function toggle(text, checked, onChange) {
  return h('label', { class: 'toggle' },
    h('input', { type: 'checkbox', checked, onchange: e => onChange(e.target.checked) }),
    h('span', { class: 'switch', 'aria-hidden': 'true' }),
    h('span', {}, text));
}

/** Like el.replaceChildren, but skips false/null so `cond && h(...)` works. */
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter(c => c != null && c !== false));
  return el;
}
