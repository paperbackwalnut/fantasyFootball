import masterPlayers from '$lib/data/master_players_enriched.json';
import { getDatabase } from '$lib/server/db/database';
import { normalizePlayerName } from '$lib/server/espn-sync/draft-state.js';
import { scoreProjectionStats } from '$lib/server/projection-scoring.js';

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
			position=COALESCE(excluded.position,players.position),nfl_team=excluded.nfl_team,bye_week=COALESCE(excluded.bye_week,players.bye_week),active=excluded.active,espn_id=excluded.espn_id,sleeper_id=excluded.sleeper_id,
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
	const repairPosition = db.prepare('UPDATE players SET position=COALESCE(position,?), updated_at=? WHERE id=?');
	const repairedAt = new Date().toISOString();
	db.transaction(() => {
		for (const raw of masterPlayers as MasterPlayer[]) {
			const position = fantasyPositions[String(raw.default_position_id ?? '')];
			if (raw.id && position) repairPosition.run(position, repairedAt, raw.id);
		}
	})();
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

export function rankedAvailablePlayers(seasonYear: number, teamCount: number, draftedPicks: Array<{ catalogId?: string | null; playerName?: string | null; position?: string | null; nflTeam?: string | null }>, espnObserved: Array<{ espnPlayerId?: string | null; name?: string | null; displayedRank?: number | null; projectedPoints?: number | null; byeWeek?: number | null; capturedAt?: string | null }> = [], scoring: any = null) {
	ensurePlayerCatalog();
	const db = getDatabase();
	const rows = db.prepare(`SELECT p.id catalogId,p.espn_id id,p.full_name name,p.position,p.nfl_team nflTeam,p.bye_week byeWeek,
		r.overall_rank consensusRank,r.position_rank positionRank,r.tier,r.value_json rankingJson,
		a.adp,a.value_json adpJson,s.status,s.injury_status injuryStatus,s.practice_participation practiceStatus
		FROM player_values r JOIN players p ON p.id=r.player_id
		LEFT JOIN player_values a ON a.player_id=p.id AND a.season_year=r.season_year AND a.source='myfantasyleague-adp' AND a.scoring_format=?
		LEFT JOIN player_status s ON s.player_id=p.id
		WHERE r.season_year=? AND r.source='fantasypros-ecr-via-dynastyprocess' AND r.scoring_format='PPR'
		ORDER BY r.overall_rank`).all(`PPR_${teamCount}_TEAM`, seasonYear) as any[];
	const projectionQuery = db.prepare(`SELECT player_id,source,projected_points,value_json,fetched_at FROM player_values
		WHERE season_year=? AND scoring_format=? AND projected_points IS NOT NULL ORDER BY fetched_at DESC`);
	const desiredProjectionFormat = ['PPR', 'HALF_PPR', 'STANDARD', 'CUSTOM'].includes(scoring?.format) ? scoring.format : 'PPR';
	let projectionRows = projectionQuery.all(seasonYear, desiredProjectionFormat) as any[];
	if (!projectionRows.length && desiredProjectionFormat !== 'PPR') projectionRows = projectionQuery.all(seasonYear, 'PPR') as any[];
	const projectionsByPlayer = new Map<string, any[]>();
	for (const projection of projectionRows) {
		const values = projectionsByPlayer.get(projection.player_id) ?? [];
		if (!values.some((value) => value.source === projection.source)) values.push(projection);
		projectionsByPlayer.set(projection.player_id, values);
	}
	const drafted = new Set(draftedPicks.map((pick) => pick.catalogId).filter(Boolean));
	const draftedNames = new Set(draftedPicks.map((pick) => normalizePlayerName(pick.playerName)).filter(Boolean));
	const draftedPositionTeams = new Set(draftedPicks.filter((pick) => pick.position && pick.nflTeam).map((pick) => `${pick.position}:${String(pick.nflTeam).toUpperCase()}`));
	const observedIds = new Set(espnObserved.map((player) => String(player.espnPlayerId ?? '')).filter(Boolean));
	const observedNames = new Set(espnObserved.map((player) => normalizePlayerName(player.name)).filter(Boolean));
	const observedById = new Map(espnObserved.filter((player) => player.espnPlayerId).map((player) => [String(player.espnPlayerId), player]));
	const observedByName = new Map(espnObserved.filter((player) => player.name).map((player) => [normalizePlayerName(player.name), player]));
	const updateBye = db.prepare('UPDATE players SET bye_week=?, updated_at=? WHERE id=? AND (bye_week IS NULL OR bye_week<>?)');
	const observedAt = new Date().toISOString();
	return rows.filter((row) => !drafted.has(row.catalogId) && !draftedNames.has(normalizePlayerName(row.name)) && !draftedPositionTeams.has(`${row.position}:${String(row.nflTeam ?? '').toUpperCase()}`)).map((row) => {
		const ranking = JSON.parse(row.rankingJson ?? '{}');
		const adp = JSON.parse(row.adpJson ?? '{}');
		const projectionSources = projectionsByPlayer.get(row.catalogId) ?? [];
		const normalizedSources = projectionSources.map((projection) => {
			const metadata = JSON.parse(projection.value_json ?? '{}');
			const rescored = scoreProjectionStats(metadata.stats, scoring);
			return { ...projection, points: rescored?.points ?? Number(projection.projected_points), scoringBasis: rescored ? 'ESPN_RULES' : 'SOURCE_TOTAL' };
		});
		const espn = observedById.get(String(row.id)) ?? observedByName.get(normalizePlayerName(row.name));
		const observedBye = Number(espn?.byeWeek);
		if (Number.isInteger(observedBye) && observedBye > 0) updateBye.run(observedBye, observedAt, row.catalogId, observedBye);
		if (espn?.projectedPoints != null && Number.isFinite(Number(espn.projectedPoints))) normalizedSources.push({ source: 'espn-draft-room', points: Number(espn.projectedPoints), scoringBasis: 'ESPN_ROOM', fetched_at: espn?.capturedAt ?? null });
		const compatibleSources = scoring?.format && scoring.format !== 'PPR' && normalizedSources.some((projection) => projection.scoringBasis === 'ESPN_ROOM')
			? normalizedSources.filter((projection) => ['ESPN_ROOM', 'ESPN_RULES'].includes(projection.scoringBasis)) : normalizedSources;
		const projectionValues = compatibleSources.map((projection) => Number(projection.points)).filter(Number.isFinite).sort((a, b) => a - b);
		const trimmed = projectionValues.length >= 5 ? projectionValues.slice(1, -1) : projectionValues;
		const projectedPoints = trimmed.length ? trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length : null;
		const disagreement = projectionValues.length > 1 ? Math.max(...projectionValues) - Math.min(...projectionValues) : null;
		return { id: row.id ?? `catalog:${row.catalogId}`, catalogId: row.catalogId, name: row.name, position: row.position,
			espnVerified: observedIds.has(String(row.id)) || observedNames.has(normalizePlayerName(row.name)),
			espnDisplayedRank: Number.isFinite(Number(espn?.displayedRank)) ? Number(espn?.displayedRank) : null,
			nflTeam: row.nflTeam, byeWeek: Number.isInteger(observedBye) && observedBye > 0 ? observedBye : row.byeWeek, consensusRank: row.consensusRank, positionRank: row.positionRank,
			tier: row.tier, rankUncertainty: ranking.sd ?? null, rankDelta: ranking.rankDelta ?? null, adp: row.adp,
			projectedPoints, projectionSourceCount: projectionValues.length, projectionDisagreement: disagreement,
			projectionSources: compatibleSources.map((projection) => ({ source: projection.source, points: projection.points, scoringBasis: projection.scoringBasis, fetchedAt: projection.fetched_at })),
			minPick: adp.minPick ?? null, maxPick: adp.maxPick ?? null, draftSelectionPct: adp.draftSelectionPct ?? null,
			totalDrafts: adp.totalDrafts ?? null, status: row.status, injuryStatus: row.injuryStatus, practiceStatus: row.practiceStatus };
	});
}
