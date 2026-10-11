// Quick capture: one tap, type, save. Creates a fleeting note in the inbox.
import { h, icon, toast, dialog } from './dom.js';
import { createNote, storeAttachment } from '../services/notes.js';
import { zk } from '../zk.js';

const DRAFT_KEY = 'zk:captureDraft';

export function openCapture({ text = '' } = {}) {
  if (!zk.config) return;
  if (document.querySelector('.capture-sheet')) return;
  const files = [];
  const draft = text || localStorage.getItem(DRAFT_KEY) || '';
  const area = h('textarea', {
    class: 'input capture-text',
    rows: 5,
    placeholder: 'What’s on your mind? (first line becomes the title)',
    'aria-label': 'Note text',
    value: draft,
  });
  area.value = draft;
  area.addEventListener('input', () => localStorage.setItem(DRAFT_KEY, area.value));
  const list = h('div', { class: 'capture-files' });
  const status = h('div', { class: 'muted small', role: 'status' });

  const addFiles = (fileList) => {
    for (const f of fileList) files.push(f);
    list.replaceChildren(...files.map((f, i) => h('span', { class: 'chip' }, icon(f.type.startsWith('image/') ? 'camera' : 'file', 'tiny'), f.name, h('button', { class: 'chip-x', 'aria-label': `Remove ${f.name}`, onclick: () => { files.splice(i, 1); addFiles([]); } }, '×'))));
  };
  const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => addFiles(e.target.files) });
  const picker = h('input', { type: 'file', multiple: true, hidden: true, onchange: (e) => addFiles(e.target.files) });

  const content = h('div', { class: 'capture' },
    area,
    list,
    h('div', { class: 'capture-tools' },
      h('button', { type: 'button', class: 'btn', onclick: () => camera.click() }, icon('camera'), h('span', null, 'Photo')),
      h('button', { type: 'button', class: 'btn', onclick: () => picker.click() }, icon('clip'), h('span', null, 'File')),
      camera, picker),
    status);

  return dialog({
    title: 'Quick capture',
    sheet: true,
    content,
    buttons: [
      { label: 'Cancel', value: false },
      { label: 'Save to inbox', value: true, cls: 'primary' },
    ],
    onOpen: (box, close) => {
      box.classList.add('capture-sheet');
      setTimeout(() => area.focus(), 30);
      // Replace the default Save handler so we can show progress before closing.
      const save = box.querySelector('.dialog-buttons .primary');
      const fresh = save.cloneNode(true);
      save.replaceWith(fresh);
      fresh.addEventListener('click', async () => {
        const body = area.value.trim();
        if (!body && !files.length) return close(false);
        fresh.disabled = true;
        try {
          const atts = [];
          for (const f of files) atts.push(await storeAttachment(f, (m) => (status.textContent = `${f.name}: ${m}`)));
          const imageRefs = atts.filter((a) => a.kind === 'image').map((a) => `![${a.name}](attachment:${a.hash})`);
          const fullBody = [body, ...imageRefs].filter(Boolean).join('\n\n');
          await createNote({ type: 'fleeting', status: 'inbox', body: fullBody, attachments: atts, title: body ? '' : atts[0]?.name || 'Photo' });
          localStorage.removeItem(DRAFT_KEY);
          toast('Saved to inbox', { kind: 'ok' });
          close(true);
        } catch (e) {
          fresh.disabled = false;
          status.textContent = e.message;
        }
      });
      area.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) fresh.click();
      });
    },
  });
}
