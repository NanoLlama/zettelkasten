// Renders note Markdown to safe HTML with clickable [[links]], #tags and attachments.
import DOMPurify from '../../vendor/purify.es.mjs';

const md = window.markdownit({ html: false, linkify: true, typographer: true, breaks: true });

// Allow attachment:<hash> URLs (resolved to downloaded files after rendering).
const defaultValidate = md.validateLink;
md.validateLink = (url) => /^attachment:/i.test(url) || defaultValidate(url);

const escape = md.utils.escapeHtml;

// [[target]] and [[target|label]]
md.inline.ruler.before('link', 'wikilink', (state, silent) => {
  const src = state.src;
  const pos = state.pos;
  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false;
  const m = /^\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]+?))?\]\]/.exec(src.slice(pos));
  if (!m) return false;
  if (!silent) {
    const t = state.push('wikilink', '', 0);
    t.meta = { target: m[1].trim(), label: m[2] ? m[2].trim() : null };
  }
  state.pos += m[0].length;
  return true;
});

// #tag (at the start of the text or after whitespace / an opening bracket)
md.inline.ruler.before('emphasis', 'hashtag', (state, silent) => {
  const pos = state.pos;
  if (state.src.charCodeAt(pos) !== 0x23) return false;
  const prev = pos > 0 ? state.src[pos - 1] : ' ';
  if (!/[\s(,;]/.test(prev)) return false;
  const m = /^#([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/u.exec(state.src.slice(pos));
  if (!m || /^\d+$/.test(m[1])) return false;
  if (!silent) {
    const t = state.push('hashtag', '', 0);
    t.meta = { tag: m[1].replace(/[-/]+$/, '').toLowerCase(), text: m[0] };
  }
  state.pos += m[0].length;
  return true;
});

export function renderMarkdown(text, vault) {
  const env = { vault };
  return DOMPurify.sanitize(md.render(text || '', env), {
    ADD_ATTR: ['target', 'data-attachment', 'data-create', 'data-id', 'data-tag'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|#|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}

md.renderer.rules.wikilink = (tokens, idx, opts, env) => {
  const { target, label } = tokens[idx].meta;
  const id = env.vault?.idForTarget(target);
  if (id) {
    const title = env.vault.titleOf(id);
    return `<a class="wikilink" href="#/note/${id}" data-id="${id}" title="${escape(title)}">${escape(label || title)}</a>`;
  }
  return `<a class="wikilink missing" href="#" data-create="${escape(target)}" title="Create this note">${escape(label || target)}</a>`;
};

md.renderer.rules.hashtag = (tokens, idx) => {
  const { tag, text } = tokens[idx].meta;
  return `<a class="tag-link" href="#/search?q=${encodeURIComponent('tag:' + tag)}" data-tag="${escape(tag)}">${escape(text)}</a>`;
};

const attachHash = (url) => (/^attachment:(?:sha256-)?([a-f0-9]{64})/i.exec(url) || [])[1];

md.renderer.rules.image = (tokens, idx) => {
  const t = tokens[idx];
  const src = t.attrGet('src') || '';
  const alt = escape(t.content || '');
  const hash = attachHash(src);
  if (hash) return `<img data-attachment="${hash}" alt="${alt}" class="att-img loading">`;
  return `<img src="${escape(src)}" alt="${alt}" loading="lazy">`;
};

const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts));
md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
  const t = tokens[idx];
  const href = t.attrGet('href') || '';
  const hash = attachHash(href);
  if (hash) {
    t.attrSet('href', '#');
    t.attrSet('data-attachment', hash);
  } else if (/^https?:/i.test(href)) {
    t.attrSet('target', '_blank');
    t.attrSet('rel', 'noopener noreferrer');
    t.attrJoin('class', 'external');
  }
  return defaultLinkOpen(tokens, idx, opts, env, self);
};

/** Plain-text preview of a note body (for lists). */
export function plainPreview(body, vault, max = 140) {
  const text = String(body || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]+?))?\]\]/g, (_, t, l) => l || vault?.titleOf(t.trim()) || t)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, '') + '…' : text;
}
