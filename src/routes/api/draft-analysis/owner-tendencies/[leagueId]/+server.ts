import { getLeaguePicks, getLeagueTeams } from '$lib/server/db/repositories';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const teams = getLeagueTeams(params.leagueId);
	const picks = getLeaguePicks(params.leagueId);
	const ownerPatterns = Object.fromEntries(teams.map((team) => {
		const owned = picks.filter((pick) => String(pick.team_id) === String(team.espn_team_id ?? team.sleeper_roster_id));
		const positions = (round: number) => owned.filter((pick) => pick.round_number === round).map((pick) => pick.player_position);
		return [team.owner_name || team.team_name, { totalPicks: owned.length, roundOnePicks: positions(1), roundTwoPicks: positions(2), commonR1: positions(1)[0] ?? 'N/A', commonR2: positions(2)[0] ?? 'N/A' }];
	}));
	return json({ ownerPatterns });
};
