import masterPlayers from '$lib/data/master_players_enriched.json';
import { getDatabase } from '$lib/server/db/database';
import { normalizePlayerName } from '$lib/server/espn-sync/draft-state.js';

type MasterPlayer = {
	id: string; full_name?: string; active?: string | boolean; espn_id?: string; sleeper_id?: string;
	fantasypros_id?: string; team_abbr?: string; bye_week?: number | null; default_position_id?: string | number;
};

const fantasyPositions: Record<string, string> = { '1': 'QB', '2': 'RB', '3': 'WR', '4': 'TE', '5': 'K', '16': 'DST' };
let seeded = false;

export function ensurePlayerCatalog() {
	if (seeded) return;
	const db = getDatabase();
	const count = (db.prepare('SELECT COUNT(*) count FROM players').get() as { count: number }).count;
	if (count < masterPlayers.length) {
		const now = new Date().toISOString();
		const insert = db.prepare(`INSERT INTO players(id,full_name,normalized_name,position,nfl_team,bye_week,active,espn_id,sleeper_id,fantasypros_id,data_json,updated_at)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name,normalized_name=excluded.normalized_name,
			nfl_team=excluded.nfl_team,bye_week=excluded.bye_week,active=excluded.active,espn_id=excluded.espn_id,sleeper_id=excluded.sleeper_id,
			fantasypros_id=excluded.fantasypros_id,updated_at=excluded.updated_at`);
		db.transaction(() => {
			for (const raw of masterPlayers as MasterPlayer[]) {
				if (!raw.id || !raw.full_name) continue;
				insert.run(raw.id, raw.full_name, normalizePlayerName(raw.full_name), fantasyPositions[String(raw.default_position_id ?? '')] ?? null,
					raw.team_abbr || null, raw.bye_week ?? null, Number(raw.active === true || raw.active === 'true'), raw.espn_id || null,
					raw.sleeper_id || null, raw.fantasypros_id || null, null, now);
			}
		})();
	}
	seeded = true;
}

export function learnDraftedPlayerPositions(picks: Array<{ playerId?: string | null; position?: string | null; nflTeam?: string | null }>) {
	ensurePlayerCatalog();
	const update = getDatabase().prepare(`UPDATE players SET position=COALESCE(?,position), nfl_team=COALESCE(?,nfl_team), updated_at=? WHERE espn_id=?`);
	const now = new Date().toISOString();
	getDatabase().transaction(() => {
		for (const pick of picks) if (pick.playerId) update.run(pick.position ?? null, pick.nflTeam ?? null, now, String(pick.playerId));
	})();
}

export function intelligenceSummary(seasonYear: number) {
	ensurePlayerCatalog();
	const db = getDatabase();
	const catalog = db.prepare(`SELECT COUNT(*) total,
		SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) active,
		SUM(CASE WHEN position IS NOT NULL THEN 1 ELSE 0 END) positioned,
		SUM(CASE WHEN bye_week IS NOT NULL THEN 1 ELSE 0 END) withBye FROM players`).get() as any;
	const values = db.prepare('SELECT source, COUNT(*) count, MAX(fetched_at) updatedAt FROM player_values WHERE season_year=? GROUP BY source').all(seasonYear);
	const news = db.prepare('SELECT COUNT(*) count, MAX(published_at) updatedAt FROM player_news').get() as any;
	return { catalog, valueSources: values, news };
}
