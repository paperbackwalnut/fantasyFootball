# Codex Project Handoff

This repository is a personal, local-first fantasy-football assistant. Read `README.md` and `TRAVEL_SETUP.md` before changing code.

## Product priorities

1. Reliable ESPN live-draft synchronization, including pre-draft state and every pick.
2. Explainable, league-aware live pick recommendations using current projections, ADP, roster construction, injuries/news, positional scarcity, room behavior, and next-turn availability.
3. Fast clipboard-assisted ESPN player selection from recommendation cards.
4. Draft archive and postmortem tools.
5. League import, then weekly start/sit. Sleeper live drafting comes after ESPN is stable.

Do not reintroduce Supabase. Runtime state belongs in local SQLite with backup/restore support. This is a personal tool, not a hosted multi-user service.

## Current architecture

- SvelteKit app and local receiver: `src/`
- SQLite and encrypted credential storage: `src/lib/server/`
- ESPN state reducer and recommendation engine: `src/lib/server/espn-sync/` and recommendation modules under `src/lib/server/`
- Bundled unpacked Chrome extension: `browser-extension/espn-draft-sync/`
- Local runtime data: `.data/` (ignored by Git)
- Current extension build: **0.4.8**
- Expected receiver: `http://127.0.0.1:5173/api/sync/espn/events`

The retired standalone extension checkout at `C:\Users\chris\ffDraftSync` is obsolete. Do not edit or load it. The canonical extension is inside this repository.

## Recent work and present debugging state

Recent commits added reproducible league-aware recommendations, automated projection/data imports, missing-projection guards, inferred on-clock state, ESPN drafting confirmation, pre-draft snapshots, listener/command diagnostics, and safe Chrome context shutdown handling.

The immediate validation target is extension build 0.4.8:

1. Start the app on port 5173.
2. Load `browser-extension/espn-draft-sync` unpacked in Chrome.
3. Set the extension endpoint and the same pairing token as `.env`.
4. Enter an ESPN mock lobby and then a draft.
5. Verify the popup reports `pageListener: online`, a recent `commandPollAt`, and `commandPollError: null`.
6. Verify `/draft` initializes before pick 1, advances on every pick, recognizes the user's turns, and copies recommendation names for ESPN search.

When an extension error is reported, first confirm the popup build number and whether Chrome has more than one copy installed. Reloading an unpacked extension invalidates old content scripts; clear errors only after the new build is loaded and the ESPN page is refreshed.

## Recommendation-engine cautions

- Never coerce missing projections to zero. `Number(null)` is zero and previously caused bogus 0.0 VOR and rollout values.
- Rollouts must stay disabled when projection coverage is inadequate.
- Roster/position constraints must prevent repeated late-round QB, TE, K, or DST recommendations.
- Room runs are a bounded signal, not a reason to blindly chase a position.
- Preserve the exact input/model manifest for every recommendation run so draft postmortems are reproducible.
- Prefer current, source-attributed data and retain last-good snapshots when a provider fails.

## Working conventions

- Preserve user data and unrelated working-tree changes.
- Do not commit `.env`, `.data/`, pairing tokens, ESPN cookies, credential keys, or captures containing secrets.
- Keep changes on `main` unless the user requests otherwise; the owner permits direct commits and pushes without PRs.
- Update `README.md` when setup, status, extension version, or roadmap changes.
- Run proportionate checks before committing. The normal suite is:

```powershell
pnpm test:sync
pnpm check
pnpm build
cd browser-extension/espn-draft-sync
npm test
```

The existing league-import page has known non-blocking accessibility warnings. Do not mistake those warnings for failures in unrelated work.

## Suggested next work

After extension 0.4.8 passes the short mock test:

1. Run a complete mock while preserving command reports and recommendation runs.
2. Perform a postmortem comparing recommendations, selections, available alternatives, roster construction, and command failures.
3. Improve projection coverage and current injury/news/depth-chart feeds.
4. Calibrate the two-turn survival model using archived ESPN mocks.
5. Make extension-side pick controls/status useful during drafts without duplicating the recommendation engine.
