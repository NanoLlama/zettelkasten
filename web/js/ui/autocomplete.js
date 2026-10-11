// Suggestions while typing in the note editor:
//   [[  -> note titles (inserts [[ID|Title]])
//   #   -> existing tags
// The suggestion bar sits just above the on-screen keyboard on phones.
import { h, icon } from './dom.js';
import { zk } from '../zk.js';
import { typeBadge } from './components.js';
import { createNote } from '../services/notes.js';

const LINK_RE = /\[\[([^\[\]\n|]{0,60})$/;
const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_\-/]{0,40})$/u;

export function attachAutocomplete(textarea, { noteId, onChange }) {
  const box = h('div', { class: 'ac-box', role: 'listbox', 'aria-label': 'Suggestions', hidden: true });
  document.body.append(box);
  let items = [];
  let active = 0;
  let trigger = null; // { kind, start, query }

  const position = () => {
    const vv = window.visualViewport;
    if (vv) {
      const bottom = window.innerHeight - (vv.offsetTop + vv.height);
      box.style.bottom = `${Math.max(0, bottom)}px`;
    }
  };

  function detect() {
    const caret = textarea.selectionStart;
    if (caret !== textarea.selectionEnd) return null;
    const before = textarea.value.slice(0, caret);
    let m = LINK_RE.exec(before);
    if (m) return { kind: 'link', start: caret - m[0].length, query: m[1] };
    m = TAG_RE.exec(before);
    if (m) return { kind: 'tag', start: caret - m[2].length - 1, query: m[2] };
    return null;
  }

  function update() {
    trigger = detect();
    if (!trigger) return hide();
    if (trigger.kind === 'link') {
      const notes = zk.vault.suggestTitles(trigger.query, 6, noteId);
      items = notes.map((n) => ({ label: n.title, note: n, insert: `[[${n.id}|${n.title}]]` }));
      const q = trigger.query.trim();
      if (q && !zk.vault.byTitle(q)) items.push({ label: `Create “${q}”`, create: q });
    } else {
      if (!trigger.query) return hide();
      items = zk.vault.suggestTags(trigger.query, 6).map((t) => ({ label: '#' + t, insert: `#${t} ` }));
    }
    if (!items.length) return hide();
    active = 0;
    draw();
  }

  function draw() {
    box.replaceChildren(
      h('div', { class: 'ac-head muted small' }, trigger.kind === 'link' ? 'Link to a note' : 'Tags'),
      ...items.map((it, i) =>
        h('button', {
          type: 'button',
          class: `ac-item ${i === active ? 'active' : ''}`,
          role: 'option',
          'aria-selected': i === active ? 'true' : 'false',
          onmousedown: (e) => e.preventDefault(), // keep the keyboard open
          onclick: () => choose(i),
        },
        it.note ? typeBadge(it.note.type) : it.create ? icon('plus', 'tiny') : icon('tag', 'tiny'),
        h('span', null, it.label))),
    );
    box.hidden = false;
    position();
  }

  function hide() {
    box.hidden = true;
    items = [];
    trigger = null;
  }

  async function choose(i) {
    const it = items[i];
    if (!it || !trigger) return;
    let insert = it.insert;
    if (it.create) {
      const id = await createNote({ title: it.create, type: 'permanent', status: 'inbox', body: '' });
      insert = `[[${id}|${it.create}]]`;
    }
    const caret = textarea.selectionStart;
    let end = caret;
    if (trigger.kind === 'link' && textarea.value.slice(caret, caret + 2) === ']]') end += 2;
    textarea.setRangeText(insert, trigger.start, end, 'end');
    hide();
    textarea.focus();
    onChange?.();
  }

  const onKey = (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % items.length; draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = (active - 1 + items.length) % items.length; draw(); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { choose(active); e.preventDefault(); }
    else if (e.key === 'Escape') { hide(); e.preventDefault(); }
  };

  textarea.addEventListener('input', update);
  textarea.addEventListener('click', update);
  textarea.addEventListener('keydown', onKey);
  textarea.addEventListener('blur', () => setTimeout(hide, 150));
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);

  return {
    destroy() {
      box.remove();
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    },
  };
}

/** A dialog-free note picker (search box + results) used by "Insert link" and Review. */
export function notePicker({ onPick, excludeId, placeholder = 'Search notes to link…' }) {
  const input = h('input', { type: 'search', class: 'input', placeholder, 'aria-label': placeholder, autocomplete: 'off' });
  const list = h('div', { class: 'picker-list' });
  const draw = () => {
    const q = input.value.trim();
    const notes = q ? zk.vault.search(q, { limit: 12 }).map((r) => r.note) : zk.vault.recent(12);
    list.replaceChildren(...notes.filter((n) => n.id !== excludeId).map((n) =>
      h('button', { type: 'button', class: 'ac-item', onclick: () => onPick(n) }, typeBadge(n.type), h('span', null, n.title))));
    if (q && !zk.vault.byTitle(q)) list.append(h('button', { type: 'button', class: 'ac-item', onclick: () => onPick({ create: q }) }, icon('plus', 'tiny'), h('span', null, `Create “${q}”`)));
  };
  input.addEventListener('input', draw);
  draw();
  return { el: h('div', { class: 'picker' }, input, list), input };
}
