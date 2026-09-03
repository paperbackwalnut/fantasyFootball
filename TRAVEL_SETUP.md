# Laptop Setup and Project Transfer

The recommended transfer has two independent parts:

- **Code and handoff instructions:** GitHub
- **Optional local history and credentials:** a private database backup and credential key

You do not need the old standalone `ffDraftSync` repository. The Chrome extension is included in this repository.

## 1. Prepare the desktop before leaving

Confirm all work is pushed:

```powershell
cd C:\Users\chris\fantasyFootball
git status
git push origin main
```

The working tree should be clean and GitHub should contain the latest commit.

If you want the laptop to include existing drafts, imported leagues, player intelligence, and recommendation audits, create a consistent database backup from the running app using the Draft History/backup interface or:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5173/api/local/backups
```

Copy the resulting file from `.data/backups/` to private storage. Also copy `.data/credential.key` if you want previously stored ESPN credentials to remain decryptable. Treat that key like a password.

Do **not** copy the live `fantasy-football.sqlite-wal` and `fantasy-football.sqlite-shm` files as a backup. Do not upload `.env`, the pairing token, or `credential.key` to GitHub.

## 2. Install prerequisites on the laptop

Install:

- Git
- Node.js 20 or newer
- pnpm
- Google Chrome

Then clone and install:

```powershell
git clone https://github.com/paperbackwalnut/fantasyFootball.git
cd fantasyFootball
pnpm install
Copy-Item .env.example .env
```

Generate a new laptop pairing token:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Paste it after `ESPN_SYNC_TOKEN=` in `.env`. A new token is safer and easier than transferring the desktop token.

Start the app:

```powershell
pnpm dev
```

Open `http://127.0.0.1:5173/draft`.

## 3. Load the bundled extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `fantasyFootball\browser-extension\espn-draft-sync`.
5. Confirm the popup says **Build 0.4.6**.
6. Set the receiver to `http://127.0.0.1:5173/api/sync/espn/events`.
7. Paste the same laptop pairing token and save.

Only one copy of **ESPN Draft Sync Recorder** should be installed.

## 4. Restore optional local data

For a clean laptop setup, skip this section; the app creates a new database automatically.

To carry existing data, stop the laptop development server first. Place the consistent backup where the app's restore interface can access it, start the app, and restore it through the local backup API/interface. Copy `credential.key` to `.data/credential.key` only if the backup contains encrypted ESPN credentials you want to reuse.

If you restore the database without the original key, draft and player data still work, but encrypted ESPN credentials must be entered again.

## 5. Give Codex the context

Open the cloned repository as the workspace and begin with:

> Read AGENTS.md, README.md, and TRAVEL_SETUP.md completely. Inspect the current git status and recent commits. Continue the ESPN extension 0.4.6 validation described in AGENTS.md. Do not use the retired ffDraftSync repository or reintroduce Supabase.

Codex should then inspect the repository rather than relying only on the prompt. Commit and push completed laptop work so it is available again on the desktop.

## Returning to the desktop

Before switching computers, commit and push from the current computer. On the other computer:

```powershell
git pull --ff-only
pnpm install
```

The database does not automatically synchronize through Git. If both computers accumulate local draft history, do not overwrite one database with the other; export/restore intentionally or designate one computer's database as authoritative.
