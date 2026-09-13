import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getDatabase } from '$lib/server/db/database';
import { getLeague, getLeaguePicks, getLeagueTeams } from '$lib/server/db/repositories';
import { getNFLTeamName, getPositionName } from '$lib/server/draft/utils';
import { kickoffScheduleStatus } from '$lib/server/kickoff-refresh';

const starterNeeds: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1, DST: 1, K: 1 };
const tradeDepth: Record<string, number> = { QB: 1, RB: 3, WR: 3, TE: 1 };

export const load = (async ({ params }) => {
	const league = getLeague(params.leagueId);
	if (!league) throw error(404, 'League not found');
	const teams = getLeagueTeams(params.leagueId);
	const picks = getLeaguePicks(params.leagueId);
	const scoringPeriod = Number(league.settings?.scoring_period_id ?? league.settings?.espn_status?.currentMatchupPeriod) || 1;
	const db = getDatabase();
	const kickoffSchedule: any = kickoffScheduleStatus();
	const scheduleMatchesWeek = Number(kickoffSchedule?.week) === scoringPeriod && Number(kickoffSchedule?.season) === Number(league.season_year);
	const gameByTeam = new Map<string, any>();
	for (const game of kickoffSchedule?.games ?? []) for (const team of game.teams ?? []) gameByTeam.set(String(team), game);
	const gameContext = (team: string | null | undefined) => {
		const game = team ? gameByTeam.get(String(team)) : null;
		return { kickoffAt: scheduleMatchesWeek ? game?.kickoffAt ?? null : null, gameStatus: scheduleMatchesWeek ? game?.status ?? null : null,
			gameKnown: scheduleMatchesWeek && Boolean(game),
			lineupLocked: scheduleMatchesWeek && game ? game.status !== 'pre' || new Date(game.kickoffAt).getTime() <= Date.now() : false };
	};
	const value = db.prepare(`SELECT p.id,p.espn_id,p.full_name,p.position,p.nfl_team,p.bye_week,
		v.overall_rank,v.position_rank,s.injury_status FROM players p
		LEFT JOIN player_values v ON v.player_id=p.id AND v.season_year=? AND v.scoring_format='PPR' AND v.source='fantasypros-ecr-via-dynastyprocess'
		LEFT JOIN player_status s ON s.player_id=p.id WHERE p.espn_id=?`);
	const sleeperValue = db.prepare(`SELECT p.id,p.sleeper_id,p.full_name,p.position,p.nfl_team,p.bye_week,
		v.overall_rank,v.position_rank,s.injury_status FROM players p
		LEFT JOIN player_values v ON v.player_id=p.id AND v.season_year=? AND v.scoring_format='PPR' AND v.source='fantasypros-ecr-via-dynastyprocess'
		LEFT JOIN player_status s ON s.player_id=p.id WHERE p.sleeper_id=?`);
	const weeklyProjection = db.prepare(`SELECT pp.projected_points,pp.stats_json,ps.imported_at FROM player_projections pp
		JOIN projection_sets ps ON ps.id=pp.projection_set_id
		WHERE pp.player_id=? AND ps.source='espn-weekly-proxy' AND ps.season_year=?
		AND CAST(json_extract(ps.metadata_json,'$.week') AS INTEGER)=? ORDER BY ps.imported_at DESC LIMIT 1`);
	const weeklyDefenseProjection = db.prepare(`SELECT pp.projected_points,pp.stats_json,ps.imported_at FROM player_projections pp
		JOIN projection_sets ps ON ps.id=pp.projection_set_id JOIN players p ON p.id=pp.player_id
		WHERE p.nfl_team=? AND p.position IN ('DST','DEF') AND ps.source='espn-weekly-proxy' AND ps.season_year=?
		AND CAST(json_extract(ps.metadata_json,'$.week') AS INTEGER)=? ORDER BY ps.imported_at DESC LIMIT 1`);
	const weeklyConsensus = db.prepare(`SELECT overall_rank,position_rank,projected_points,value_json,fetched_at FROM player_values
		WHERE player_id=? AND season_year=? AND scoring_format='PPR' AND source='fantasypros-weekly-ecr-via-dynastyprocess' LIMIT 1`);
	const rosters = teams.map((team) => {
		const liveEntries = Array.isArray(team.data?.roster_entries) ? team.data.roster_entries : [];
		const draftedPlayers = picks.filter((pick) => String(pick.team_id) === String(team.espn_team_id)).map((pick) => {
			const row = value.get(league.season_year, String(pick.espn_player_id ?? '')) as any;
			return { id: row?.id ?? null, espnId: pick.espn_player_id, name: row?.full_name ?? pick.player_name,
				position: row?.position ?? pick.player_position, nflTeam: row?.nfl_team ?? pick.player_nfl_team,
				byeWeek: row?.bye_week ?? null, rank: Number(row?.overall_rank) || null,
				positionRank: Number(row?.position_rank) || null, injuryStatus: row?.injury_status ?? null,
				pickNumber: pick.pick_number, round: pick.round_number, lineupSlotId: null, weeklyProjected: null, seasonProjected: null };
		});
		const livePlayers = liveEntries.map((entry: any) => {
			if (league.platform === 'SLEEPER') {
				const playerId = String(entry.playerId ?? '');
				const row = sleeperValue.get(league.season_year, playerId) as any;
				if (!row?.full_name) return null;
				const isDefense = ['DST', 'DEF'].includes(String(row.position));
				const projection = (isDefense ? weeklyDefenseProjection.get(row.nfl_team, league.season_year, scoringPeriod) : weeklyProjection.get(row.id, league.season_year, scoringPeriod)) as any;
				const weekly = weeklyConsensus.get(row.id, league.season_year) as any;
				const weeklyMeta = weekly?.value_json ? JSON.parse(weekly.value_json) : {};
				const defensePoints = finite(projection?.projected_points);
				const espnProjected = isDefense ? (defensePoints == null ? null : round(defensePoints)) : scoreSleeperProjection(projection?.stats_json, league.settings?.scoring_settings);
				const weeklyFallback = finite(weekly?.projected_points);
				const projected = espnProjected ?? (weeklyFallback == null ? null : round(weeklyFallback));
				return { id: row.id, sleeperId: playerId, espnId: `sleeper:${playerId}`, name: row.full_name,
					position: row.position === 'DEF' ? 'DST' : row.position, nflTeam: row.nfl_team, byeWeek: row.bye_week ?? null,
					rank: Number(row.overall_rank) || null, positionRank: Number(row.position_rank) || null,
					injuryStatus: row.injury_status ?? null, pickNumber: null, round: null,
					lineupSlotId: entry.isStarter ? 0 : entry.isReserve ? 21 : 20,
					weeklyProjected: projected, seasonProjected: null,
					projectionSource: espnProjected != null ? (isDefense ? 'ESPN defense proxy' : 'ESPN stat-line proxy') : weeklyFallback != null ? 'Weekly consensus fallback' : null,
					weeklyRank: finite(weekly?.overall_rank), weeklyPositionRank: finite(weekly?.position_rank), weeklyGrade: weeklyMeta.grade ?? null,
					opponent: weeklyMeta.opponent ?? null, rankUncertainty: finite(weeklyMeta.uncertainty), weeklyNote: weeklyMeta.note ?? null,
					...gameContext(row.nfl_team) };
			}
			const espnPlayer = entry?.player;
			if (!espnPlayer?.id || !espnPlayer.fullName) return null;
			const row = value.get(league.season_year, String(espnPlayer.id)) as any;
			const stats = Array.isArray(espnPlayer.stats) ? espnPlayer.stats : [];
			const weekly = stats.find((stat: any) => Number(stat.scoringPeriodId) === scoringPeriod && Number(stat.statSourceId) === 1);
			const season = stats.find((stat: any) => Number(stat.scoringPeriodId) === 0 && Number(stat.statSourceId) === 1 && Number(stat.externalId) === Number(league.season_year));
			return { id: row?.id ?? null, espnId: String(espnPlayer.id), name: espnPlayer.fullName,
				position: getPositionName(Number(espnPlayer.defaultPositionId)), nflTeam: getNFLTeamName(Number(espnPlayer.proTeamId)),
				byeWeek: row?.bye_week ?? null, rank: Number(row?.overall_rank) || null, positionRank: Number(row?.position_rank) || null,
				injuryStatus: espnPlayer.injuryStatus ?? row?.injury_status ?? null, pickNumber: null, round: null,
				lineupSlotId: Number(entry.lineupSlotId), weeklyProjected: finite(weekly?.appliedTotal), seasonProjected: finite(season?.appliedTotal),
				...gameContext(getNFLTeamName(Number(espnPlayer.proTeamId))) };
		}).filter(Boolean);
		const players = (livePlayers.length ? livePlayers : draftedPlayers).filter((player: any) => player.name && player.name !== 'Unknown Player');
		const { starters, bench } = chooseStarters(players, league.platform === 'SLEEPER' ? league.settings?.roster_positions : null);
		const weeklyTotal = starters.reduce((sum, player) => sum + Number(player.weeklyProjected ?? 0), 0);
		const starterValue = starters.reduce((sum, player) => sum + playerValue(player) * 1.25, 0);
		const depthValue = bench.slice().sort(byRank).slice(0, 5).reduce((sum, player) => sum + playerValue(player) * 0.35, 0);
		return { ...team, players, starters, bench, counts: countPositions(players), weeklyTotal: round(weeklyTotal),
			currentStarters: players.filter((player: any) => ![20, 21].includes(Number(player.lineupSlotId))), rawScore: weeklyTotal > 0 ? weeklyTotal * 10 + depthValue : starterValue + depthValue };
	});
	const maxScore = Math.max(1, ...rosters.map((team) => team.rawScore));
	const minScore = Math.min(...rosters.map((team) => team.rawScore));
	const powerRankings = rosters.map((team) => ({ ...team, score: round(70 + 30 * (team.rawScore - minScore) / Math.max(1, maxScore - minScore)) }))
		.sort((a, b) => b.rawScore - a.rawScore).map((team, index) => ({ ...team, powerRank: index + 1 }));
	const user = powerRankings.find((team) => team.is_user) ?? null;
	const positionComparison = ['QB', 'RB', 'WR', 'TE'].map((position) => {
		const leagueAverage = average(powerRankings.map((team) => positionStrength(team.players, position)));
		const userStrength = positionStrength(user?.players ?? [], position);
		return { position, userStrength: round(userStrength), leagueAverage: round(leagueAverage), delta: round(userStrength - leagueAverage) };
	});
	const needs = positionComparison.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta).map((item) => item.position);
	const rosteredIds = new Set(powerRankings.flatMap((team) => team.players.map((player: any) => player.id)).filter(Boolean));
	const waiverRows = db.prepare(`SELECT p.id,p.full_name,p.position,p.nfl_team,p.bye_week,s.injury_status,
		w.overall_rank weekly_rank,w.position_rank weekly_position_rank,w.projected_points weekly_points,w.value_json weekly_json,
		r.overall_rank season_rank FROM players p
		JOIN player_values w ON w.player_id=p.id AND w.season_year=? AND w.scoring_format='PPR' AND w.source='fantasypros-weekly-ecr-via-dynastyprocess'
		LEFT JOIN player_values r ON r.player_id=p.id AND r.season_year=? AND r.scoring_format='PPR' AND r.source='fantasypros-ecr-via-dynastyprocess'
		LEFT JOIN player_status s ON s.player_id=p.id
		WHERE p.active=1 AND p.position IN ('QB','RB','WR','TE','K','DST','DEF') AND p.nfl_team IS NOT NULL`).all(league.season_year, league.season_year) as any[];
	const waiverAdvice = waiverRows.filter((row) => !rosteredIds.has(row.id)).map((row) => {
		const isDefense = ['DST', 'DEF'].includes(String(row.position));
		const projection = (isDefense ? weeklyDefenseProjection.get(row.nfl_team, league.season_year, scoringPeriod) : weeklyProjection.get(row.id, league.season_year, scoringPeriod)) as any;
		const defensePoints = finite(projection?.projected_points);
		const espnPoints = isDefense
			? defensePoints
			: league.platform === 'SLEEPER'
				? scoreSleeperProjection(projection?.stats_json, league.settings?.scoring_settings)
				: finite(projection?.projected_points);
		const weeklyPoints = finite(espnPoints) ?? finite(row.weekly_points);
		const meta = row.weekly_json ? JSON.parse(row.weekly_json) : {};
		const position = row.position === 'DEF' ? 'DST' : row.position;
		const game = gameContext(row.nfl_team);
		const injury = String(row.injury_status ?? '').toUpperCase();
		const needBonus = needs.includes(position) ? 18 : 0;
		const score = Number(weeklyPoints ?? 0) * 4 + Math.max(0, 160 - Number(row.weekly_rank ?? 160)) * 0.35 + needBonus
			- (injury && !['ACTIVE', 'NA'].includes(injury) ? 18 : 0);
		return { id: row.id, name: row.full_name, position, nflTeam: row.nfl_team, byeWeek: row.bye_week,
			weeklyProjected: weeklyPoints == null ? null : round(weeklyPoints), weeklyRank: finite(row.weekly_rank),
			weeklyPositionRank: finite(row.weekly_position_rank), seasonRank: finite(row.season_rank), injuryStatus: row.injury_status,
			opponent: meta.opponent ?? null, grade: meta.grade ?? null, weeklyNote: meta.note ?? null,
			projectionSource: espnPoints != null ? (isDefense ? 'ESPN defense proxy' : 'ESPN weekly projection') : 'Weekly consensus fallback', score,
			priority: needBonus ? 'Roster need' : Number(row.weekly_rank ?? 999) <= 60 ? 'Immediate value' : 'Depth upside', ...game };
	}).filter((player) => !player.lineupLocked && player.weeklyProjected != null && !['OUT', 'IR', 'SUSPENDED'].includes(String(player.injuryStatus ?? '').toUpperCase()))
		.sort((a, b) => b.score - a.score).slice(0, 12).map(({ score: _score, ...player }) => player);
	const tradeTargets = powerRankings.filter((team) => !team.is_user).flatMap((team) => team.players
		.filter((player: any) => needs.includes(player.position) && Number(team.counts[player.position] ?? 0) > Number(tradeDepth[player.position] ?? 99))
		.map((player: any) => ({ ...player, fromTeam: team.team_name, ownerName: team.owner_name,
			reason: `${team.team_name} has ${team.counts[player.position]} ${player.position}s; ${player.position} grades below your league average` })))
		.sort(byRank).slice(0, 12);
	const recommendedIds = new Set((user?.starters ?? []).map((player: any) => player.espnId));
	const currentIds = new Set((user?.currentStarters ?? []).map((player: any) => player.espnId));
	const startSit: any = {
		start: (user?.starters ?? []).filter((player: any) => !currentIds.has(player.espnId)),
		sit: (user?.currentStarters ?? []).filter((player: any) => !recommendedIds.has(player.espnId)),
		edge: null as number | null,
		confidence: 'No change' as string,
		closeCall: null,
		warnings: [] as string[]
	};
	if (!user?.players?.length || !user.currentStarters.length) {
		startSit.confidence = 'Unavailable';
		startSit.warnings.push('No submitted lineup is available from the latest league import. Refresh the league before using start/sit advice.');
		startSit.start = []; startSit.sit = [];
	} else if (startSit.start.length || startSit.sit.length) {
		const moves = [...startSit.start, ...startSit.sit];
		const allProjected = moves.every((player: any) => finite(player.weeklyProjected) != null);
		const edge = allProjected
			? round(startSit.start.reduce((sum: number, player: any) => sum + Number(player.weeklyProjected), 0)
				- startSit.sit.reduce((sum: number, player: any) => sum + Number(player.weeklyProjected), 0)) : null;
		startSit.edge = edge;
		const weeklyConflict = startSit.start.some((player: any) => finite(player.weeklyRank) != null
			&& startSit.sit.some((sitting: any) => sitting.position === player.position && finite(sitting.weeklyRank) != null
				&& Number(player.weeklyRank) > Number(sitting.weeklyRank)));
		const locked = moves.some((player: any) => player.lineupLocked);
		const unknownKickoff = moves.some((player: any) => !player.gameKnown);
		const riskyStarter = startSit.start.some((player: any) => isUnavailable(player.injuryStatus));
		if (locked) startSit.warnings.push('A proposed move involves a player whose game has started.');
		if (unknownKickoff) startSit.warnings.push('A proposed player has no verified game time, so the move may be locked.');
		if (riskyStarter) startSit.warnings.push('A proposed starter is listed out, doubtful, suspended, or on reserve.');
		if (edge == null) startSit.warnings.push('A proposed player has no weekly projection.');
		if (locked || unknownKickoff || riskyStarter || edge == null || edge < 1.5 || (weeklyConflict && edge < 3)) {
			startSit.closeCall = { start: startSit.start[0] ?? null, sit: startSit.sit[0] ?? null, edge, weeklyConflict, locked };
			startSit.start = [];
			startSit.sit = [];
			startSit.confidence = 'Hold';
		} else startSit.confidence = edge >= 3 ? 'High' : 'Medium';
	}
	const projectionCoverage = {
		projected: (user?.players ?? []).filter((player: any) => player.weeklyProjected != null).length,
		total: (user?.players ?? []).length
	};
	return { league: { id: league.id, externalId: league.external_id, name: league.name, platform: league.platform, seasonYear: league.season_year, teamCount: league.team_count },
		powerRankings: powerRankings.map(({ rawScore: _raw, ...team }) => team), user, positionComparison, waiverAdvice, tradeTargets, startSit, scoringPeriod, projectionCoverage, kickoffSchedule,
		methodology: projectionCoverage.projected > 0
			? league.platform === 'SLEEPER'
				? `Live Sleeper rosters with ESPN Week ${scoringPeriod} stat-line projections rescored under this league's settings, plus current injuries and consensus fallback.`
				: `Live ESPN rosters and Week ${scoringPeriod} projections under your league scoring, with current injuries and consensus depth.`
			: `${league.platform === 'SLEEPER' ? 'Live Sleeper rosters' : 'Draft-value baseline'} using current consensus rank, current injuries, likely starters, and shallow bench depth; weekly point projections are not yet available for this league.` };
}) satisfies PageServerLoad;

