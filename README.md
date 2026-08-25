# Fantasy Football Draft Assistant

Local-first fantasy football tooling focused first on reliable ESPN live-draft synchronization and league-aware pick recommendations. This repository is under active development; the roadmap below distinguishes working features from planned ones.

## Current status

### Working

- Automatic ESPN draft capture from the complete Pick History in the draft-room DOM
- Pre-draft initialization with team, slot, full player pool, and recommendations before pick 1
- Safe live-draft snapshot reset between mocks without deleting player intelligence or league data
- Confirmed one-click draft requests from recommendation cards through the bundled extension (exact visible-player verification)
- Ten-second authoritative extension heartbeat to distinguish a quiet draft from a disconnected sync
- Live positional-run detection and recent room-demand trends, used as a bounded recommendation signal
- No manual debugger attachment required for normal synchronization
- Persistent extension delivery queue with manual retry and exportable diagnostic captures
- Local SvelteKit receiver protected by a pairing token
- SQLite storage for observations, live draft state, leagues, teams, picks, player identities, value sources, news, and depth-chart relationships
- AES-256-GCM encryption for stored ESPN credentials with a separate local key
- Live dashboard with receiver health, recent picks, team rosters, draft completion, available-player search, and identity diagnostics
- Automatic ESPN user-team, draft-slot, roster-construction, and next-turn detection
- ESPN and Sleeper league-history import foundations
- Local database backup and restore endpoints
- Manual daily refresh of current player positions, teams, injury/practice status, depth-chart order, and add/drop trends through Sleeper's official read-only API
- Daily 2026 PPR redraft expert-consensus rankings, uncertainty, movement, and derived positional tiers from DynastyProcess's latest-only open dataset
- Recent league-size-specific PPR redraft ADP with earliest/latest pick ranges and draft sample sizes from MyFantasyLeague's official API
- Versioned projection-set imports with source provenance, optional floors/ceilings, games, and stat-category fields
- Multi-source trimmed projection ensemble with source-count and disagreement diagnostics
- ESPN lineup-slot normalization and flex-aware projected points above replacement
- State-keyed, reproducible recommendation runs tied to versioned model/input manifests
- Guarded deterministic two-turn draft rollouts that activate only when projection coverage is sufficient
- Automatic completed-draft archive plus recommendation-run audit in Draft History
- Automatic freshness coordinator with per-provider health, last-good fallback, and concurrent refresh suppression
- Watched projection folder at `.data/imports/projections` using `source--season--format.csv`; successful files are archived after import
- ESPN displayed rank and room-scored FPTS capture for platform-aware availability estimates

### Foundation present, data feeds not connected yet

- Automatic additional projection feeds (multiple manual CSV sources are supported now)
- Injury and breaking-news ingestion
- Depth-chart and handcuff relationships
- Calibrated ESPN-specific per-pick selection hazards; current survival probabilities use a bounded ADP model
- Broader stat-category coverage for unusual custom ESPN rules; recognized offensive stat fields are already rescored with imported league rules, while unsupported categories retain the source total

### Planned

1. Import additional current projections, richer injury news, depth charts, handcuffs, and opportunity data into the normalized player-intelligence tables.
2. Calibrate projection weights and ESPN selection hazards using frozen historical snapshots and out-of-sample backtests.
3. Complete the ESPN league-import experience and validate custom scoring and lineup configurations.
4. Add Sleeper live-draft synchronization after the ESPN workflow is stable.
5. Build a weekly start/sit assistant using projections, matchups, injuries, and league rosters.
6. Add scheduled local backups and a restore interface.

Auction drafts and hosted multi-user operation are not currently supported.

## Repository layout

- `src/` — SvelteKit application, local APIs, draft-state reducer, and SQLite repositories
- `scripts/` — capture replay and local database verification tools
- `browser-extension/espn-draft-sync/` — unpacked Chrome extension used on ESPN draft pages
- `.data/` — ignored local database, encrypted credential key, and backups

## Requirements

- Node.js 20
- pnpm
- Google Chrome or another Chromium browser for the unpacked extension

## Local setup

```powershell
pnpm install
Copy-Item .env.example .env
```

Generate a long pairing token:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Set the generated value as `ESPN_SYNC_TOKEN` in `.env`, then start the application:

```powershell
pnpm dev
```

The development server listens at `http://127.0.0.1:5173` so the Chrome extension can reach it reliably.

## Load the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `browser-extension/espn-draft-sync` from this repository.
   The popup must show **Build 0.4.4 · recommendation audit**. An older build means Chrome is pointed at the retired standalone checkout.
5. Open the extension popup, set the receiver to `http://127.0.0.1:5173/api/sync/espn/events`, enter the same pairing token, and save.

Normal draft synchronization starts automatically on ESPN draft and mock-draft pages. Network diagnostics are optional and may display Chrome's debugger notification; they are not needed for ordinary draft capture.

For moving development to another computer, including the optional local database and credential-key transfer, see `TRAVEL_SETUP.md`. Codex-specific project context and current next steps are maintained in `AGENTS.md`.

## Development checks

```powershell
pnpm test:sync
pnpm test:db-security
pnpm check
pnpm build
```

Extension parser tests:

```powershell
cd browser-extension/espn-draft-sync
npm test
```

Captured draft JSON can be replayed into the reducer with `pnpm replay:sync -- <capture-file>`.

## Local data and credentials

The SQLite database is stored at `.data/fantasy-football.sqlite` and is ignored by Git. SQLite uses WAL mode.

ESPN credentials are encrypted before being written to SQLite. The randomly generated master key is stored separately at `.data/credential.key`, which is also ignored. Database backups intentionally exclude this key. Keep a secure copy if a backup must be restored on another computer; losing it requires re-entering ESPN credentials but does not affect non-secret draft data.

Backup APIs:

- `GET /api/local/backups` — list backups
- `POST /api/local/backups` — create a consistent backup
- `PUT /api/local/backups` — restore a selected backup

## Known limitations

- ESPN does not provide a supported public live-draft API. Synchronization therefore depends on the draft room's Pick History DOM, with raw captures retained for diagnosis.
- Exact scoring and lineup settings require league import; live draft URLs alone identify the league and user team but do not contain full settings.
- The bundled cross-provider identity catalog is useful for ID reconciliation but is not itself a current ranking or projection source.
- Some 2026 rookies and defenses need newer provider identity mappings.
- The league page still has several non-blocking accessibility warnings.

## Data-source attribution

- Current player metadata and add/drop trends: [Sleeper's official read-only API](https://docs.sleeper.com/). Sleeper recommends refreshing the full player dataset no more than once per day.
- Planned open injury, depth-chart, and statistical inputs: [nflverse](https://github.com/nflverse/nflverse-data), subject to each dataset's published attribution and license requirements.
- PPR expert consensus rankings: FantasyPros ECR distributed through [DynastyProcess open data](https://github.com/dynastyprocess/data). Derived tiers are local calculations based on gaps between adjacent positional ECR values.
- Recent ADP: [MyFantasyLeague's official developer API](https://api.myfantasyleague.com/2026/api_info?STATE=details), filtered to PPR redraft leagues with mocks excluded and stored separately by league size.

## Safety and scope

This is a personal local assistant, not a guarantee of fantasy results. Recommendations will remain explainable and source-attributed as data feeds are added.
