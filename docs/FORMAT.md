# Vault file format (version 1)

The vault is a folder (a private GitHub repository) of plain files. The app's search index
and link graph are rebuilt from these files every time, so the files are the only source of truth.

## Layout

```
notes/                 one .md file per note; flat (no sub-folders)
attachments/           <sha256>.<ext>  — files named by the SHA-256 of their contents
.zk/vault.json         { "format": 1, "app": "<url>", "timezone": "...", "installed": "..." }
.zk/extracted/         <sha256>.txt    — text extracted from an attachment (for search)
.zk/trash/             deleted notes, same file name as in notes/, with a `deleted:` timestamp
.zk/tools/             backup tool + a copy of the app's parsing code (used by the backup jobs)
.github/workflows/     zk-backup.yml, zk-restore.yml, zk-test-restore.yml
```

## Note files

File name: `YYYYMMDD-HHmm-slug.md`, e.g. `20261011-1208-retrieval-practice-strengthens-memory.md`.
The slug comes from the title when the note is created and is **not** changed when the title
changes (links never depend on it).

```markdown
---
id: "202610111208"
title: Retrieval practice strengthens memory
type: permanent
tags: [learning, memory]
source: "202610110955"
created: 2026-10-11T12:08:00-04:00
modified: 2026-10-11T12:30:00-04:00
status: active
pinned: true
attachments:
  - hash: sha256-<64 hex characters>
    name: diagram.png
    kind: image
    size: 48211
---

Testing yourself works better than rereading. See [[202610101430|spacing effect]].

![diagram.png](attachment:<64 hex characters>)
```

| Field | Values | Notes |
|---|---|---|
| `id` | 12 digits `YYYYMMDDHHmm` | Creation time (local). Stable forever. If two notes are created in the same minute, the second takes the next free minute. |
| `title` | text | Shown everywhere; may change freely. |
| `type` | `fleeting` `literature` `permanent` `index` `project` `source` | Missing or unknown → treated as `permanent`. |
| `tags` | list | Lower-case. Inline `#tags` in the body are tags too. `/` makes a hierarchy: `tag:learning` also matches `learning/spaced`. |
| `source` | note ID | Literature notes point at a `type: source` note. |
| `created`, `modified` | ISO 8601 with offset | |
| `status` | `inbox` `active` `archived` | Fleeting notes default to `inbox`. |
| `pinned` | `true` | Shows the note under *Entry points* on the home screen. |
| `attachments` | list of `{hash, name, kind, size}` | `kind`: `image`, `document` or `other`. |
| `deleted` | timestamp | Only in `.zk/trash/`. |
| `conflict_of` | note ID | On a conflict copy: the note it was copied from. |

**Source notes** (`type: source`) may also have: `source_kind` (book, article, podcast, video,
conversation, website, other), `author`, `url`, `year`, `publisher`, `accessed`.

Unknown fields are kept untouched when the app saves a note.

## Links

- `[[202610101430]]` or `[[202610101430|label]]`: link to a note by ID (the form the app writes).
- `[[Note title]]` is accepted when typing; on save it becomes `[[ID|Note title]]` if that note exists.
  If not, it stays as is and shows as a "create this note" link.
- `![name](attachment:<hash>)` shows an attached image inline; `[name](attachment:<hash>)` links to a file.
- Links inside `code` are ignored.

## Compatibility

Any Markdown editor shows the notes as readable text. Obsidian reads the front matter as
properties; because links use IDs, use **Settings → Export for Obsidian** for a copy with
`[[Title]]` links and title-based file names.
