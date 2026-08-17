import { getDatabase } from '$lib/server/db/database';
import { normalizePlayerName } from '$lib/server/espn-sync/draft-state.js';
import { ensurePlayerCatalog } from '$lib/server/player-intelligence';
import { parseCsv } from './csv.js';

export const projectionTemplate = `player_name,team,position,projected_points,player_id\nExample Player,BUF,QB,300.5,\n`;
type ProjectionRow = Record<string, string>;

export function importProjectionCsv(csv: string, options: { source: string; seasonYear: number; scoringFormat?: string }) {
	ensurePlayerCatalog();
	const sourceName = options.source.trim();
	const scoringFormat = (options.scoringFormat || 'PPR').trim().toUpperCase();
	if (!sourceName || sourceName.length > 80) throw new Error('Projection source must be between 1 and 80 characters');
	if (!Number.isInteger(options.seasonYear) || options.seasonYear < 2020 || options.seasonYear > 2100) throw new Error('Projection season is invalid');
	const rows = parseCsv(csv) as ProjectionRow[];
	if (!rows.length) throw new Error('Projection CSV has no data rows');
	if (!('player_name' in rows[0]) || !('projected_points' in rows[0])) throw new Error('CSV must contain player_name and projected_points columns');
	const db = getDatabase();
	const byProviderId = db.prepare('SELECT id FROM players WHERE espn_id=? OR sleeper_id=? OR fantasypros_id=? LIMIT 2');
	const byNameTeam = db.prepare(`SELECT id FROM players WHERE normalized_name=? AND (? IS NULL OR nfl_team=?) AND (? IS NULL OR position=?) ORDER BY active DESC LIMIT 3`);
	const insert = db.prepare(`INSERT INTO player_values(player_id,season_year,scoring_format,source,projected_points,value_json,fetched_at)
		VALUES(?,?,?,?,?,?,?) ON CONFLICT(player_id,season_year,scoring_format,source) DO UPDATE SET projected_points=excluded.projected_points,value_json=excluded.value_json,fetched_at=excluded.fetched_at`);
	const fetchedAt = new Date().toISOString();
	let imported = 0, invalid = 0, unmatched = 0;
	const unmatchedPlayers: string[] = [];
	db.transaction(() => {
		db.prepare('DELETE FROM player_values WHERE season_year=? AND scoring_format=? AND source=?').run(options.seasonYear, scoringFormat, sourceName);
		for (const row of rows) {
			const name = row.player_name?.trim(); const points = Number(row.projected_points);
			if (!name || !Number.isFinite(points) || points < 0) { invalid++; continue; }
			const team = normalizeTeam(row.team); const position = row.position?.trim().toUpperCase() || null;
			let matches: { id: string }[] = [];
			if (row.player_id?.trim()) matches = byProviderId.all(row.player_id.trim(), row.player_id.trim(), row.player_id.trim()) as { id: string }[];
			if (matches.length !== 1) matches = byNameTeam.all(normalizePlayerName(name), team, team, position, position) as { id: string }[];
			if (matches.length !== 1) { unmatched++; if (unmatchedPlayers.length < 25) unmatchedPlayers.push(name); continue; }
			insert.run(matches[0].id, options.seasonYear, scoringFormat, sourceName, points, JSON.stringify({ playerName: name, team, position, suppliedPlayerId: row.player_id?.trim() || null }), fetchedAt);
			imported++;
		}
		db.prepare(`INSERT INTO provider_cache(key,value_json,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`)
			.run(`player-source:projections:${options.seasonYear}:${scoringFormat}`, JSON.stringify({ source: sourceName, seasonYear: options.seasonYear, scoringFormat, rows: rows.length, imported, unmatched, invalid }), fetchedAt);
	})();
	return { source: sourceName, seasonYear: options.seasonYear, scoringFormat, rows: rows.length, imported, unmatched, invalid, unmatchedPlayers, fetchedAt };
}

export function projectionStatus(seasonYear: number, scoringFormat = 'PPR') {
	const row = getDatabase().prepare('SELECT value_json,updated_at FROM provider_cache WHERE key=?').get(`player-source:projections:${seasonYear}:${scoringFormat}`) as any;
	return row ? { ...JSON.parse(row.value_json), updatedAt: row.updated_at } : null;
}

function normalizeTeam(value?: string) {
	const team = value?.trim().toUpperCase();
	if (!team || team === 'FA' || team === 'N/A') return null;
	return team === 'JAC' ? 'JAX' : team;
}
