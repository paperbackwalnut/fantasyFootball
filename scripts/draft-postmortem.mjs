import Database from 'better-sqlite3';
import { recommendPlayers } from '../src/lib/server/recommendations.js';
import { analyzeDraftMarket } from '../src/lib/server/draft-market.js';
import { normalizePlayerName } from '../src/lib/server/espn-sync/draft-state.js';

const db = new Database('.data/fantasy-football.sqlite', { readonly: true });
const saved = db.prepare("SELECT state_json FROM live_draft_state WHERE platform='ESPN'").get();
if (!saved) throw new Error('No saved ESPN draft');
const state = JSON.parse(saved.state_json);
const url = new URL(state.draftUrl);
const userTeamId = url.searchParams.get('teamId');
const teamCount = state.teams.length;
const values = db.prepare(`SELECT p.id catalogId,p.espn_id id,p.full_name name,p.position,p.nfl_team nflTeam,
	r.overall_rank consensusRank,r.position_rank positionRank,r.tier,a.adp,s.injury_status injuryStatus
	FROM player_values r JOIN players p ON p.id=r.player_id
	LEFT JOIN player_values a ON a.player_id=p.id AND a.season_year=r.season_year AND a.source='myfantasyleague-adp' AND a.scoring_format=?
	LEFT JOIN player_status s ON s.player_id=p.id
	WHERE r.season_year=? AND r.source='fantasypros-ecr-via-dynastyprocess' AND r.scoring_format='PPR' ORDER BY r.overall_rank`).all(`PPR_${teamCount}_TEAM`, Number(url.searchParams.get('seasonId')));
const myPicks = state.picks.filter((pick) => String(pick.teamId) === String(userTeamId));
const report = [];
for (const chosen of myPicks) {
	const prior = state.picks.filter((pick) => pick.pickNumber < chosen.pickNumber);
	const draftedIds = new Set(prior.map((pick) => pick.catalogId).filter(Boolean));
	const draftedNames = new Set(prior.map((pick) => normalizePlayerName(pick.playerName)));
	const available = values.filter((player) => !draftedIds.has(player.catalogId) && !draftedNames.has(normalizePlayerName(player.name)));
	const rosterCounts = {};
	for (const pick of prior.filter((pick) => String(pick.teamId) === String(userTeamId))) rosterCounts[pick.position ?? 'UNKNOWN'] = (rosterCounts[pick.position ?? 'UNKNOWN'] ?? 0) + 1;
	const next = myPicks.find((pick) => pick.pickNumber > chosen.pickNumber)?.pickNumber ?? null;
	const advice = recommendPlayers(available, { currentPick: chosen.pickNumber, nextUserPick: next, teamCount, rosterCounts, completed: false }, analyzeDraftMarket(prior));
	const pickedValue = values.find((player) => player.catalogId === chosen.catalogId || normalizePlayerName(player.name) === normalizePlayerName(chosen.playerName));
	const advised = advice.find((player) => player.catalogId === chosen.catalogId || normalizePlayerName(player.name) === normalizePlayerName(chosen.playerName));
	report.push({ pick: chosen.pickNumber, round: chosen.round, chosen: chosen.playerName, position: chosen.position, ecr: pickedValue?.consensusRank ?? null, adp: pickedValue?.adp ?? null, advisorRank: advised?.recommendationRank ?? null, rosterBefore: rosterCounts, topOptions: advice.slice(0, 5).map((player) => ({ name: player.name, position: player.position, ecr: player.consensusRank, adp: player.adp, score: player.recommendationScore, reasons: player.reasons })) });
}
const observations = db.prepare("SELECT captured_at,type FROM sync_observations WHERE captured_at BETWEEN ? AND ? ORDER BY captured_at").all(state.picks[0]?.pickedAt ?? state.updatedAt.slice(0, 10), state.updatedAt);
const gaps = [];
for (let index = 1; index < observations.length; index++) {
	const seconds = (new Date(observations[index].captured_at) - new Date(observations[index - 1].captured_at)) / 1000;
	if (seconds > 5) gaps.push({ seconds, from: observations[index - 1].captured_at, to: observations[index].captured_at });
}
console.log(JSON.stringify({ team: state.teams.find((team) => String(team.id) === String(userTeamId))?.name, completed: state.completed, picks: report, sync: { observations: observations.length, gaps: gaps.sort((a, b) => b.seconds - a.seconds).slice(0, 20) } }, null, 2));
