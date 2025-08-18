// src/routes/api/sleeper/leagues/+server.ts - Get user's Sleeper leagues
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

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
			sleeper_roster_id,
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
		.eq('platform', 'SLEEPER')
		.order('created_at', { ascending: false, foreignTable: 'leagues' });

	if (dbError) {
		console.error('Database error:', dbError);
		throw error(500, 'Failed to fetch leagues');
	}

	// Flatten the response
	const leagues =
		userLeagues?.map((ul) => ({
			...ul.leagues,
			userRosterId: ul.sleeper_roster_id,
			isOwner: ul.is_owner
		})) || [];

	return json({ leagues });
};
