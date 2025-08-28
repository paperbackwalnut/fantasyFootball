// src/routes/api/sleeper/teams/[leagueId]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const { leagueId } = params;

	try {
		const { data: teams, error: dbError } = await locals.supabase
			.from('sleeper_teams')
			.select(
				`
				sleeper_roster_id,
				owner_name
			`
			)
			.eq('league_id', leagueId)
			.order('sleeper_roster_id', { ascending: true });

		if (dbError) {
			console.error('Database error:', dbError);
			throw error(500, `Failed to fetch teams: ${dbError.message}`);
		}

		const transformedTeams = (teams || []).map((team, index) => ({
			id: team.sleeper_roster_id,
			name: team.owner_name || `Team ${team.sleeper_roster_id}`, // Use owner_name as team name
			owner_name: team.owner_name || 'Unknown Owner',
			draft_position: index + 1, // Default draft position based on roster order
			roster_id: team.sleeper_roster_id
		}));

		return json({ teams: transformedTeams });
	} catch (e) {
		console.error('Error in sleeper teams endpoint:', e);
		return json(
			{
				teams: [],
				error: e instanceof Error ? e.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
