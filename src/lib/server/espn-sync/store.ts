import masterPlayers from '$lib/data/master_players_enriched.json';
import { getDatabase } from '$lib/server/db/database';
import { reconcileDraftState, reduceDraftSnapshot } from './draft-state.js';
import { createHash, randomUUID } from 'node:crypto';
import { buildDraftAdvice } from '$lib/server/recommendation-engine';
import { getNFLTeamName, getPositionName } from '$lib/server/draft/utils';

export type SyncObservation = { schemaVersion: number; id: string; capturedAt: string; type: string; data: unknown };
type SyncStatus = { observationCount: number; lastObservationAt: string | null; lastBatchAt: string | null; typeCounts: Record<string, number> };

export async function appendObservations(observations: SyncObservation[]) {
	const db = getDatabase();
	const previousRow = db.prepare("SELECT state_json FROM live_draft_state WHERE platform='ESPN'").get() as { state_json: string } | undefined;
	const previousState = previousRow ? JSON.parse(previousRow.state_json) : null;
	const receivedAt = new Date().toISOString();
	const insert = db.prepare('INSERT OR IGNORE INTO sync_observations(id,schema_version,captured_at,type,data_json,received_at) VALUES(?,?,?,?,?,?)');
	const saveState = db.prepare(`INSERT INTO live_draft_state(platform,updated_at,state_json) VALUES('ESPN',?,?) ON CONFLICT(platform) DO UPDATE SET updated_at=excluded.updated_at,state_json=excluded.state_json`);
	const clearState = db.prepare("DELETE FROM live_draft_state WHERE platform='ESPN'");
	let latestState: any = null;
	db.transaction(() => {
		for (const observation of observations) {
			insert.run(observation.id, observation.schemaVersion, observation.capturedAt, observation.type, JSON.stringify(observation.data ?? null), receivedAt);
			if (observation.type === 'espn_player_pool') recordEspnPlayerPool(observation.data, observation.capturedAt);
		}
		const authoritative = [...observations].reverse().find(isAuthoritativeSnapshot);
		if (authoritative) {
			const incoming = authoritative.data as Record<string, any>;
			recordEspnInjuries(incoming.injuryObservations, authoritative.capturedAt);
			const reduced = reduceDraftSnapshot({ ...incoming,
				draftSlotHint: incoming.draftSlotHint ?? previousState?.draftSlotHint ?? null,
				rosterSizeHint: incoming.rosterSizeHint ?? previousState?.rosterSizeHint ?? null,
				draftKind: incoming.draftKind === 'UNKNOWN' ? previousState?.draftKind ?? 'UNKNOWN' : incoming.draftKind,
				roomLabel: incoming.roomLabel ?? previousState?.roomLabel ?? null }, masterPlayers, authoritative.capturedAt);
			const state = reconcileDraftState(previousState, reduced);
			latestState = state;
			saveState.run(authoritative.capturedAt, JSON.stringify(state));
			if (state.completed) {
				archiveCompletedDraft(state);
				clearState.run();
			}
		}
	})();
	if (latestState && !latestState.completed) {
		try { buildDraftAdvice(latestState); }
		catch (cause) {
			const message = cause instanceof Error ? cause.message : 'Unknown recommendation error';
			db.prepare(`INSERT INTO provider_cache(key,value_json,updated_at) VALUES('recommendation:last-error',?,?)
				ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`).run(JSON.stringify({ message }), new Date().toISOString());
		}
	}
}

