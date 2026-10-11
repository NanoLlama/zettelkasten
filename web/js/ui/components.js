// Shared UI pieces: note cards, type badges, tag chips, rendered note bodies, attachments.
import { h, icon, toast, dialog, clear } from './dom.js';
import { renderMarkdown, plainPreview } from './markdown.js';
import { zk } from '../zk.js';
import { TYPE_LABELS, attachmentUrl, createStub } from '../services/notes.js';
import { formatBytes } from '../core/bytes.js';
import { timeAgo } from './dom.js';

export function typeBadge(type) {
  return h('span', { class: `badge type-${type}`, title: TYPE_LABELS[type] }, TYPE_LABELS[type] || type);
}

export function statusChip(status) {
  if (status === 'active') return null;
  return h('span', { class: `chip status-${status}` }, status === 'inbox' ? 'Inbox' : status === 'archived' ? 'Archived' : status);
}

export function tagChips(tags, { link = true } = {}) {
  if (!tags?.length) return null;
  return h(
    'div',
    { class: 'tags' },
    tags.map((t) => (link ? h('a', { class: 'chip tag', href: `#/search?q=${encodeURIComponent('tag:' + t)}` }, '#' + t) : h('span', { class: 'chip tag' }, '#' + t))),
  );
}

/** A tappable note row for lists. */
export function noteCard(note, { snippet, extra, href, onclick, compact = false } = {}) {
  const preview = snippet != null ? h('p', { class: 'snippet', html: snippet }) : compact ? null : h('p', { class: 'snippet' }, plainPreview(note.body, zk.vault));
  return h(
    'a',
    { class: 'card note-card', href: href || `#/note/${note.id}`, onclick },
    h('div', { class: 'card-top' }, typeBadge(note.type), statusChip(note.status), note.pinned ? icon('pin', 'tiny') : null, h('span', { class: 'muted small right' }, timeAgo(note.modified))),
    h('div', { class: 'card-title' }, note.title),
    preview,
    extra || null,
    !compact && note.tags.length ? h('div', { class: 'small muted' }, note.tags.slice(0, 5).map((t) => '#' + t).join(' ')) : null,
  );
}

export function emptyState(text, action) {
  return h('div', { class: 'empty' }, h('p', null, text), action || null);
}

export function section(title, ...children) {
  return h('section', { class: 'section' }, title ? h('h2', { class: 'section-title' }, title) : null, ...children);
}

/** Rendered Markdown body with live links, attachment images and "create this note" links. */
export function noteBody(note, { onNavigate } = {}) {
  const el = h('div', { class: 'prose', html: renderMarkdown(note.body, zk.vault) });
  hydrate(el, note, onNavigate);
  return el;
}

export function hydrate(el, note, onNavigate) {
  for (const img of el.querySelectorAll('img[data-attachment]')) {
    const hash = img.dataset.attachment;
    const meta = note?.attachments.find((a) => a.hash === hash);
    attachmentUrl(hash, meta?.name)
      .then((url) => {
        img.src = url;
        img.classList.remove('loading');
      })
      .catch(() => {
        img.alt = `${img.alt || 'Image'} (not available offline yet)`;
        img.classList.add('broken');
      });
    img.addEventListener('click', () => lightbox(img.src, img.alt));
  }
  for (const a of el.querySelectorAll('a[data-attachment]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const meta = note?.attachments.find((x) => x.hash === a.dataset.attachment);
      openAttachment({ hash: a.dataset.attachment, name: meta?.name || a.textContent, kind: meta?.kind });
    });
  }
  for (const a of el.querySelectorAll('a[data-create]')) {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const title = a.dataset.create;
      const ok = await dialog({
        title: 'Create this note?',
        content: h('p', null, `No note called “${title}” exists yet. Create it now? The link will point to it.`),
        buttons: [{ label: 'Cancel', value: false }, { label: 'Create note', value: true, cls: 'primary' }],
      });
      if (!ok) return;
      const id = await createStub(title, note?.id);
      location.hash = `#/edit/${id}`;
    });
  }
  if (onNavigate) {
    for (const a of el.querySelectorAll('a.wikilink[data-id]')) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        onNavigate(a.dataset.id);
      });
    }
  }
}

