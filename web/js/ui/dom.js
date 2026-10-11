// Tiny DOM helpers, icons, toasts and dialogs.

/** h('div', { class: 'x', onclick: fn }, child, 'text', [more]) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v; // only ever used with sanitized or static HTML
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// Icons: simple 24px stroke icons (drawn for this project).
const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
  cards: 'M4 7h12v13H4zM8 4h12v13',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
  clip: 'M20 11l-8 8a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8',
  camera: 'M3 8h4l2-3h6l2 3h4v11H3zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 3',
  pin: 'M9 3h6l-1 6 4 4H6l4-4zM12 13v8',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  tag: 'M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01',
  shuffle: 'M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3',
  graph: 'M6 6a2 2 0 1 0 0 .01M18 6a2 2 0 1 0 0 .01M12 18a2 2 0 1 0 0 .01M7.5 7.5l3.5 9M16.5 7.5l-3.5 9M8 6h8',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  file: 'M6 2h8l5 5v15H6zM14 2v5h5',
  download: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  sync: 'M20 11a8 8 0 0 0-14-5l-2 2M4 4v4h4M4 13a8 8 0 0 0 14 5l2-2M20 20v-4h-4',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  convert: 'M4 7h13l-3-3M20 17H7l3 3',
  awake: 'M12 3a6 6 0 0 0-4 10.5V17h8v-3.5A6 6 0 0 0 12 3zM9 21h6',
  panel: 'M3 4h18v16H3zM14 4v16',
  hash: 'M5 9h14M5 15h14M10 3L8 21M16 3l-2 18',
  source: 'M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a2 2 0 0 0-2 2 2 2 0 0 0-2-2H4zM12 5v16',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-4',
};

export function icon(name, cls = '') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon ${cls}`);
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.more);
  svg.append(p);
  return svg;
}

/** Button with icon and (optionally visually hidden) label. */
export function btn(label, onclick, { icon: ic, cls = '', hideLabel = false, title, type = 'button', disabled } = {}) {
  return h(
    'button',
    { type, class: `btn ${cls}`, onclick, title: title || (hideLabel ? label : null), 'aria-label': hideLabel ? label : null, disabled },
    ic ? icon(ic) : null,
    hideLabel ? null : h('span', null, label),
  );
}

export function toast(message, { kind = 'info', timeout = 3500, action } = {}) {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, h('span', null, message));
  if (action) el.append(h('button', { class: 'btn small', onclick: () => { action.run(); el.remove(); } }, action.label));
  host.append(el);
  setTimeout(() => el.remove(), timeout);
}

/**
 * A modal dialog / bottom sheet. Returns { el, close }.
 * content: Node; buttons: [{ label, value, cls }]; resolves with value.
 */
export function dialog({ title, content, buttons = [{ label: 'OK', value: true, cls: 'primary' }], sheet = false, onOpen }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const close = (value) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(undefined);
    };
    const box = h(
      'div',
      { class: `dialog ${sheet ? 'sheet' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
      title ? h('h2', { class: 'dialog-title' }, title) : null,
      h('div', { class: 'dialog-body' }, content),
      buttons.length
        ? h('div', { class: 'dialog-buttons' }, buttons.map((b) => h('button', { type: 'button', class: `btn ${b.cls || ''}`, onclick: () => close(typeof b.value === 'function' ? b.value() : b.value) }, b.label)))
        : null,
    );
    const overlay = h('div', { class: 'overlay', onclick: (e) => e.target === overlay && close(undefined) }, box);
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    box.close = close;
    if (onOpen) onOpen(box, close);
    else box.querySelector('input, textarea, select, button.primary, button')?.focus();
  });
}

export function confirmDialog(message, { ok = 'OK', cancel = 'Cancel', danger = false, title } = {}) {
  return dialog({
    title,
    content: h('p', null, message),
    buttons: [
      { label: cancel, value: false },
      { label: ok, value: true, cls: danger ? 'danger' : 'primary' },
    ],
  });
}

export function promptDialog(message, { value = '', placeholder = '', ok = 'OK', title } = {}) {
  const input = h('input', { type: 'text', value, placeholder, class: 'input', 'aria-label': message });
  return dialog({
    title,
    content: h('label', { class: 'field' }, h('span', null, message), input),
    buttons: [
      { label: 'Cancel', value: null },
      { label: ok, value: () => input.value, cls: 'primary' },
    ],
    onOpen: (box, close) => {
      input.focus();
      input.select();
      input.addEventListener('keydown', (e) => e.key === 'Enter' && close(input.value));
    },
  });
}

export function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? String(iso) : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