function recordEspnPlayerPool(data: unknown, capturedAt: string) {
	if (!data || typeof data !== 'object') return;
	const payload = data as any;
	if (!Array.isArray(payload.players) || !Number.isInteger(Number(payload.seasonYear))) return;
	const seasonYear = Number(payload.seasonYear);
	const db = getDatabase();
	const byEspn = db.prepare('SELECT id FROM players WHERE espn_id=?');
	const byName = db.prepare('SELECT id FROM players WHERE normalized_name=? ORDER BY active DESC LIMIT 2');
	const insertPlayer = db.prepare(`INSERT INTO players(id,full_name,normalized_name,position,nfl_team,active,espn_id,data_json,updated_at)
		VALUES(?,?,?,?,?,?,?,?,?)`);
	const updatePlayer = db.prepare(`UPDATE players SET full_name=?,normalized_name=?,position=?,nfl_team=?,active=?,espn_id=?,data_json=?,updated_at=? WHERE id=?`);
	const upsertStatus = db.prepare(`INSERT INTO player_status(player_id,source,status,injury_status,news_updated_at,data_json,fetched_at)
		VALUES(?,?,?,?,?,?,?) ON CONFLICT(player_id) DO UPDATE SET source=excluded.source,status=excluded.status,
		injury_status=excluded.injury_status,news_updated_at=excluded.news_updated_at,data_json=excluded.data_json,fetched_at=excluded.fetched_at`);
	const upsertValue = db.prepare(`INSERT INTO player_values(player_id,season_year,scoring_format,source,overall_rank,adp,projected_points,value_json,fetched_at)
		VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(player_id,season_year,scoring_format,source) DO UPDATE SET overall_rank=excluded.overall_rank,
		adp=excluded.adp,projected_points=excluded.projected_points,value_json=excluded.value_json,fetched_at=excluded.fetched_at`);
	const upsertInjury = db.prepare(`INSERT INTO injury_events(id,player_id,source,source_event_key,season_year,observed_at,source_updated_at,status,confidence,data_json)
		VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source,source_event_key) DO UPDATE SET data_json=excluded.data_json`);
	let imported = 0;
	for (const item of payload.players) {
		if (!item?.espnPlayerId || !item?.name) continue;
		const normalized = normalizeName(item.name);
		let row = byEspn.get(String(item.espnPlayerId)) as { id: string } | undefined;
		if (!row) {
			const matches = byName.all(normalized) as { id: string }[];
			if (matches.length === 1) row = matches[0];
		}
		const id = row?.id ?? randomUUID();
		const position = getPositionName(Number(item.positionId));
		const nflTeam = getNFLTeamName(Number(item.proTeamId));
		const raw = JSON.stringify(item);
		if (row) updatePlayer.run(item.name, normalized, position, nflTeam, Number(item.active !== false), String(item.espnPlayerId), raw, capturedAt, id);
		else insertPlayer.run(id, item.name, normalized, position, nflTeam, Number(item.active !== false), String(item.espnPlayerId), raw, capturedAt);
		upsertStatus.run(id, 'espn-player-pool', item.active === false ? 'Inactive' : 'Active', item.injuryStatus ?? null, item.lastNewsAt ?? null, raw, capturedAt);
		if (item.rank != null || item.adp != null || item.projectedPoints != null) {
			upsertValue.run(id, seasonYear, 'PPR', 'espn-draft-pool', item.rank ?? null, item.adp ?? null, item.projectedPoints ?? null, raw, capturedAt);
		}
		const status = String(item.injuryStatus ?? (item.injured ? 'INJURED' : 'ACTIVE'));
		const eventKey = createHash('sha256').update(`${id}:${seasonYear}:${status}:${item.lastNewsAt ?? ''}`).digest('hex');
		upsertInjury.run(randomUUID(), id, 'espn-player-pool', eventKey, seasonYear, capturedAt, item.lastNewsAt ?? null, status, item.injured ? 0.85 : 0.75, raw);
		imported++;
	}
	db.prepare(`INSERT INTO provider_cache(key,value_json,expires_at,updated_at) VALUES('player-source:espn-draft-pool',?,?,?)
		ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
		.run(JSON.stringify({ leagueId: payload.leagueId ?? null, seasonYear, players: payload.players.length, imported }), new Date(Date.now() + 15 * 60 * 1000).toISOString(), capturedAt);
}

function recordEspnInjuries(observations: unknown, capturedAt: string) {
	if (!Array.isArray(observations)) return;
	const db = getDatabase();
	const byEspn = db.prepare('SELECT id FROM players WHERE espn_id=?');
	const byName = db.prepare('SELECT id FROM players WHERE normalized_name=? ORDER BY active DESC LIMIT 2');
	const insert = db.prepare(`INSERT INTO injury_events(id,player_id,source,source_event_key,season_year,observed_at,source_updated_at,status,estimated_return_date,confidence,data_json)
		VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source,source_event_key) DO UPDATE SET data_json=excluded.data_json`);
	for (const item of observations) {
		if (!item || typeof item !== 'object') continue;
		const injury = item as any;
		let player = injury.espnPlayerId ? byEspn.get(String(injury.espnPlayerId)) as { id: string } | undefined : undefined;
		if (!player && injury.name) {
			const matches = byName.all(normalizeName(injury.name)) as { id: string }[];
			if (matches.length === 1) player = matches[0];
		}
		if (!player) continue;
		const estimatedReturn = parseEspnDate(injury.estimatedReturnDate);
		const seasonYear = estimatedReturn ? new Date(estimatedReturn).getUTCFullYear() : new Date(capturedAt).getUTCFullYear();
		const key = createHash('sha256').update(`${player.id}:${injury.injuryStatus ?? ''}:${estimatedReturn ?? ''}`).digest('hex');
		insert.run(randomUUID(), player.id, 'espn-draft-room', key, seasonYear, capturedAt, capturedAt, injury.injuryStatus ?? null, estimatedReturn, 0.9, JSON.stringify(injury));
	}
}

function normalizeName(value: unknown) {
	return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/\b(?:jr|sr|ii|iii|iv|v)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function parseEspnDate(value: unknown) {
	const match = String(value ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (!match) return null;
	return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
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
	if (Number(state.schemaVersion ?? 1) >= 2) {
		if (state.completed) archiveCompletedDraft(state);
		return state;
	}
	const latest = db.prepare("SELECT captured_at, data_json FROM sync_observations WHERE type='dom_snapshot' ORDER BY captured_at DESC LIMIT 1").get() as { captured_at: string; data_json: string } | undefined;
	if (!latest) return state;
	const upgraded = reduceDraftSnapshot(JSON.parse(latest.data_json), masterPlayers, latest.captured_at);
	db.prepare("UPDATE live_draft_state SET updated_at=?, state_json=? WHERE platform='ESPN'").run(latest.captured_at, JSON.stringify(upgraded));
	return upgraded;
}

export function archiveCompletedDraft(state: any) {
	if (!state?.completed || !Array.isArray(state.picks) || !state.picks.length) return { archived: false };
	const url = (() => { try { return state.draftUrl ? new URL(state.draftUrl) : null; } catch { return null; } })();
	const externalId = url?.searchParams.get('leagueId') ?? null;
	const seasonYear = Number(url?.searchParams.get('seasonId')) || new Date(state.updatedAt).getFullYear();
	const userTeamId = url?.searchParams.get('teamId') ?? null;
	const teams = Array.isArray(state.teams) ? state.teams : [];
	const firstRound = state.picks.filter((pick: any) => pick.pickNumber <= teams.length);
	const draftSlot = firstRound.findIndex((pick: any) => String(pick.teamId) === String(userTeamId)) + 1 || state.draftSlotHint || null;
	const fingerprint = JSON.stringify(state.picks.map((pick: any) => [pick.pickNumber, pick.teamId, pick.playerId ?? pick.playerName]));
	const id = createHash('sha256').update(`ESPN:${externalId ?? ''}:${seasonYear}:${fingerprint}`).digest('hex');
	const kind = ['MOCK', 'LEAGUE'].includes(state.draftKind) ? state.draftKind : 'UNKNOWN';
	const name = state.roomLabel || `${kind === 'MOCK' ? 'ESPN Mock Draft' : 'ESPN Draft'} · ${new Date(state.updatedAt).toLocaleDateString('en-US')}`;
	const result = getDatabase().prepare(`INSERT OR IGNORE INTO draft_sessions(id,platform,external_id,season_year,kind,name,user_team_id,team_count,draft_slot,completed_at,state_json,created_at)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, 'ESPN', externalId, seasonYear, kind, name, userTeamId, teams.length, draftSlot, state.updatedAt, JSON.stringify(state), new Date().toISOString());
	return { archived: result.changes > 0, id };
}

