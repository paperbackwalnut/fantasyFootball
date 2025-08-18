// src/routes/api/espn/teams/[leagueId]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const { leagueId } = params;

	const { data: teams, error: dbError } = await locals.supabase
		.from('espn_teams')
		.select(
			`
			espn_team_id,
			team_name,
			owner_name,
			draft_position
		`
		)
		.eq('league_id', leagueId)
		.order('draft_position', { ascending: true });

	if (dbError) {
		console.error('Database error:', dbError);
		throw error(500, 'Failed to fetch teams');
	}

	const transformedTeams = (teams || []).map((team) => ({
		id: team.espn_team_id,
		name: team.team_name,
		owner_name: team.owner_name,
		draft_position: team.draft_position
	}));

	return json({ teams: transformedTeams });
};
