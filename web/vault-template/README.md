# My Slip-box vault

This private repository holds the notes of my [Slip-box](__APP_URL__) (a digital Zettelkasten).

- `notes/` — one Markdown file per note (`YYYYMMDD-HHmm-title.md`). Plain text: readable in any editor or in Obsidian.
- `attachments/` — images and documents, named by their content fingerprint.
- `.zk/` — app data: extracted text from attachments (for search), the trash, and backup tools.
- `.github/workflows/` — automatic backups (nightly), restore, and a weekly test restore.

Every change made in the app is saved here as a commit, so the full history of every note is kept.
Backups appear under **Releases**. Do not rename the `notes/` folder or the note files' date prefix.
