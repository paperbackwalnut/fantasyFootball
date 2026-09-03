import { createHash, randomUUID } from 'node:crypto';
import { getDatabase } from '$lib/server/db/database';
import { ensurePlayerCatalog } from '$lib/server/player-intelligence';
import { normalizePlayerName } from '$lib/server/espn-sync/draft-state.js';
import { parseCsv } from './csv.js';

const SOURCE = 'nflverse-injuries';
const LAST_AVAILABLE_SEASON = 2024;

export async function refreshHistoricalInjuries() {
	ensurePlayerCatalog();
	const db = getDatabase();
	const cached = db.prepare("SELECT value_json,expires_at FROM provider_cache WHERE key='player-source:injury-history'").get() as any;
	if (cached?.expires_at && new Date(cached.expires_at) > new Date()) return { ...JSON.parse(cached.value_json), cached: true };
	const playerRows = db.prepare('SELECT id,normalized_name,nfl_team,data_json FROM players').all() as any[];
	const byGsis = new Map<string, string>();
	const byNameTeam = new Map<string, string[]>();
	for (const player of playerRows) {
		const raw = safeJson(player.data_json);
		const gsis = String(raw?.gsis_id ?? '').trim();
		if (gsis) byGsis.set(gsis, player.id);
		const key = `${player.normalized_name}:${normalizeTeam(player.nfl_team)}`;
		const values = byNameTeam.get(key) ?? [];
		values.push(player.id);
		byNameTeam.set(key, values);
	}
	const insert = db.prepare(`INSERT INTO injury_events(id,player_id,source,source_event_key,season_year,week,observed_at,source_updated_at,status,body_part,secondary_body_part,practice_status,games_missed,confidence,data_json)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source,source_event_key) DO UPDATE SET status=excluded.status,body_part=excluded.body_part,
		secondary_body_part=excluded.secondary_body_part,practice_status=excluded.practice_status,source_updated_at=excluded.source_updated_at,data_json=excluded.data_json`);
	let imported = 0;
	let unmatched = 0;
	for (let season = 2009; season <= LAST_AVAILABLE_SEASON; season++) {
		const response = await fetch(`https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`);
		if (!response.ok) throw new Error(`nflverse injury history ${season} returned ${response.status}`);
		const rows = parseCsv(await response.text());
		db.transaction(() => {
			for (const row of rows) {
				const gsis = String(row.gsis_id ?? '').trim();
				let playerId = byGsis.get(gsis);
				if (!playerId) {
					const matches = byNameTeam.get(`${normalizePlayerName(row.full_name)}:${normalizeTeam(row.team)}`) ?? [];
					if (matches.length === 1) playerId = matches[0];
				}
				if (!playerId) { unmatched++; continue; }
				const key = createHash('sha256').update(`${season}:${row.week}:${gsis || normalizePlayerName(row.full_name)}:${row.report_primary_injury}:${row.practice_primary_injury}`).digest('hex');
				const observedAt = row.date_modified || `${season}-01-01T00:00:00Z`;
				const status = row.report_status || null;
				insert.run(randomUUID(), playerId, SOURCE, key, season, numberOrNull(row.week), observedAt, row.date_modified || null, status,
					row.report_primary_injury || row.practice_primary_injury || null, row.report_secondary_injury || row.practice_secondary_injury || null,
					row.practice_status || null, /^out$/i.test(status ?? '') ? 1 : 0, 0.8, JSON.stringify(row));
				imported++;
			}
		})();
	}
	const fetchedAt = new Date().toISOString();
	const result = { source: SOURCE, seasons: `2009-${LAST_AVAILABLE_SEASON}`, imported, unmatched, fetchedAt, currentSeasonAvailable: false };
	db.prepare(`INSERT INTO provider_cache(key,value_json,expires_at,updated_at) VALUES('player-source:injury-history',?,?,?)
		ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
		.run(JSON.stringify(result), new Date(Date.now() + 30 * 86400000).toISOString(), fetchedAt);
	return result;
}

export function historicalInjuryStatus() {
	const row = getDatabase().prepare("SELECT value_json,expires_at,updated_at FROM provider_cache WHERE key='player-source:injury-history'").get() as any;
	return row ? { ...JSON.parse(row.value_json), updatedAt: row.updated_at, expiresAt: row.expires_at, stale: !row.expires_at || new Date(row.expires_at) <= new Date() } : null;
}

function safeJson(value: unknown) { try { return value ? JSON.parse(String(value)) : null; } catch { return null; } }
function normalizeTeam(value: unknown) { return String(value ?? '').toUpperCase().replace(/^D(?=[A-Z]{2,3}$)/, ''); }
function numberOrNull(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : null; }
