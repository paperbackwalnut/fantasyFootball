import { randomUUID } from 'node:crypto';
import { getDatabase } from '$lib/server/db/database';
import { normalizePlayerName } from '$lib/server/espn-sync/draft-state.js';
import { ensurePlayerCatalog } from '$lib/server/player-intelligence';
import { normalizeMflName } from './adp-utils.js';

const source = 'myfantasyleague-adp';
const allowedTeamCounts = new Set([8, 10, 12, 14, 16]);
const allowedPositions = new Set(['QB', 'RB', 'WR', 'TE', 'PK', 'Def']);

type MflPlayer = { id: string; name?: string; position?: string; team?: string; espn_id?: string | number };
type MflAdp = { id: string; rank?: string; averagePick?: string; minPick?: string; maxPick?: string; draftSelPct?: string; draftsSelectedIn?: string };

export async function refreshMflAdp(requestedTeamCount = 10) {
	ensurePlayerCatalog();
	const teamCount = allowedTeamCounts.has(requestedTeamCount) ? requestedTeamCount : 10;
	const seasonYear = new Date().getFullYear();
	const base = `https://api.myfantasyleague.com/${seasonYear}/export`;
	const adpUrl = `${base}?TYPE=adp&JSON=1&PERIOD=RECENT&FCOUNT=${teamCount}&IS_PPR=1&IS_KEEPER=N&IS_MOCK=0&CUTOFF=5`;
	const [adpResponse, playersResponse] = await Promise.all([
		fetch(adpUrl, { headers: { 'user-agent': 'fantasy-football-local' } }),
		fetch(`${base}?TYPE=players&JSON=1&DETAILS=1`, { headers: { 'user-agent': 'fantasy-football-local' } })
	]);
	if (!adpResponse.ok) throw new Error(`MFL ADP refresh returned ${adpResponse.status}`);
	if (!playersResponse.ok) throw new Error(`MFL player directory returned ${playersResponse.status}`);
	const adpPayload = (await adpResponse.json()).adp as { player?: MflAdp[]; timestamp?: string; totalDrafts?: string; totalPicks?: string };
	const directory = (await playersResponse.json()).players?.player as MflPlayer[] ?? [];
	const playerById = new Map(directory.map((player) => [String(player.id), player]));
	const rows = (adpPayload.player ?? []).filter((row) => allowedPositions.has(playerById.get(String(row.id))?.position ?? ''));
	const db = getDatabase();
	const byProvider = db.prepare("SELECT player_id id FROM provider_player_ids WHERE provider='mfl' AND provider_id=?");
	const byEspn = db.prepare('SELECT id FROM players WHERE espn_id=? ORDER BY active DESC LIMIT 2');
	const byNameTeam = db.prepare('SELECT id FROM players WHERE normalized_name=? AND (nfl_team=? OR ? IS NULL) ORDER BY active DESC LIMIT 2');
	const insertPlayer = db.prepare(`INSERT INTO players(id,full_name,normalized_name,position,nfl_team,active,data_json,updated_at) VALUES(?,?,?,?,?,?,?,?)`);
	const providerId = db.prepare(`INSERT INTO provider_player_ids(player_id,provider,provider_id,updated_at) VALUES(?,'mfl',?,?)
		ON CONFLICT(provider,provider_id) DO UPDATE SET player_id=excluded.player_id,updated_at=excluded.updated_at`);
	const clearOtherProviderId = db.prepare("DELETE FROM provider_player_ids WHERE player_id=? AND provider='mfl' AND provider_id<>?");
	const insertValue = db.prepare(`INSERT INTO player_values(player_id,season_year,scoring_format,source,overall_rank,position_rank,adp,projected_points,tier,value_json,fetched_at)
		VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(player_id,season_year,scoring_format,source) DO UPDATE SET overall_rank=excluded.overall_rank,
		adp=excluded.adp,value_json=excluded.value_json,fetched_at=excluded.fetched_at`);
	const fetchedAt = new Date().toISOString();
	const scoringFormat = `PPR_${teamCount}_TEAM`;
	let imported = 0;
	let created = 0;
	const createdPlayers: string[] = [];
	db.transaction(() => {
		db.prepare('DELETE FROM player_values WHERE season_year=? AND scoring_format=? AND source=?').run(seasonYear, scoringFormat, source);
		for (const row of rows) {
			const mfl = playerById.get(String(row.id));
			if (!mfl?.name) continue;
			let player: { id: string } | undefined;
			const name = normalizeMflName(mfl.name, mfl.position);
			const team = normalizeTeam(mfl.team);
			if (mfl.espn_id) {
				const espnMatches = byEspn.all(String(mfl.espn_id)) as { id: string }[];
				if (espnMatches.length === 1) player = espnMatches[0];
			}
			if (!player) {
				const matches = byNameTeam.all(normalizePlayerName(name), team, team) as { id: string }[];
				if (matches.length === 1) player = matches[0];
			}
			if (!player) player = byProvider.get(String(row.id)) as { id: string } | undefined;
			if (!player) {
				const id = randomUUID();
				insertPlayer.run(id, name, normalizePlayerName(name), normalizePosition(mfl.position), team, 1, JSON.stringify({ source, mfl }), fetchedAt);
				player = { id };
				created++;
				createdPlayers.push(name);
			}
			clearOtherProviderId.run(player.id, String(row.id));
			providerId.run(player.id, String(row.id), fetchedAt);
			insertValue.run(player.id, seasonYear, scoringFormat, source, number(row.rank), null, number(row.averagePick), null, null,
				JSON.stringify({ teamCount, period: 'RECENT', scoring: 'PPR', redraft: true, mocksExcluded: true, cutoffPct: 5,
					minPick: number(row.minPick), maxPick: number(row.maxPick), draftSelectionPct: number(row.draftSelPct),
					draftsSelectedIn: number(row.draftsSelectedIn), totalDrafts: number(adpPayload.totalDrafts), totalPicks: number(adpPayload.totalPicks),
					sourceUpdatedAt: adpPayload.timestamp ? new Date(Number(adpPayload.timestamp) * 1000).toISOString() : null }), fetchedAt);
			imported++;
		}
		db.prepare(`INSERT INTO provider_cache(key,value_json,expires_at,updated_at) VALUES(?,?,?,?)
			ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
			.run(`player-source:mfl-adp:${teamCount}`, JSON.stringify({ source, seasonYear, scoringFormat, teamCount, rows: rows.length, imported, created,
				totalDrafts: number(adpPayload.totalDrafts), totalPicks: number(adpPayload.totalPicks), sourceTimestamp: adpPayload.timestamp }),
				new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), fetchedAt);
		db.prepare(`DELETE FROM players WHERE data_json LIKE '%myfantasyleague-adp%'
			AND NOT EXISTS (SELECT 1 FROM provider_player_ids ids WHERE ids.player_id=players.id)
			AND NOT EXISTS (SELECT 1 FROM player_values values_row WHERE values_row.player_id=players.id)
			AND NOT EXISTS (SELECT 1 FROM player_status status_row WHERE status_row.player_id=players.id)`).run();
	})();
	return { source, seasonYear, scoringFormat, teamCount, rows: rows.length, imported, created, createdPlayers, totalDrafts: number(adpPayload.totalDrafts), totalPicks: number(adpPayload.totalPicks), fetchedAt };
}

export function mflAdpStatus(teamCount = 10) {
	const row = getDatabase().prepare('SELECT value_json,expires_at,updated_at FROM provider_cache WHERE key=?').get(`player-source:mfl-adp:${teamCount}`) as any;
	return row ? { ...JSON.parse(row.value_json), updatedAt: row.updated_at, expiresAt: row.expires_at, stale: !row.expires_at || new Date(row.expires_at) <= new Date() } : null;
}

function normalizePosition(position?: string) { return position === 'Def' ? 'DST' : position === 'PK' ? 'K' : position ?? null; }
function normalizeTeam(team?: string) {
	if (!team || team === 'FA') return null;
	return ({ JAC: 'JAX', SFO: 'SF', KCC: 'KC', NEP: 'NE', GBP: 'GB', TBB: 'TB', NOS: 'NO', LVR: 'LV' } as Record<string, string>)[team] ?? team;
}
function number(value?: string) { const parsed = Number(value); return value && Number.isFinite(parsed) ? parsed : null; }
