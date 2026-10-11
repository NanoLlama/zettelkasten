// Best-effort text extraction from attachments so their contents are searchable.
// The PDF and Word readers are large, so they load only when first needed.
import { extOf } from './notes.js';

const MAX_CHARS = 400_000;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(s);
  });
}

export async function extractText(name, bytes) {
  const ext = extOf(name);
  if (['txt', 'md', 'csv', 'markdown'].includes(ext)) return new TextDecoder().decode(bytes).slice(0, MAX_CHARS);
  if (ext === 'pdf') return extractPdf(bytes);
  if (ext === 'docx') return extractDocx(bytes);
  return '';
}

async function extractPdf(bytes) {
  const pdfjs = await import('../../vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const parts = [];
  let total = 0;
  for (let i = 1; i <= doc.numPages && total < MAX_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('');
    parts.push(text);
    total += text.length;
  }
  await doc.destroy();
  return parts.join('\n\n').slice(0, MAX_CHARS);
}

async function extractDocx(bytes) {
  if (!window.mammoth) await loadScript(new URL('../../vendor/mammoth.browser.min.js', import.meta.url).href);
  const res = await window.mammoth.extractRawText({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  return res.value.slice(0, MAX_CHARS);
}