export function lightbox(src, alt) {
  if (!src) return;
  const img = h('img', { src, alt: alt || '' });
  let scale = 1;
  img.addEventListener('dblclick', () => {
    scale = scale === 1 ? 2.5 : 1;
    img.style.transform = `scale(${scale})`;
  });
  const overlay = h(
    'div',
    { class: 'lightbox', role: 'dialog', 'aria-label': 'Image', onclick: (e) => e.target !== img && overlay.remove() },
    h('button', { class: 'btn icon-only lightbox-close', 'aria-label': 'Close', onclick: () => overlay.remove() }, icon('close')),
    h('div', { class: 'lightbox-scroll' }, img),
  );
  document.body.append(overlay);
}

export async function openAttachment(a) {
  try {
    const url = await attachmentUrl(a.hash, a.name);
    if (a.kind === 'image') return lightbox(url, a.name);
    const link = h('a', { href: url, target: '_blank', rel: 'noopener' });
    // PDFs open in the browser's viewer; other files download / open in the matching app.
    if (!/\.pdf$/i.test(a.name || '')) link.download = a.name || 'attachment';
    document.body.append(link);
    link.click();
    link.remove();
  } catch (e) {
    toast(e.message, { kind: 'error' });
  }
}

/** Attachments panel: image thumbnails and document rows. */
export function attachmentsList(note, { onRemove } = {}) {
  const items = note.attachments || [];
  if (!items.length) return null;
  const images = items.filter((a) => a.kind === 'image');
  const others = items.filter((a) => a.kind !== 'image');
  const grid = h('div', { class: 'thumbs' });
  for (const a of images) {
    const img = h('img', { alt: a.name, class: 'loading' });
    attachmentUrl(a.hash, a.name).then((u) => { img.src = u; img.classList.remove('loading'); }).catch(() => img.classList.add('broken'));
    grid.append(
      h('div', { class: 'thumb' },
        h('button', { class: 'thumb-btn', 'aria-label': `Open ${a.name}`, onclick: () => lightbox(img.src, a.name) }, img),
        onRemove ? h('button', { class: 'btn icon-only small remove', 'aria-label': `Remove ${a.name}`, onclick: () => onRemove(a) }, icon('close')) : null),
    );
  }
  return h(
    'div',
    { class: 'attachments' },
    images.length ? grid : null,
    others.map((a) =>
      h('div', { class: 'doc-row' },
        h('button', { class: 'doc-open', onclick: () => openAttachment(a) },
          icon('file'),
          h('span', { class: 'doc-name' }, a.name),
          h('span', { class: 'muted small' }, formatBytes(a.size)),
          zk.vault.extracted.has(a.hash) ? h('span', { class: 'chip small', title: 'Text inside this file is searchable' }, 'searchable') : null),
        onRemove ? h('button', { class: 'btn icon-only small', 'aria-label': `Remove ${a.name}`, onclick: () => onRemove(a) }, icon('close')) : null),
    ),
  );
}

