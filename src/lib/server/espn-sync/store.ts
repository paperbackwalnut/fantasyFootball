import masterPlayers from '$lib/data/master_players_enriched.json';
import { getDatabase } from '$lib/server/db/database';
import { reduceDraftSnapshot } from './draft-state.js';

export type SyncObservation = { schemaVersion: number; id: string; capturedAt: string; type: string; data: unknown };
type SyncStatus = { observationCount: number; lastObservationAt: string | null; lastBatchAt: string | null; typeCounts: Record<string, number> };

export async function appendObservations(observations: SyncObservation[]) {
	const db = getDatabase();
	const receivedAt = new Date().toISOString();
	const insert = db.prepare('INSERT OR IGNORE INTO sync_observations(id,schema_version,captured_at,type,data_json,received_at) VALUES(?,?,?,?,?,?)');
	const saveState = db.prepare(`INSERT INTO live_draft_state(platform,updated_at,state_json) VALUES('ESPN',?,?) ON CONFLICT(platform) DO UPDATE SET updated_at=excluded.updated_at,state_json=excluded.state_json`);
	db.transaction(() => {
		for (const observation of observations) insert.run(observation.id, observation.schemaVersion, observation.capturedAt, observation.type, JSON.stringify(observation.data ?? null), receivedAt);
		const authoritative = [...observations].reverse().find(isAuthoritativeSnapshot);
		if (authoritative) {
			const state = reduceDraftSnapshot(authoritative.data as Record<string, unknown>, masterPlayers, authoritative.capturedAt);
			saveState.run(authoritative.capturedAt, JSON.stringify(state));
		}
	})();
}

export async function readSyncStatus(): Promise<SyncStatus> {
	const db = getDatabase();
	const summary = db.prepare('SELECT COUNT(*) count, MAX(captured_at) lastObservationAt, MAX(received_at) lastBatchAt FROM sync_observations').get() as any;
	const counts = db.prepare('SELECT type, COUNT(*) count FROM sync_observations GROUP BY type').all() as any[];
	return { observationCount: summary.count, lastObservationAt: summary.lastObservationAt, lastBatchAt: summary.lastBatchAt, typeCounts: Object.fromEntries(counts.map((row) => [row.type, row.count])) };
}

export async function readCurrentDraftState(): Promise<unknown | null> {
	const db = getDatabase();
	const row = db.prepare("SELECT state_json FROM live_draft_state WHERE platform='ESPN'").get() as { state_json: string } | undefined;
	if (!row) return null;
	const state = JSON.parse(row.state_json);
	if (Number(state.schemaVersion ?? 1) >= 2) return state;
	const latest = db.prepare("SELECT captured_at, data_json FROM sync_observations WHERE type='dom_snapshot' ORDER BY captured_at DESC LIMIT 1").get() as { captured_at: string; data_json: string } | undefined;
	if (!latest) return state;
	const upgraded = reduceDraftSnapshot(JSON.parse(latest.data_json), masterPlayers, latest.captured_at);
	db.prepare("UPDATE live_draft_state SET updated_at=?, state_json=? WHERE platform='ESPN'").run(latest.captured_at, JSON.stringify(upgraded));
	return upgraded;
}

export function clearCurrentDraftState() {
	const result = getDatabase().prepare("DELETE FROM live_draft_state WHERE platform='ESPN'").run();
	return { cleared: result.changes > 0 };
}

function isAuthoritativeSnapshot(observation: SyncObservation) {
	if (observation.type !== 'dom_snapshot' || !observation.data || typeof observation.data !== 'object') return false;
	const data = observation.data as { source?: unknown; historyPicks?: unknown };
	return data.source === 'espn-pick-history' && Array.isArray(data.historyPicks);
}