export function clearCurrentDraftState() {
	const db = getDatabase();
	const row = db.prepare("SELECT state_json FROM live_draft_state WHERE platform='ESPN'").get() as { state_json: string } | undefined;
	const archive = row ? archiveCompletedDraft(JSON.parse(row.state_json)) : { archived: false };
	const result = db.prepare("DELETE FROM live_draft_state WHERE platform='ESPN'").run();
	return { cleared: result.changes > 0, archived: archive.archived };
}

export function saveRecommendationSnapshot(state: any, context: any, recommendations: any[]) {
	if (!state?.userIsOnTheClock || state.completed || !recommendations.length) return { saved: false };
	const url = (() => { try { return state.draftUrl ? new URL(state.draftUrl) : null; } catch { return null; } })();
	const externalId = url?.searchParams.get('leagueId') ?? null;
	const seasonYear = Number(url?.searchParams.get('seasonId')) || new Date(state.updatedAt).getFullYear();
	const userTeamId = context?.userTeamId ?? url?.searchParams.get('teamId') ?? null;
	const currentPick = Number(context?.currentPick ?? state.currentPick);
	const stateUpdatedAt = String(state.updatedAt ?? new Date().toISOString());
	const id = createHash('sha256').update(`ESPN:${externalId ?? ''}:${seasonYear}:${userTeamId ?? ''}:${currentPick}:${stateUpdatedAt}`).digest('hex');
	const result = getDatabase().prepare(`INSERT OR IGNORE INTO recommendation_snapshots(id,platform,external_id,season_year,user_team_id,current_pick,state_updated_at,context_json,recommendations_json,created_at)
		VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, 'ESPN', externalId, seasonYear, userTeamId, currentPick, stateUpdatedAt, JSON.stringify(context), JSON.stringify(recommendations), new Date().toISOString());
	return { saved: result.changes > 0, id };
}

function isAuthoritativeSnapshot(observation: SyncObservation) {
	if (observation.type !== 'dom_snapshot' || !observation.data || typeof observation.data !== 'object') return false;
	const data = observation.data as { source?: unknown; historyPicks?: unknown };
	return data.source === 'espn-pick-history' && Array.isArray(data.historyPicks);
}
