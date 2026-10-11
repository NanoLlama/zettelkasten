// Draws the app icons and the sample-vault attachments with a headless browser.
// Run once (outputs are committed): node scripts/make-assets.mjs
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const page = await browser.newPage();

// App icons
const svg = readFileSync(join(root, 'web/icons/icon.svg'), 'utf8');
for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['apple-touch-icon.png', 180, 0], ['icon-maskable-512.png', 512, 0.12]]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<html><body style="margin:0;background:#2f5d50;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `).replace(name === 'apple-touch-icon.png' || pad ? 'rx="112"' : '__', 'rx="0"')}</div></body></html>`);
  writeFileSync(join(root, 'web/icons', name), await page.screenshot({ type: 'png' }));
}

// Sample attachments
await page.setViewportSize({ width: 1100, height: 300 });
await page.setContent(`<html><body style="margin:0;font:600 22px -apple-system,Segoe UI,Arial;background:#fffdf8;color:#1f2328">
<div style="display:flex;gap:14px;align-items:center;justify-content:center;height:300px">
${[['Fleeting', '#fbf0c8'], ['Literature', '#dcebf6'], ['Permanent', '#d9eae2'], ['Topic', '#ebdff6'], ['Draft', '#f7e0da']]
  .map(([t, c], i) => `${i ? '<div style="font-size:34px;color:#5f6670">→</div>' : ''}<div style="background:${c};border-radius:14px;padding:24px 16px;min-width:110px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.12)">${t}</div>`).join('')}
</div></body></html>`);
writeFileSync(join(root, 'seed/assets/workflow.png'), await page.screenshot({ type: 'png' }));

await page.setViewportSize({ width: 800, height: 520 });
await page.setContent(`<html><body style="margin:0;background:#f4f6f5;font:28px 'Comic Sans MS','Marker Felt',cursive;color:#1b4f9c">
<div style="padding:40px;line-height:1.7">Study plan ✏️<br>• quiz myself — don't reread!<br>• space it: day 1, 3, 7<br>• mix topics (interleave)<br><span style="color:#b03030">→ test on Friday</span></div></body></html>`);
writeFileSync(join(root, 'seed/assets/whiteboard.png'), await page.screenshot({ type: 'png' }));

await page.setContent(`<html><body style="font:14px Georgia,serif;padding:40px;color:#222">
<h1 style="font-size:22px">Handout: Retrieval practice study (sample)</h1>
<p>This is a sample handout used to demonstrate that text inside attached PDFs is searchable.</p>
<h2 style="font-size:16px">Conditions</h2>
<ol><li>Study, study, study, study (rereading only)</li><li>Study, test, test, test (retrieval practice)</li></ol>
<p>After one week, the retrieval group recalled substantially more. One proposed mechanism is that effortful recall
strengthens consolidation in the hippocampus and makes memories easier to reach later.</p>
<p>Search tip: search your slip-box for <b>hippocampus</b> to find the note this PDF is attached to.</p>
</body></html>`);
writeFileSync(join(root, 'seed/assets/retrieval-handout.pdf'), await page.pdf({ format: 'A5' }));

await browser.close();
console.log('Icons and sample attachments written.');