/** The backlinks / outgoing / related panels used by the note view and Review mode. */
export function linkPanels(note, { onNavigate, showRelated = true } = {}) {
  const go = (id) => (e) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(id);
    }
  };
  const back = zk.vault.backlinks(note.id);
  const out = zk.vault.outgoing(note.id);
  const wrap = h('div', { class: 'panels' });

  wrap.append(
    h('details', { class: 'panel', open: true },
      h('summary', null, `Backlinks (${back.length})`),
      back.length
        ? h('ul', { class: 'link-list' },
            back.map((b) =>
              h('li', null,
                h('a', { href: `#/note/${b.note.id}`, onclick: go(b.note.id) }, typeBadge(b.note.type), ' ', h('strong', null, b.note.title)),
                b.contexts.slice(0, 2).map((c) => h('div', { class: 'context' }, c)))))
        : h('p', { class: 'muted small' }, 'No notes link here yet. Linking is what makes notes valuable: add a link to this note from a related one.')),
  );

  wrap.append(
    h('details', { class: 'panel', open: true },
      h('summary', null, `Links from this note (${out.length})`),
      out.length
        ? h('ul', { class: 'link-list' },
            out.map((l) => {
              const n = l.to && zk.vault.get(l.to);
              return h('li', null, n
                ? h('a', { href: `#/note/${n.id}`, onclick: go(n.id) }, typeBadge(n.type), ' ', n.title)
                : h('span', { class: 'missing' }, `${l.label || l.target} (not written yet)`));
            }))
        : h('p', { class: 'muted small' }, 'No links yet. Type [[ while editing to link to another note.')),
  );

  if (note.urls.length) {
    wrap.append(
      h('details', { class: 'panel' },
        h('summary', null, `Web links (${note.urls.length})`),
        h('ul', { class: 'link-list' }, note.urls.map((u) => {
          let host = u;
          try { host = new URL(u).hostname.replace(/^www\./, ''); } catch { /* keep */ }
          return h('li', null, h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', class: 'external' }, h('span', { class: 'host' }, host), ' ', h('span', { class: 'muted small url' }, u)));
        }))),
    );
  }

  if (note.attachments.length) {
    wrap.append(h('details', { class: 'panel', open: true }, h('summary', null, `Attachments (${note.attachments.length})`), attachmentsList(note)));
  }

  if (note.type === 'source') {
    const lit = zk.vault.list().filter((n) => n.source === note.id);
    wrap.append(
      h('details', { class: 'panel', open: true }, h('summary', null, `Notes from this source (${lit.length})`),
        lit.length ? h('ul', { class: 'link-list' }, lit.map((n) => h('li', null, h('a', { href: `#/note/${n.id}`, onclick: go(n.id) }, typeBadge(n.type), ' ', n.title)))) : h('p', { class: 'muted small' }, 'None yet.')),
    );
  }

  if (showRelated) {
    const rel = zk.vault.related(note.id, 6);
    if (rel.length) {
      wrap.append(
        h('details', { class: 'panel' },
          h('summary', null, `Related, not yet linked (${rel.length})`),
          h('ul', { class: 'link-list' },
            rel.map((r) => h('li', null, h('a', { href: `#/note/${r.note.id}`, onclick: go(r.note.id) }, typeBadge(r.note.type), ' ', r.note.title), h('div', { class: 'context' }, r.why.join(' · ')))))),
      );
    }
  }
  return wrap;
}

export function noteHeader(note) {
  const source = note.source && zk.vault.get(note.source);
  return h(
    'header',
    { class: 'note-header' },
    h('div', { class: 'note-meta' }, typeBadge(note.type), statusChip(note.status), note.pinned ? h('span', { class: 'chip' }, icon('pin', 'tiny'), 'Pinned') : null),
    h('h1', { class: 'note-title' }, note.title),
    tagChips(note.tags),
    source ? h('p', { class: 'source-line' }, icon('source', 'tiny'), ' Source: ', h('a', { href: `#/note/${source.id}` }, source.title), source.data.author ? ` — ${source.data.author}` : '') : null,
    note.type === 'source' ? sourceDetails(note) : null,
    note.error ? h('p', { class: 'warn small' }, `The front matter of this file could not be read (${note.error}). The text is shown as is.`) : null,
  );
}

function sourceDetails(note) {
  const d = note.data;
  const rows = [
    ['Kind', d.source_kind],
    ['Author', d.author],
    ['Year', d.year],
    ['Publisher', d.publisher],
    ['Accessed', d.accessed],
  ].filter(([, v]) => v);
  return h(
    'dl',
    { class: 'source-details' },
    rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, String(v))]),
    d.url ? [h('dt', null, 'Link'), h('dd', null, h('a', { href: String(d.url), target: '_blank', rel: 'noopener noreferrer', class: 'external' }, String(d.url)))] : null,
  );
}

export function replaceChildren(el, ...nodes) {
  clear(el).append(...nodes.filter(Boolean));
}
