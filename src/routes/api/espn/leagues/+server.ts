// src/routes/api/espn/leagues/+server.ts - Updated to use user_leagues junction
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const { data: userLeagues, error: dbError } = await locals.supabase
		.from('user_leagues')
		.select(
			`
			league_id,
			espn_team_id,
			is_owner,
			leagues!inner (
				id, 
				name, 
				platform_league_id, 
				team_count, 
				season_year, 
				draft_started, 
				draft_completed,
				created_at,
				updated_at
			)
		`
		)
		.eq('user_id', user.id)
		.eq('platform', 'ESPN')
		.order('created_at', { ascending: false, foreignTable: 'leagues' });

	if (dbError) {
		console.error('Database error:', dbError);
		throw error(500, 'Failed to fetch leagues');
	}

	// Flatten the response
	const leagues = userLeagues.map((ul) => ({
		...ul.leagues,
		userTeamId: ul.espn_team_id,
		isOwner: ul.is_owner
	}));

	return json({ leagues });
};
