# Slip-box: a digital Zettelkasten for your phone

A personal knowledge base of small, linked notes (a *Zettelkasten*, or slip-box) that supports
the whole workflow from quick capture to writing. It runs in the browser, installs on an
iPhone's home screen like an app, and keeps your notes as plain Markdown files in **your own
private GitHub repository**, where every change is versioned and backed up every night.

**→ New here? Follow the [setup guide](docs/SETUP-GUIDE.md).** No coding needed; it takes about 15 minutes.

## What it does

| | |
|---|---|
| **Capture** | A **+** button on every screen. Type a thought or snap a photo; it lands in your Inbox. |
| **Note types** | Fleeting, literature (tied to a source), permanent, index (entry points), project, and source notes. |
| **Linking** | Type `[[` to link another note; `#` to tag. Every note shows its **backlinks** with the sentence around each link, plus *related notes* you haven't linked yet. Links point at the note's ID, so renaming never breaks them. |
| **Process inbox** | One note at a time: make permanent, make literature, keep, archive or delete. Promoting to permanent asks for a tag and a link. |
| **Search** | Instant, as you type, with highlighted snippets. Supports `"phrases"`, `-exclude`, `tag:`, `type:`, `status:`, `has:attachment`, `linked-to:`, `created:>2026-01-01`, `is:orphan`, and finds text inside attached PDFs and Word files. |
| **Attachments** | Photos (camera or library), PDFs, Office documents and other files. Images show inline with tap-to-zoom. |
| **Review mode** | Built for a phone held sideways: the note on the left, its links on the right. Swipe or tap the big arrows to move through your inbox, a tag, an index note, search results or random notes. A back button follows links you tap. Optional *keep screen awake*. |
| **Discover** | Most connected notes, unlinked ("orphan") notes, tag cloud, random note, pinned entry points. |
| **History** | Every save is a commit. See any earlier version of a note, compare it, and restore it. |
| **Backups** | Nightly verified `.zip` archives (7 daily, 4 weekly, 12 monthly kept), a weekly *test restore*, one-tap **Back up now** and **Restore**, a warning banner if backups fail, optional off-site copy to S3/Backblaze/R2, and one-click export (plain or Obsidian-ready). |
| **Offline** | Opens and shows all notes with no connection; edits are queued and upload when you're back online. If a note was changed in two places, both versions are kept. |
| **Comfort** | Dark mode (automatic or manual), adjustable text size, 44-pixel touch targets, works from 360 px wide. |

Try it without setting anything up: open the app and choose **Try with sample notes**. The
~30 sample notes explain the method as you click through them.

## How it is built

```
web/                 the app (plain HTML/CSS/JavaScript, no build step), published with GitHub Pages
  js/core/           note format, links, search index, sync engine (shared with the backup tools)
  js/store/          GitHub storage, demo storage, on-device cache (IndexedDB)
  js/services/       note operations, attachments, backups, export, vault setup
  js/ui/             screens and components
  vendor/            third-party libraries, served locally so the app works offline
  vault-template/    files the app installs into your vault: backup workflows and tools
seed/vault/          the sample vault as real files (open it in Obsidian to see the format)
tests/unit/          Vitest: format, search syntax, sync and conflicts, GitHub store, backup/restore
tests/e2e/           Playwright: the real app at iPhone portrait (390×844) and landscape (844×390)
docs/                setup guide, file format, design decisions
```

Your vault repository looks like this:

```
notes/20261011-1208-retrieval-practice-strengthens-memory.md   one Markdown file per note
attachments/<sha256>.png                                        files named by content (deduplicated)
.zk/extracted/<sha256>.txt                                      text from attachments, for search
.zk/trash/                                                      deleted notes (kept 30 days)
.github/workflows/zk-backup.yml …                               nightly backup, restore, weekly test
```

See [docs/FORMAT.md](docs/FORMAT.md) for the file format and [docs/DECISIONS.md](docs/DECISIONS.md)
for why it is built this way (including where it differs from the original spec).

## For developers

```bash
npm install
npm run serve        # http://localhost:8080
npm test             # unit tests
npm run test:e2e     # browser tests at phone sizes
npm run seed         # rebuild the sample vault after editing scripts/seed-notes.mjs
npm run vendor       # re-copy libraries from node_modules into web/vendor
```

Pushing to `main` publishes `web/` to GitHub Pages (`.github/workflows/pages.yml`).
