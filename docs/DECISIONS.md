# Design decisions

Choices made while building, and where they differ from the original spec
(`zettelkasten-spec.md`). The owner chose the overall architecture
(*web app + GitHub*) before work started.

## 1. Static web app + private GitHub repository instead of a self-hosted server

**Spec:** Node/Fastify server with SQLite, Docker, reached from the phone over Tailscale.
**Built:** A static Progressive Web App on GitHub Pages; notes are Markdown files in a private
GitHub repository, read and written through the GitHub API.

**Why:** the owner has no coding background and needs phone access. A home server must be kept
running, updated and reachable; this design needs no server at all, works anywhere the phone has
internet, and works offline. Git gives per-note history for free, and GitHub Actions run the
nightly backups even when every device is off.

**What changes as a result:**

| Spec item | Here |
|---|---|
| SQLite + FTS5 index | An in-memory BM25 index built on the device from the files (10,000 notes searched in well under 200 ms in tests). Like the spec's index it is derived and rebuildable; *Reindex all* rebuilds it. |
| File watcher for outside edits | Edits made elsewhere (another device, Obsidian, github.com) arrive on the next sync: on launch, on return to the app, and every 5 minutes. |
| Password + session cookie | A GitHub fine-grained token limited to the one repository, stored on the device. The phone's screen lock protects it. |
| Git auto-commit with debounce | Every save is a commit (saves happen on *Save*, not per keystroke). |
| Backups to `backups/` folder | Verified archives stored as private GitHub Releases in the vault repository, pruned 7/4/12, weekly test restore, plus optional S3 copy and manual export. |
| Docker / docker-compose | Not needed. `npm run serve` runs it locally for development. |
| REST API (§6) | Not needed: the app talks to the GitHub API directly (`web/js/store/github.js`). |
| React + Vite + CodeMirror | Plain JavaScript modules with no build step, so the files on GitHub are exactly what runs, and a textarea editor, which behaves best with the iPhone keyboard. |
| Graph library, markdown-it | markdown-it and DOMPurify are vendored in `web/vendor/`; no graph view yet (phase 2). |

## 2. Scope of this first version ("core first")

Built: everything in milestones 1–9 of the spec plus the inbox flow of milestone 11 and the lists of
milestone 10 (orphans, most connected, related, random, tags).

Left for a second round, after trying the app:
- graph view and *Suggest topics* (cluster detection)
- project/draft mode with outline builder, draft view, citations, `.docx`/PDF/BibTeX export
- split and merge helpers
- Web Share Target ("share to Slip-box"): **iOS Safari does not support it**. A workaround via an
  iOS Shortcut is possible later.
- fetching titles/favicons of web links (left out on purpose: no third-party requests)

## 3. Smaller decisions

- **IDs in the same minute:** the second note takes the next free minute, keeping the spec's
  `YYYYMMDDHHmm` format.
- **File names don't change on rename.** The slug is fixed at creation; titles live in front matter.
  Renaming would mean a delete + create on GitHub (two commits, risk of conflicts) and links don't
  need it.
- **Conflicts:** the edit being uploaded wins; the other version is saved as a new inbox note
  "… (conflict copy …)". A deletion never overrides an edit made elsewhere.
- **Notes without front matter** (e.g. created in another editor) are read with their file name or
  first heading as title, type `permanent`, status `active`.
- **Attachments:** default limit 25 MB (GitHub's API comfortably handles this), configurable up to 90 MB.
  Executable and script types, and HTML/SVG (which can carry scripts), are refused. Large photos are
  re-encoded to JPEG at most 2560 px on the long side, unless turned off.
- **Attachment text extraction** happens on the device at upload (pdf.js, mammoth for .docx, plain
  text) and is stored in `.zk/extracted/` so other devices don't redo it.
- **Trash** is emptied by the nightly backup job (30 days), not by the app, so a phone that's offline
  for a month can't delete anything unexpectedly.
- **Nightly time:** 02:00 in the time zone of the device that set up the vault, converted to UTC
  when the workflow is installed; it shifts by an hour across daylight-saving changes.
- **Offline:** the service worker caches the app; IndexedDB holds a full copy of all notes (not only
  recently viewed ones). Attachments are cached on the device once opened.
- **Privacy:** the app only talks to `api.github.com`. A Content Security Policy blocks everything
  else except images in notes from `https:` URLs.
- **Browser tests run in Chromium** at iPhone sizes; WebKit (Safari's engine) isn't available in
  the build environment. Test on a real iPhone before relying on it.
