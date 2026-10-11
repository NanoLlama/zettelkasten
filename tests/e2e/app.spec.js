import { test, expect } from '@playwright/test';

async function startDemo(page) {
  await page.goto('./#/welcome');
  await page.getByRole('button', { name: 'Try with sample notes' }).click();
  await expect(page.getByText('notes waiting in your inbox')).toBeVisible();
}

const isLandscape = (testInfo) => testInfo.project.name === 'phone-landscape';

test('quick capture puts a fleeting note in the inbox', async ({ page }) => {
  await startDemo(page);
  await page.getByRole('button', { name: 'Quick capture' }).click();
  await page.getByLabel('Note text').fill('Idea from the bus\nmore detail here');
  await page.getByRole('button', { name: 'Save to inbox' }).click();
  await expect(page.getByText('Saved to inbox')).toBeVisible();
  await expect(page.locator('.big-number')).toHaveText('6');
  await page.goto('./#/search?q=status:inbox bus');
  await expect(page.locator('.note-card').first()).toContainText('Idea from the bus');
});

test('typing [[ links a note and the backlink appears; renaming keeps the link', async ({ page }) => {
  await startDemo(page);
  await page.goto('./#/new?type=permanent');
  await page.getByLabel('Title', { exact: true }).fill('Sleep consolidates learning');
  const body = page.getByLabel('Note text');
  await body.click();
  await body.pressSequentially('Sleep helps. See [[spacing');
  await page.locator('.ac-item', { hasText: 'Spacing effect' }).click();
  await expect(body).toHaveValue(/\[\[202609081030\|Spacing effect\]\]/);
  await page.getByLabel('Add tag').fill('memory,');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.note-title')).toHaveText('Sleep consolidates learning');

  await page.goto('./#/note/202609081030');
  const back = page.locator('details.panel', { hasText: 'Backlinks' });
  await expect(back).toContainText('Sleep consolidates learning');
  await expect(back).toContainText('Sleep helps. See Spacing effect');

  // Rename the target: the link still works because it points at the ID.
  await page.goto('./#/edit/202609081030');
  await page.getByLabel('Title', { exact: true }).fill('The spacing effect (renamed)');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.note-title')).toHaveText('The spacing effect (renamed)');
  await expect(page.locator('details.panel', { hasText: 'Backlinks' })).toContainText('Sleep consolidates learning');
});

test('search syntax and attachment text', async ({ page }) => {
  await startDemo(page);
  const search = async (q) => {
    await page.goto('./#/search?q=' + encodeURIComponent(q));
    await expect(page.getByRole('status').filter({ hasText: /result/ })).toBeVisible();
    return page.locator('.note-card .card-title').allTextContents();
  };
  expect(await search('type:index')).toEqual(expect.arrayContaining(['Start here', 'Learning and memory', 'The Zettelkasten method']));
  expect(await search('tag:memory "spacing effect"')).toContain('Spacing effect');
  expect(await search('hippocampus')).toEqual(['Make It Stick: testing beats rereading']);
  await expect(page.getByText('Found in an attachment')).toBeVisible();
  expect(await search('linked-to:202609081030 type:index')).toEqual(['Learning and memory']);
  expect(await search('status:inbox has:attachment')).toEqual(['Photo of whiteboard']);
  expect((await search('created:>2026-10-01')).length).toBe(5);
});

