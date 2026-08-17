import { getDatabase } from '$lib/server/db/database';
import { randomUUID } from 'node:crypto';
import { normalizePlayerName } from '$lib/server/espn-sync/draft-state.js';
import { ensurePlayerCatalog } from '$lib/server/player-intelligence';
import { parseCsv } from './csv.js';

const source = 'fantasypros-ecr-via-dynastyprocess';
const url = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr_latest.csv';
const allowedPositions = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);

type RankingRow = Record<string, string>;

export async function refreshConsensusRankings() {
	ensurePlayerCatalog();
	const response = await fetch(url, { headers: { 'user-agent': 'fantasy-football-local' } });
	if (!response.ok) throw new Error(`Consensus rankings refresh returned ${response.status}`);
	const allRows = parseCsv(await response.text()) as RankingRow[];
	const overall = allRows.filter((row) => row.ecr_type === 'ro' && row.page_type === 'redraft-overall' && allowedPositions.has(row.pos));
	const positional = allRows.filter((row) => row.ecr_type === 'rp' && allowedPositions.has(row.pos));
	if (!overall.length) throw new Error('Consensus rankings contained no PPR redraft rows');
	const scrapeDate = overall.map((row) => row.scrape_date).sort().at(-1) ?? new Date().toISOString().slice(0, 10);
	const seasonYear = Number(scrapeDate.slice(0, 4));
	const positionById = new Map(positional.map((row) => [row.id, row]));
	const tiers = deriveTiers(positional);
	const db = getDatabase();
	const byFantasyPros = db.prepare('SELECT id FROM players WHERE fantasypros_id=?');
	const byNameTeam = db.prepare('SELECT id FROM players WHERE normalized_name=? AND (nfl_team=? OR ? IS NULL) ORDER BY active DESC LIMIT 2');
	const insert = db.prepare(`INSERT INTO player_values(player_id,season_year,scoring_format,source,overall_rank,position_rank,adp,projected_points,tier,value_json,fetched_at)
		VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(player_id,season_year,scoring_format,source) DO UPDATE SET overall_rank=excluded.overall_rank,
		position_rank=excluded.position_rank,tier=excluded.tier,value_json=excluded.value_json,fetched_at=excluded.fetched_at`);
	const insertPlayer = db.prepare(`INSERT INTO players(id,full_name,normalized_name,position,nfl_team,active,fantasypros_id,data_json,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`);
	const fetchedAt = new Date().toISOString();
	let imported = 0;
	let unmatched = 0;
	const unmatchedPlayers: string[] = [];
	db.transaction(() => {
		db.prepare('DELETE FROM player_values WHERE season_year=? AND scoring_format=? AND source=?').run(seasonYear, 'PPR', source);
		for (const row of overall) {
			let player = byFantasyPros.get(row.id) as { id: string } | undefined;
			if (!player) {
				const team = normalizeTeam(row.team);
				const matches = byNameTeam.all(normalizePlayerName(row.player), team, team) as { id: string }[];
				if (matches.length === 1) player = matches[0];
			}
			if (!player) {
				const id = randomUUID();
				insertPlayer.run(id, row.player, normalizePlayerName(row.player), row.pos, normalizeTeam(row.team), 1, row.id,
					JSON.stringify({ source, sourcePage: row.fp_page, scrapeDate }), fetchedAt);
				player = { id };
				unmatchedPlayers.push(row.player);
			}
			const positionRow = positionById.get(row.id);
			insert.run(player.id, seasonYear, 'PPR', source, number(row.ecr), number(positionRow?.ecr), null, null,
				tiers.get(row.id) ?? null, JSON.stringify({ position: row.pos, team: row.team, sd: number(row.sd), best: number(row.best), worst: number(row.worst), rankDelta: number(row.rank_delta), scrapeDate, page: `https://www.fantasypros.com${row.fp_page}`, attribution: 'FantasyPros ECR via DynastyProcess open data' }), fetchedAt);
			imported++;
		}
		db.prepare(`INSERT INTO provider_cache(key,value_json,expires_at,updated_at) VALUES('player-source:consensus-rankings',?,?,?)
			ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
			.run(JSON.stringify({ source, seasonYear, scoringFormat: 'PPR', scrapeDate, rows: overall.length, imported, unmatched }), new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), fetchedAt);
	})();
	return { source, seasonYear, scoringFormat: 'PPR', scrapeDate, rows: overall.length, imported, unmatched, createdPlayers: unmatchedPlayers, fetchedAt };
}

export function consensusRankingStatus() {
	const row = getDatabase().prepare("SELECT value_json,expires_at,updated_at FROM provider_cache WHERE key='player-source:consensus-rankings'").get() as any;
	return row ? { ...JSON.parse(row.value_json), updatedAt: row.updated_at, expiresAt: row.expires_at, stale: !row.expires_at || new Date(row.expires_at) <= new Date() } : null;
}

function deriveTiers(rows: RankingRow[]) {
	const tiers = new Map<string, number>();
	for (const position of allowedPositions) {
		const group = rows.filter((row) => row.pos === position).sort((a, b) => (number(a.ecr) ?? 9999) - (number(b.ecr) ?? 9999));
		let tier = 1;
		let previous: number | null = null;
		for (const row of group) {
			const rank = number(row.ecr);
			if (rank === null) continue;
			if (previous !== null && rank - previous >= 2.5) tier++;
			tiers.set(row.id, tier);
			previous = rank;
		}
	}
	return tiers;
}

function number(value?: string) { const parsed = Number(value); return value && value !== 'NA' && Number.isFinite(parsed) ? parsed : null; }
function normalizeTeam(team?: string) { return !team || team === 'FA' || team === 'NA' ? null : team === 'JAC' ? 'JAX' : team; }
