// Note editor: title, type, tags, source, body with [[link]] and #tag suggestions, attachments.
import { h, icon, btn, toast, dialog, confirmDialog } from '../dom.js';
import { zk } from '../../zk.js';
import { setLeaveGuard } from '../../app.js';
import { attachAutocomplete, notePicker } from '../autocomplete.js';
import { attachmentsList, hydrate, typeBadge } from '../components.js';
import { renderMarkdown } from '../markdown.js';
import { createNote, saveNote, storeAttachment, permanentChecklist, deriveTitle, TYPE_LABELS, TYPE_HELP, SOURCE_KINDS } from '../../services/notes.js';
import { normalizeTag } from '../../core/links.js';
import { NOTE_TYPES } from '../../core/vault.js';

const SOURCE_FIELDS = [
  ['source_kind', 'Kind'],
  ['author', 'Author'],
  ['url', 'Link (URL)'],
  ['year', 'Year'],
  ['publisher', 'Publisher / site'],
  ['accessed', 'Date accessed'],
];

export function editView(ctx) {
  const existing = ctx.params.id ? zk.vault.get(ctx.params.id) : null;
  if (ctx.params.id && !existing) {
    ctx.title = 'Not found';
    return h('div', { class: 'page' }, h('p', null, 'This note does not exist.'));
  }
  ctx.static = true; // don't re-render while typing
  ctx.noFab = true;
  const q = ctx.query;
  const promote = q.promote && NOTE_TYPES.includes(q.promote) ? q.promote : null;
  const from = q.from ? zk.vault.get(q.from) : null;

  // ---- initial state -------------------------------------------------------------
  const initial = existing
    ? {
        title: existing.title,
        type: promote || existing.type,
        status: promote && existing.status === 'inbox' ? 'active' : existing.status,
        tags: [...existing.fmTags],
        source: existing.source || '',
        body: existing.body.replace(/^\n+/, ''),
        attachments: existing.attachments.map((a) => ({ ...a })),
        extra: Object.fromEntries(SOURCE_FIELDS.map(([k]) => [k, existing.data[k] != null ? String(existing.data[k]) : ''])),
      }
    : {
        title: q.title || '',
        type: NOTE_TYPES.includes(q.type) ? q.type : 'permanent',
        status: q.type === 'fleeting' ? 'inbox' : 'active',
        tags: q.tag ? [q.tag] : from ? [...from.fmTags] : [],
        source: from?.type === 'source' ? from.id : from?.source || '',
        body: from ? `From [[${from.id}|${from.title}]]:\n\n` : '',
        attachments: [],
        extra: Object.fromEntries(SOURCE_FIELDS.map(([k]) => [k, ''])),
      };
  const state = structuredClone(initial);
  const draftKey = `zk:draft:${existing ? existing.id : 'new'}`;
  const typeChangedTo = () => (existing ? (state.type !== existing.type ? state.type : null) : state.type);

  ctx.title = existing ? (promote ? `Make ${TYPE_LABELS[promote].toLowerCase()}` : 'Edit note') : `New ${TYPE_LABELS[state.type].toLowerCase()} note`;

  // ---- fields --------------------------------------------------------------------
  const titleInput = h('input', { class: 'input title-input', type: 'text', value: state.title, placeholder: 'Title: state the idea in a few words', 'aria-label': 'Title' });
  const typeSelect = h('select', { class: 'input', 'aria-label': 'Note type' }, NOTE_TYPES.map((t) => h('option', { value: t, selected: t === state.type }, TYPE_LABELS[t])));
  const statusSelect = h('select', { class: 'input', 'aria-label': 'Status' },
    [['inbox', 'Inbox'], ['active', 'Active'], ['archived', 'Archived']].map(([v, l]) => h('option', { value: v, selected: v === state.status }, l)));
  const typeHelp = h('p', { class: 'muted small type-help' });

  const tagBox = h('div', { class: 'tag-input' });
  const tagField = h('input', { class: 'tag-entry', type: 'text', placeholder: 'Add tag…', 'aria-label': 'Add tag', autocapitalize: 'none', autocorrect: 'off', enterkeyhint: 'done' });
  const tagSuggest = h('div', { class: 'tag-suggest' });

  const sourceRow = h('div', { class: 'field' });
  const sourceFields = h('div', { class: 'source-fields' });

  const body = h('textarea', { class: 'input body-input', rows: 14, placeholder: 'Write in your own words. Type [[ to link a note, # to add a tag.', 'aria-label': 'Note text', spellcheck: true });
  body.value = state.body;
  const preview = h('div', { class: 'prose preview', hidden: true });
  const attachBox = h('div', { class: 'edit-attachments' });
  const checklist = h('div', { class: 'checklist', 'aria-live': 'polite' });
  const status = h('div', { class: 'muted small', role: 'status' });

  // ---- behaviour -------------------------------------------------------------------
  const readState = () => {
    state.title = titleInput.value;
    state.type = typeSelect.value;
    state.status = statusSelect.value;
    state.body = body.value;
  };
  const isDirty = () => {
    readState();
    return JSON.stringify(state) !== JSON.stringify(initial);
  };
  const saveDraft = () => {
    readState();
    try {
      if (isDirty()) localStorage.setItem(draftKey, JSON.stringify({ state, at: Date.now(), base: existing?.modified || null }));
    } catch { /* storage full; ignore */ }
  };
  setLeaveGuard(isDirty);

  const drawTags = () => {
    tagBox.replaceChildren(
      ...state.tags.map((t) => h('span', { class: 'chip tag' }, '#' + t, h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove tag ${t}`, onclick: () => { state.tags = state.tags.filter((x) => x !== t); drawTags(); refresh(); } }, '×'))),
      tagField,
    );
    const pref = tagField.value.trim();
    const sugg = (pref ? zk.vault.suggestTags(pref, 6) : zk.vault.tagCounts().slice(0, 8).map(([t]) => t)).filter((t) => !state.tags.includes(t));
    tagSuggest.replaceChildren(...sugg.map((t) => h('button', { type: 'button', class: 'chip suggest', onmousedown: (e) => e.preventDefault(), onclick: () => addTag(t) }, '+ #' + t)));
  };
  const addTag = (raw) => {
    for (const part of String(raw).split(/[,\s]+/)) {
      const t = normalizeTag(part);
      if (t && !state.tags.includes(t)) state.tags.push(t);
    }
    tagField.value = '';
    drawTags();
    refresh();
    tagField.focus();
  };
  tagField.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && tagField.value.trim()) {
      e.preventDefault();
      addTag(tagField.value);
    } else if (e.key === 'Backspace' && !tagField.value && state.tags.length) {
      state.tags.pop();
      drawTags();
    }
  });
  tagField.addEventListener('input', () => {
    if (/[,\s]$/.test(tagField.value)) addTag(tagField.value);
    else drawTags();
  });
  tagField.addEventListener('blur', () => tagField.value.trim() && addTag(tagField.value));

  const drawSource = () => {
    sourceRow.hidden = state.type !== 'literature';
    sourceFields.hidden = state.type !== 'source';
    if (state.type === 'literature') {
      const sources = zk.vault.ofType('source');
      const sel = h('select', { class: 'input', 'aria-label': 'Source' },
        h('option', { value: '' }, sources.length ? 'Choose a source…' : 'No sources yet'),
        sources.map((s) => h('option', { value: s.id, selected: s.id === state.source }, s.title + (s.data.author ? ` — ${s.data.author}` : ''))));
      sel.addEventListener('change', () => { state.source = sel.value; refresh(); });
      sourceRow.replaceChildren(
        h('span', { class: 'label' }, 'Source (what you read, watched or heard)'),
        h('div', { class: 'row gap' }, sel, btn('New source', newSource, { icon: 'plus' })),
      );
    }
    if (state.type === 'source') {
      sourceFields.replaceChildren(...SOURCE_FIELDS.map(([k, label]) => {
        const input = k === 'source_kind'
          ? h('select', { class: 'input' }, h('option', { value: '' }, '—'), SOURCE_KINDS.map((s) => h('option', { value: s, selected: state.extra[k] === s }, s[0].toUpperCase() + s.slice(1))))
          : h('input', { class: 'input', type: k === 'accessed' ? 'date' : k === 'url' ? 'url' : 'text', value: state.extra[k] || '', inputmode: k === 'year' ? 'numeric' : null });
        input.addEventListener('input', () => { state.extra[k] = input.value; });
        input.addEventListener('change', () => { state.extra[k] = input.value; });
        return h('label', { class: 'field' }, h('span', { class: 'label' }, label), input);
      }));
    }
  };

  async function newSource() {
    const fields = {};
    const content = h('div', null,
      ...[['title', 'Title'], ...SOURCE_FIELDS].map(([k, label]) => {
        const input = k === 'source_kind'
          ? h('select', { class: 'input' }, SOURCE_KINDS.map((s) => h('option', { value: s }, s[0].toUpperCase() + s.slice(1))))
          : h('input', { class: 'input', type: k === 'accessed' ? 'date' : k === 'url' ? 'url' : 'text', value: k === 'accessed' ? new Date().toISOString().slice(0, 10) : '' });
        fields[k] = input;
        return h('label', { class: 'field' }, h('span', { class: 'label' }, label), input);
      }));
    const ok = await dialog({ title: 'New source', content, buttons: [{ label: 'Cancel', value: false }, { label: 'Add source', value: true, cls: 'primary' }] });
    if (!ok || !fields.title.value.trim()) return;
    const extra = Object.fromEntries(SOURCE_FIELDS.map(([k]) => [k, fields[k].value || undefined]));
    const id = await createNote({ title: fields.title.value, type: 'source', status: 'active', extra });
    state.source = id;
    drawSource();
    refresh();
  }

  const drawAttachments = () => {
    attachBox.replaceChildren(attachmentsList({ attachments: state.attachments }, {
      onRemove: async (a) => {
        if (!(await confirmDialog(`Remove ${a.name} from this note? (The file stays in your vault until you clean up unused files in Settings.)`, { ok: 'Remove' }))) return;
        state.attachments = state.attachments.filter((x) => x.hash !== a.hash);
        body.value = body.value.replace(new RegExp(`!?\\[[^\\]]*\\]\\(attachment:(?:sha256-)?${a.hash}\\)\\n?`, 'g'), '');
        drawAttachments();
        saveDraft();
      },
    }) || '');
  };

  const refresh = () => {
    readState();
    typeHelp.textContent = TYPE_HELP[state.type];
    const changedTo = typeChangedTo();
    const showChecklist = state.type === 'permanent';
    checklist.hidden = !showChecklist;
    if (showChecklist) {
      const items = permanentChecklist({ title: state.title, tags: state.tags, body: state.body });
      checklist.replaceChildren(
        h('strong', null, changedTo === 'permanent' ? 'Before this becomes a permanent note:' : 'A good permanent note has:'),
        h('ul', null, items.map((c) => h('li', { class: c.ok ? 'ok' : 'todo' }, icon(c.ok ? 'check' : 'more', 'tiny'), c.label))),
        h('p', { class: 'muted small' }, 'Write it in your own words, so it makes sense without the source.'),
      );
    }
    if (state.type === 'literature' && !state.source) {
      checklist.hidden = false;
      checklist.replaceChildren(h('strong', null, 'Literature notes belong to a source.'), h('p', { class: 'muted small' }, 'Choose or add the book, article, podcast… above.'));
    }
    saveDraft();
  };

  // ---- attachments -----------------------------------------------------------------
  async function addFiles(files) {
    for (const f of files) {
      try {
        status.textContent = `${f.name}: uploading…`;
        const a = await storeAttachment(f, (m) => (status.textContent = `${f.name}: ${m}`));
        if (!state.attachments.some((x) => x.hash === a.hash)) state.attachments.push(a);
        if (a.kind === 'image') insertAtCaret(`\n![${a.name}](attachment:${a.hash})\n`);
        status.textContent = `${f.name} attached.`;
      } catch (e) {
        status.textContent = '';
        toast(e.message, { kind: 'error' });
      }
    }
    drawAttachments();
    refresh();
  }
  const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => addFiles([...e.target.files]) });
  const picker = h('input', { type: 'file', multiple: true, hidden: true, onchange: (e) => addFiles([...e.target.files]) });
  body.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  });
  body.addEventListener('dragover', (e) => e.preventDefault());
  body.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  });

  function insertAtCaret(text) {
    const s = body.selectionStart ?? body.value.length;
    body.setRangeText(text, s, body.selectionEnd ?? s, 'end');
    refresh();
  }

  async function insertLink() {
    const caret = [body.selectionStart, body.selectionEnd];
    const picked = await new Promise((resolve) => {
      const p = notePicker({ excludeId: existing?.id, onPick: (n) => box?.close(n) });
      let box;
      dialog({ title: 'Link to a note', content: p.el, buttons: [{ label: 'Cancel', value: null }], onOpen: (b) => { box = b; p.input.focus(); } }).then(resolve);
    });
    if (!picked) return;
    let id = picked.id;
    let title = picked.title;
    if (picked.create) {
      title = picked.create;
      id = await createNote({ title, type: 'permanent', status: 'inbox', body: '' });
    }
    body.focus();
    body.setSelectionRange(caret[0], caret[1]);
    const selected = body.value.slice(caret[0], caret[1]);
    insertAtCaret(`[[${id}|${selected || title}]]`);
  }

  let previewing = false;
  const previewBtn = btn('Preview', () => {
    previewing = !previewing;
    readState();
    if (previewing) {
      preview.innerHTML = renderMarkdown(state.body, zk.vault);
      hydrate(preview, { attachments: state.attachments, id: existing?.id });
    }
    preview.hidden = !previewing;
    body.hidden = previewing;
    previewBtn.querySelector('span').textContent = previewing ? 'Write' : 'Preview';
  }, { icon: 'eye' });

  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
    btn('Link', insertLink, { icon: 'link' }),
    btn('Tag', () => { body.focus(); insertAtCaret((/\s$|^$/.test(body.value.slice(0, body.selectionStart)) ? '' : ' ') + '#'); body.dispatchEvent(new Event('input')); }, { icon: 'hash' }),
    btn('Photo', () => camera.click(), { icon: 'camera' }),
    btn('File', () => picker.click(), { icon: 'clip' }),
    previewBtn,
    camera, picker);

  // ---- save ---------------------------------------------------------------------------
  async function save() {
    readState();
    if (!state.title.trim()) state.title = deriveTitle(state.body);
    if (!state.title.trim() && !state.body.trim()) return toast('Write a title or some text first.', { kind: 'warn' });
    const changedTo = typeChangedTo();
    if (changedTo === 'permanent') {
      const missing = permanentChecklist(state).filter((c) => !c.ok);
      if (missing.length) {
        const go = await dialog({
          title: 'Almost a permanent note',
          content: h('div', null, h('p', null, 'Permanent notes work best with:'), h('ul', null, missing.map((m) => h('li', null, m.label))), h('p', { class: 'muted small' }, 'Links and keywords are what let you find this idea again later.')),
          buttons: [{ label: 'Keep editing', value: false, cls: 'primary' }, { label: 'Save anyway', value: true }],
        });
        if (!go) return;
      }
    }
    if (state.type !== 'fleeting' && state.status === 'inbox' && changedTo) state.status = 'active';
    const extra = state.type === 'source' ? state.extra : {};
    saveBtn.disabled = true;
    try {
      let id;
      if (existing) {
        if (zk.vault.get(existing.id)?.modified !== existing.modified) {
          const ok = await confirmDialog('This note changed (on another device?) while you were editing. Save your version? The other version stays in History.', { ok: 'Save mine' });
          if (!ok) { saveBtn.disabled = false; return; }
        }
        id = await saveNote(existing.id, { ...state, source: state.type === 'literature' ? state.source : state.source || '', extra });
      } else {
        id = await createNote({ ...state, extra, source: state.source || null });
      }
      localStorage.removeItem(draftKey);
      setLeaveGuard(null);
      toast('Saved', { kind: 'ok' });
      ctx.navigate(q.next === 'process' ? '#/process' : `#/note/${id}`, { replace: true });
    } catch (e) {
      saveBtn.disabled = false;
      toast(`Could not save: ${e.message}`, { kind: 'error' });
    }
  }
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: save }, icon('check'), h('span', null, 'Save'));
  const cancel = async () => {
    if (isDirty() && !(await confirmDialog('Discard your changes?', { ok: 'Discard', danger: true }))) return;
    localStorage.removeItem(draftKey);
    setLeaveGuard(null);
    ctx.goBack();
  };

  // ---- wire up ------------------------------------------------------------------------
  titleInput.addEventListener('input', refresh);
  typeSelect.addEventListener('change', () => { readState(); drawSource(); refresh(); });
  statusSelect.addEventListener('change', refresh);
  body.addEventListener('input', refresh);
  body.addEventListener('keydown', (e) => {
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
  });
  const ac = attachAutocomplete(body, { noteId: existing?.id, onChange: refresh });
  ctx.onLeave = () => ac.destroy();

  drawTags();
  drawSource();
  drawAttachments();
  refresh();

  // Offer to restore an unsaved draft (e.g. if the phone closed the app mid-edit).
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
    if (draft && (!existing || draft.base === existing.modified) && JSON.stringify(draft.state) !== JSON.stringify(initial)) {
      setTimeout(async () => {
        const ok = await confirmDialog('You have unsaved changes from earlier. Restore them?', { ok: 'Restore', cancel: 'Discard' });
        if (ok) {
          Object.assign(state, draft.state);
          titleInput.value = state.title;
          typeSelect.value = state.type;
          statusSelect.value = state.status;
          body.value = state.body;
          drawTags(); drawSource(); drawAttachments(); refresh();
        } else localStorage.removeItem(draftKey);
      }, 50);
    }
  } catch { /* ignore */ }

  if (!existing) setTimeout(() => (state.title ? body : titleInput).focus(), 50);

  return h('div', { class: 'page edit-page' },
    promote ? h('div', { class: 'card nudge' }, h('p', null, promote === 'permanent'
      ? 'Rewrite the idea in your own words, give it a clear title, add a keyword tag and link it to at least one related note.'
      : 'Summarise the source in your own words and choose which source it is from.')) : null,
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Title'), titleInput),
    h('div', { class: 'row gap fields-row' },
      h('label', { class: 'field grow' }, h('span', { class: 'label' }, 'Type'), typeSelect),
      h('label', { class: 'field grow' }, h('span', { class: 'label' }, 'Status'), statusSelect)),
    typeHelp,
    sourceRow,
    sourceFields,
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Tags (keywords)'), tagBox, tagSuggest),
    toolbar,
    body,
    preview,
    status,
    attachBox,
    checklist,
    h('div', { class: 'save-bar' }, h('button', { class: 'btn', type: 'button', onclick: cancel }, 'Cancel'), saveBtn),
  );
}
