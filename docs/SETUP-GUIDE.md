# Setup guide

This gets Slip-box running on your iPhone (and any computer) with your notes stored privately
and backed up automatically. No coding is needed. Allow about 15 minutes.

You will do four things:

1. Turn on the app's web address (once).
2. Create a private repository to hold your notes.
3. Create an access token so the app may save there.
4. Open the app on your iPhone, connect, and add it to your home screen.

> **Just want to look around first?** Open the app and choose **Try with sample notes**.
> Nothing is uploaded in that mode.

---

## 1. Turn on the app's web address (once)

The app's code lives in the `NanoLlama/zettelkasten` repository. GitHub Pages publishes it as a website.

1. On github.com, open **NanoLlama/zettelkasten** → **Settings** → **Pages** (left menu).
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Make sure the latest code is on the `main` branch (merge the pull request if there is one).
   Within a minute or two the **Actions** tab shows a green *Publish app* run.
4. Your app is now at **https://nanollama.github.io/zettelkasten/**

The app repository contains **no notes**. It is fine for it to be public.

## 2. Create a private repository for your notes

1. On github.com, click **+** (top right) → **New repository**.
2. **Repository name:** for example `my-notes`.
3. Choose **Private**. This matters: a public repository can be read by anyone.
4. Leave everything else as it is and click **Create repository**.

## 3. Create an access token

The token lets the app read and save files in that one repository, and start backups.

1. On github.com, click your profile picture → **Settings** → **Developer settings** (bottom of the left menu)
   → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Token name:** `Slip-box`.
3. **Expiration:** the longest offered (up to a year). Put a reminder in your calendar to renew it.
4. **Repository access:** **Only select repositories** → choose `my-notes`.
5. **Permissions → Repository permissions**, set each of these to **Read and write**:
   - **Contents** (save notes)
   - **Actions** (run *Back up now* and *Restore*)
   - **Workflows** (install the backup automation)

   (*Metadata: Read-only* is added automatically.)
6. Click **Generate token** and **copy** it (it starts with `github_pat_`). GitHub shows it only once.

## 4. Install on your iPhone, then connect

Do these in this order. An app added to the Home Screen keeps its own storage, separate from
Safari, so a connection made in Safari does not carry over to the icon.

1. Open **Safari** and go to **https://nanollama.github.io/zettelkasten/**
2. Tap the **Share** button (square with an arrow) → **Add to Home Screen** → **Add**.
3. Close Safari and open **Slip-box from its new icon**.
4. Tap **Connect my vault**. **Repository:** `your-github-name/my-notes`. **Access token:** paste the token.
   Tick *Also add the sample notes* if you'd like examples (you can delete them later).
5. Tap **Connect**. The app checks the repository is private and sets up the vault and backups.

It stays connected from then on, offline included. To connect another device (iPad, laptop) without
looking up the token again: in the connected app open **Settings → Copy connection code**, send it
to yourself privately, and paste it into either box on the other device's Connect screen.

> **Tip:** with the app open, turn your phone sideways in **Review** for the two-pane reading mode.

---

## Backups: what happens automatically

| What | When | Where |
|---|---|---|
| Version history of every note | every save | your repository's history (**History** on any note) |
| Verified `.zip` of all notes and attachments | every night at 2:00 your time | repository → **Releases** |
| Old archives pruned | nightly | keeps 7 daily, 4 weekly, 12 monthly |
| Trash emptied (notes deleted over 30 days ago) | nightly | (they remain inside older archives) |
| Test restore of the newest archive | weekly (Sunday) | repository → **Actions** → *Test restore* |

In the app, **Settings → Backups** shows the last backup, its size, the next run, and the archive list
with **Download** and **Restore**. Restoring takes a safety snapshot first, so it can be undone.
If a backup fails or none has succeeded for 48 hours, every screen shows a warning banner.

### A copy outside GitHub (recommended)

- **Easy:** now and then, **Settings → Export all notes** and save the file to **iCloud Drive** (Files app).
- **Automatic:** add an S3-compatible bucket (Backblaze B2, Cloudflare R2, AWS S3). In your *notes* repository:
  **Settings → Secrets and variables → Actions → New repository secret**, and add
  `ZK_S3_BUCKET`, `ZK_S3_ACCESS_KEY_ID`, `ZK_S3_SECRET_ACCESS_KEY`, and for non-AWS providers
  `ZK_S3_ENDPOINT` (e.g. `https://s3.us-west-004.backblazeb2.com`). Add `ZK_BACKUP_PASSPHRASE` to
  encrypt the copy. The nightly job then uploads each archive there too.

  To decrypt an encrypted copy on a computer:
  `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in FILE.zip.enc -out FILE.zip`

### Costs and limits

Everything above fits in GitHub's free plan for personal use: a nightly backup takes about one
minute of the 2,000 free Actions minutes a month. GitHub works best with repositories under a few
gigabytes, which suits text notes with occasional photos and PDFs. Large photos are shrunk
automatically before saving (you can turn this off in Settings).

---

## Troubleshooting

| You see | Do this |
|---|---|
| *GitHub rejected the access token* | The token expired or was deleted. Create a new one (step 3), then **Settings → Sign out** and connect again. |
| *GitHub refused to add the backup workflows* | The token lacks **Workflows: Read and write**. Edit the token's permissions on GitHub, then **Settings → Backups → Set up automatic backups**. |
| *The token is missing a permission* when tapping **Back up now** | Give the token **Actions: Read and write**. |
| A grey **Offline** label | Changes are saved on the phone and upload when you're back online. |
| A note called "… (conflict copy …)" in the inbox | The note was edited on two devices at once. Your latest edit is kept; the copy holds the other version. Merge what you need and delete the copy. |
| The Home Screen app asks to connect again | You probably connected in Safari first. Connect once inside the Home Screen app (Settings → *Copy connection code* in Safari makes this quick). If it keeps happening, check **Settings → Safari → Advanced → Website Data** isn't being cleared, and that you're not in Private Browsing. |
| Search or links look wrong | **Settings → Reindex all**. |

## Opening your notes elsewhere

Your notes are ordinary Markdown files. On a computer you can download the repository
(**Code → Download ZIP**) or use **Settings → Export for Obsidian**, then open the folder in
[Obsidian](https://obsidian.md) or any text editor.
