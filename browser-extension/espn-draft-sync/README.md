# ESPN Draft Sync Chrome Extension

This is the active unpacked Chrome extension for the local Fantasy Football Draft Assistant.

It reads ESPN's complete Pick History from the draft-room DOM, reconciles the full draft after every change, and forwards snapshots to the local SvelteKit receiver. It also imports ESPN's authenticated full player pool before pick 1 so current injuries, projections, rank, ADP, positions, and teams are available without opening player cards. Normal synchronization does not require Chrome debugger attachment. Optional network diagnostics exist only for troubleshooting.

Recommendation cards copy a player name to the clipboard for quick paste into ESPN search. Player-card details such as an estimated return date are captured as an additional injury overlay when available.

## Load unpacked

1. Start the main application with `pnpm dev` from the repository root.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select this directory.
4. Open the extension popup.
5. Set the receiver to `http://127.0.0.1:5173/api/sync/espn/events`.
6. Enter the same `ESPN_SYNC_TOKEN` configured in the app's `.env` and save.
7. Open an ESPN mock draft or live draft. No Attach button is required.

The popup must show **Build 0.5.0 · recommendation audit**. If it shows an older version, click Reload on the unpacked extension (or remove and load this directory again); do not load the retired standalone `ffDraftSync` checkout.

The popup reports the queued observation count and latest delivery result. **Send queued now** retries retained observations. **Export capture** creates a diagnostic JSON file without requiring the local receiver.

## Test

```powershell
npm test
```

## Included runtime files

- `dom-recorder.js` — observes and snapshots ESPN Pick History
- `service-worker.js` — queues, batches, and delivers observations
- `parsers.js` — optional network diagnostic parsers
- `popup.*` — local receiver settings and diagnostics UI
- `manifest.json` — Chrome Manifest V3 configuration
