import { randomUUID } from 'node:crypto';
import { getDatabase } from '$lib/server/db/database';
import { normalizePlayerName } from '$lib/server/espn-sync/draft-state.js';
import { ensurePlayerCatalog } from '$lib/server/player-intelligence';

type SleeperPlayer = {
	player_id?: string; sleeper_id?: string; full_name?: string; first_name?: string; last_name?: string;
	position?: string; fantasy_positions?: string[]; team?: string; active?: boolean; status?: string;
	espn_id?: string | number; injury_status?: string; injury_body_part?: string;
	practice_participation?: string; depth_chart_order?: number; depth_chart_position?: number;
	news_updated?: number | string;
};

// Sleeper's DEF filter includes individual defensive players. ESPN team defenses
// remain in the identity catalog and are reconciled from draft-room snapshots.
const positions = ['QB', 'RB', 'WR', 'TE', 'K'];

export async function refreshSleeperPlayers() {
	ensurePlayerCatalog();
	const fetchedAt = new Date().toISOString();
	const responses = await Promise.all(positions.map(async (position) => {
		const response = await fetch(`https://api.sleeper.app/v1/players/nfl?position=${position}&active=true`);
		if (!response.ok) throw new Error(`Sleeper ${position} player refresh returned ${response.status}`);
		return Object.values(await response.json() as Record<string, SleeperPlayer>);
	}));
	const players = new Map<string, SleeperPlayer>();
	for (const player of responses.flat()) {
		const sleeperId = String(player.player_id ?? player.sleeper_id ?? '');
		if (sleeperId) players.set(sleeperId, player);
	}

	const [adds, drops] = await Promise.all([fetchTrends('add'), fetchTrends('drop')]);
	const db = getDatabase();
	const bySleeper = db.prepare('SELECT id FROM players WHERE sleeper_id=?');
	const byEspn = db.prepare('SELECT id FROM players WHERE espn_id=?');
	const byName = db.prepare('SELECT id FROM players WHERE normalized_name=? ORDER BY active DESC LIMIT 2');
	const insert = db.prepare(`INSERT INTO players(id,full_name,normalized_name,position,nfl_team,active,espn_id,sleeper_id,data_json,updated_at)
		VALUES(?,?,?,?,?,?,?,?,?,?)`);
	const update = db.prepare(`UPDATE players SET full_name=?,normalized_name=?,position=?,nfl_team=?,active=?,
		espn_id=COALESCE(NULLIF(?,''),espn_id),sleeper_id=?,data_json=?,updated_at=? WHERE id=?`);
	const status = db.prepare(`INSERT INTO player_status(player_id,source,status,injury_status,injury_body_part,practice_participation,depth_chart_position,news_updated_at,data_json,fetched_at)
		VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(player_id) DO UPDATE SET source=excluded.source,status=excluded.status,
		injury_status=excluded.injury_status,injury_body_part=excluded.injury_body_part,practice_participation=excluded.practice_participation,
		depth_chart_position=excluded.depth_chart_position,news_updated_at=excluded.news_updated_at,data_json=excluded.data_json,fetched_at=excluded.fetched_at`);
	const trend = db.prepare(`INSERT INTO player_trends(player_id,source,trend_type,lookback_hours,activity_count,fetched_at)
		VALUES(?,?,?,?,?,?) ON CONFLICT(player_id,source,trend_type,lookback_hours) DO UPDATE SET activity_count=excluded.activity_count,fetched_at=excluded.fetched_at`);
	let created = 0;
	let updated = 0;
	let injured = 0;
	db.transaction(() => {
		for (const [sleeperId, player] of players) {
			const fullName = player.full_name ?? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
			if (!fullName) continue;
			const normalized = normalizePlayerName(fullName);
			let row = bySleeper.get(sleeperId) as { id: string } | undefined;
			if (!row && player.espn_id) row = byEspn.get(String(player.espn_id)) as { id: string } | undefined;
			if (!row) {
				const matches = byName.all(normalized) as { id: string }[];
				if (matches.length === 1) row = matches[0];
			}
			const id = row?.id ?? randomUUID();
			const position = normalizePosition(player.position ?? player.fantasy_positions?.[0]);
			const raw = JSON.stringify(player);
			if (row) { update.run(fullName, normalized, position, player.team ?? null, Number(player.active !== false), String(player.espn_id ?? ''), sleeperId, raw, fetchedAt, id); updated++; }
			else { insert.run(id, fullName, normalized, position, player.team ?? null, Number(player.active !== false), String(player.espn_id ?? '') || null, sleeperId, raw, fetchedAt); created++; }
			if (player.injury_status) injured++;
			status.run(id, 'sleeper', player.status ?? null, player.injury_status ?? null, player.injury_body_part ?? null,
				player.practice_participation ?? null, player.depth_chart_order ?? player.depth_chart_position ?? null,
				player.news_updated ? new Date(Number(player.news_updated)).toISOString() : null, raw, fetchedAt);
		}
		for (const [type, rows] of [['add', adds], ['drop', drops]] as const) {
			for (const item of rows) {
				const player = bySleeper.get(String(item.player_id)) as { id: string } | undefined;
				if (player) trend.run(player.id, 'sleeper', type, 24, Number(item.count ?? 0), fetchedAt);
			}
		}
		db.prepare(`INSERT INTO provider_cache(key,value_json,expires_at,updated_at) VALUES('player-source:sleeper',?,?,?)
			ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
			.run(JSON.stringify({ players: players.size, created, updated, injured, adds: adds.length, drops: drops.length }), new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), fetchedAt);
	})();
	return { source: 'sleeper', fetchedAt, players: players.size, created, updated, injured, trends: { adds: adds.length, drops: drops.length } };
}

export function sleeperRefreshStatus() {
	const row = getDatabase().prepare("SELECT value_json,expires_at,updated_at FROM provider_cache WHERE key='player-source:sleeper'").get() as any;
	return row ? { ...JSON.parse(row.value_json), updatedAt: row.updated_at, expiresAt: row.expires_at, stale: !row.expires_at || new Date(row.expires_at) <= new Date() } : null;
}

async function fetchTrends(type: 'add' | 'drop') {
	const response = await fetch(`https://api.sleeper.app/v1/players/nfl/trending/${type}?lookback_hours=24&limit=100`);
	if (!response.ok) throw new Error(`Sleeper ${type} trends returned ${response.status}`);
	return await response.json() as Array<{ player_id: string; count: number }>;
}

function normalizePosition(position?: string) { return position === 'DEF' ? 'DST' : position || null; }