test('process inbox: keep, archive and make permanent', async ({ page }) => {
  await startDemo(page);
  await page.goto('./#/process');
  await expect(page.getByText('1 of 5 in inbox')).toBeVisible();
  await page.getByRole('button', { name: /Keep as fleeting/ }).click();
  await expect(page.getByText('of 4 in inbox')).toBeVisible();
  await page.getByRole('button', { name: /Archive/ }).click();
  await expect(page.getByText('of 3 in inbox')).toBeVisible();
  await page.getByRole('button', { name: /Make permanent/ }).click();
  await expect(page.getByText('Before this becomes a permanent note:')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  // Missing tag and link: the app nudges first.
  await expect(page.getByText('Almost a permanent note')).toBeVisible();
  await page.getByRole('button', { name: 'Save anyway' }).click();
  await expect(page.getByText('of 2 in inbox')).toBeVisible();
});

test('review mode shows note and links side by side in landscape and swipes', async ({ page }, testInfo) => {
  await startDemo(page);
  await page.goto('./#/review?src=' + encodeURIComponent('index:202609120930') + '&fresh=1');
  await expect(page.locator('.review-title')).toContainText('1 / 6');
  const note = page.locator('.review-note');
  const side = page.locator('.review-side');
  await expect(note).toBeVisible();
  await expect(side).toContainText('Backlinks');
  const nb = await note.boundingBox();
  const sb = await side.boundingBox();
  if (isLandscape(testInfo)) {
    expect(sb.x).toBeGreaterThan(nb.x + nb.width - 2); // side by side
    expect(Math.abs(sb.y - nb.y)).toBeLessThan(5);
  } else {
    expect(sb.y).toBeGreaterThan(nb.y); // stacked below in portrait
  }
  // Swipe left -> next note
  const box = await page.locator('.review-body').boundingBox();
  const y = box.y + 120;
  await page.locator('.review-body').dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: box.x + 300, clientY: y }], changedTouches: [{ identifier: 1, clientX: box.x + 300, clientY: y }] });
  await page.locator('.review-body').dispatchEvent('touchend', { touches: [], changedTouches: [{ identifier: 1, clientX: box.x + 100, clientY: y }] });
  await expect(page.locator('.review-title')).toContainText('2 / 6');
  // Big buttons work too
  await page.getByRole('button', { name: 'Next note' }).click();
  await expect(page.locator('.review-title')).toContainText('3 / 6');
  // Following a link keeps a history stack with a back button
  await page.locator('.review-note a.wikilink').first().click();
  await expect(page.locator('.review-title')).toContainText('Following links (1)');
  await page.getByRole('button', { name: 'Back to previous note' }).click();
  await expect(page.locator('.review-title')).toContainText('3 / 6');
});

test('inbox review in landscape lets me swipe through the inbox', async ({ page }) => {
  await startDemo(page);
  await page.goto('./#/review?src=inbox&fresh=1');
  await expect(page.locator('.review-title')).toContainText('1 / 5');
  for (let i = 2; i <= 5; i++) {
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.review-title')).toContainText(`${i} / 5`);
  }
});

test('delete moves to trash and can be restored; history shows versions', async ({ page }) => {
  await startDemo(page);
  await page.goto('./#/note/202610101230');
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: /^Delete/ }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.big-number')).toHaveText('4'); // back home, one fewer in the inbox
  await page.goto('./#/search?q=' + encodeURIComponent('"Ask Sam"'));
  await expect(page.getByText('No notes match')).toBeVisible();
  await page.goto('./#/trash');
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('.note-title')).toHaveText('Ask Sam how they organise notes');

  await page.goto('./#/edit/202609061045');
  await page.getByLabel('Note text').fill('Changed text for history.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.note-title')).toHaveText('One idea per note');
  // The version list comes from the store once the upload has finished.
  await expect(async () => {
    await page.goto('./#/history/202609061045');
    await expect(page.locator('.version')).toHaveCount(2, { timeout: 1000 });
  }).toPass();
  await page.locator('.version').nth(1).click();
  await expect(page.locator('.diff')).toContainText('Changed text for history.');
});

test('works offline after the first visit', async ({ page, context }) => {
  await startDemo(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByText('notes waiting in your inbox')).toBeVisible();
  await context.setOffline(true);
  await page.goto('./#/note/202609081000');
  await expect(page.locator('.note-title')).toHaveText('Retrieval practice strengthens memory');
  await expect(page.locator('.prose img, .prose a.wikilink').first()).toBeVisible();
});

test('images render inline and dark mode can be switched on', async ({ page }) => {
  await startDemo(page);
  await page.goto('./#/note/202609031040');
  const img = page.locator('.prose img[data-attachment]');
  await expect(img).toHaveAttribute('src', /^blob:/);
  expect(await img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(100);
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(22, 24, 28)');
});

test('touch targets are at least 44px and nothing scrolls sideways', async ({ page }) => {
  await startDemo(page);
  for (const route of ['./#/', './#/note/202609081000', './#/search?q=memory', './#/process', './#/settings']) {
    await page.goto(route);
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, route).toBeLessThanOrEqual(0);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('.bottomnav a, .btn:not(.small), .fab, .topbar .btn')]
        .filter((el) => el.offsetParent)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.height < 43.5 || r.width < 43.5).length);
    expect(small, route).toBe(0);
  }
});
