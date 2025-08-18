import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Shape of what the Supabase join returns for this query
interface UserLeagueRow {
	espn_team_id: number;
	leagues: {
		id: number;
		name: string;
		espn_s2_cookie: string | null;
		swid_cookie: string | null;
		platform_league_id: number;
	};
}

// Minimal ESPN league shape for the bit we use
interface ESPNTeam {
	id: number;
}
interface ESPNLeagueResponse {
	teams?: ESPNTeam[];
}

export const GET: RequestHandler = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const { leagueId } = params;

	// If league_id is numeric in DB, coerce the param to a number
	const leagueIdNum = Number(leagueId);
	if (Number.isNaN(leagueIdNum)) throw error(400, 'Invalid league id');

	const { data: userLeagueRow, error: dbError } = await locals.supabase
		.from('user_leagues')
		.select(
			`
      espn_team_id,
      leagues!inner (
        id,
        name,
        espn_s2_cookie,
        swid_cookie,
        platform_league_id
      )
    `
		)
		.eq('user_id', user.id)
		.eq('league_id', leagueIdNum)
		.single()
		.returns<UserLeagueRow>(); // <-- gives the select a concrete type

	if (dbError || !userLeagueRow) {
		throw error(404, 'League not found or you are not a member');
	}

	try {
		const resp = await fetch(
			`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2024/segments/0/leagues/${userLeagueRow.leagues.platform_league_id}?view=mTeam`,
			{
				headers: {
					Cookie: `espn_s2=${userLeagueRow.leagues.espn_s2_cookie}; SWID=${userLeagueRow.leagues.swid_cookie};`
				}
			}
		);

		if (!resp.ok) throw error(500, 'Failed to fetch team data from ESPN');

		const leagueData: ESPNLeagueResponse = await resp.json();
		const userTeam = leagueData.teams?.find((t) => t.id === userLeagueRow.espn_team_id) ?? null;

		return json({
			team: userTeam,
			league: {
				id: userLeagueRow.leagues.id,
				name: userLeagueRow.leagues.name
			}
		});
	} catch (e) {
		console.error('Failed to fetch team data:', e);
		throw error(500, 'Failed to fetch team data');
	}
};