function chooseStarters(players: any[], rosterPositions?: string[] | null) {
	const lockedStarters = players.filter((player) => player.lineupLocked && ![20, 21].includes(Number(player.lineupSlotId)));
	const remaining = players.filter((player) => !player.lineupLocked && Number(player.lineupSlotId) !== 21 && !isUnavailable(player.injuryStatus)).sort(byWeeklyThenRank);
	const starters: any[] = [];
	const slots = Array.isArray(rosterPositions) && rosterPositions.length
		? rosterPositions.filter((slot) => !['BN', 'IR', 'TAXI'].includes(slot))
		: Object.entries(starterNeeds).flatMap(([position, count]) => Array(count).fill(position)).concat('FLEX');
	const orderedSlots = slots.slice().sort((a, b) => Number(isFlexible(a)) - Number(isFlexible(b)));
	for (const player of lockedStarters) {
		const slot = orderedSlots.findIndex((candidate) => slotEligibility(candidate).includes(player.position));
		if (slot >= 0) { orderedSlots.splice(slot, 1); starters.push(player); }
	}
	for (const slot of orderedSlots) {
		const eligible = slotEligibility(slot);
		const index = remaining.findIndex((player) => eligible.includes(player.position));
		if (index >= 0) starters.push(remaining.splice(index, 1)[0]);
	}
	return { starters: starters.sort((a, b) => String(a.position).localeCompare(String(b.position)) || byRank(a, b)), bench: remaining.concat(players.filter((player) => player.lineupLocked && [20, 21].includes(Number(player.lineupSlotId)))) };
}
function isUnavailable(status: unknown) { return ['OUT', 'O', 'IR', 'PUP', 'SUSPENDED', 'DOUBTFUL', 'BYE'].includes(String(status ?? '').toUpperCase()); }
function isFlexible(slot: string) { return ['FLEX', 'SUPER_FLEX', 'REC_FLEX', 'WRRB_FLEX'].includes(slot); }
function slotEligibility(slot: string) {
	if (slot === 'FLEX') return ['RB', 'WR', 'TE'];
	if (slot === 'SUPER_FLEX') return ['QB', 'RB', 'WR', 'TE'];
	if (slot === 'REC_FLEX') return ['WR', 'TE'];
	if (slot === 'WRRB_FLEX') return ['WR', 'RB'];
	if (slot === 'DEF') return ['DST'];
	return [slot];
}
function countPositions(players: any[]) { return players.reduce((counts, player) => ({ ...counts, [player.position]: (counts[player.position] ?? 0) + 1 }), {} as Record<string, number>); }
function playerValue(player: any) { return Math.max(0, 220 - Number(player.rank ?? player.pickNumber ?? 220)) - (player.injuryStatus && !['NA', 'ACTIVE'].includes(String(player.injuryStatus).toUpperCase()) ? 8 : 0); }
function positionStrength(players: any[], position: string) { return players.filter((player) => player.position === position).sort(byRank).slice(0, tradeDepth[position] ?? 1).reduce((sum, player) => sum + playerValue(player), 0); }
function byRank(a: any, b: any) { return Number(a.rank ?? a.pickNumber ?? 999) - Number(b.rank ?? b.pickNumber ?? 999); }
function byWeeklyThenRank(a: any, b: any) {
	const aPoints = finite(a.weeklyProjected); const bPoints = finite(b.weeklyProjected);
	if (aPoints != null || bPoints != null) return Number(bPoints ?? -1) - Number(aPoints ?? -1);
	return byRank(a, b);
}
function finite(value: unknown) { return value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value); }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function round(value: number) { return Math.round(value * 10) / 10; }

const sleeperStatKeys: Record<string, string> = {
	'3': 'pass_yd', '4': 'pass_td', '19': 'pass_2pt', '20': 'pass_int',
	'24': 'rush_yd', '25': 'rush_td', '26': 'rush_2pt', '42': 'rec_yd',
	'43': 'rec_td', '44': 'rec_2pt', '53': 'rec', '72': 'fum_lost'
};
function scoreSleeperProjection(statsJson: string | null | undefined, scoring: Record<string, number> | null | undefined) {
	if (!statsJson || !scoring) return null;
	try {
		const stats = JSON.parse(statsJson)?.espnStats ?? {};
		let total = 0; let matched = 0;
		for (const [espnId, sleeperKey] of Object.entries(sleeperStatKeys)) {
			const stat = Number(stats[espnId]); const multiplier = Number(scoring[sleeperKey]);
			if (!Number.isFinite(stat) || !Number.isFinite(multiplier)) continue;
			total += stat * multiplier; matched++;
		}
		return matched ? round(total) : null;
	} catch { return null; }
}
