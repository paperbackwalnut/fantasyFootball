// src/routes/api/espn/draft-picks/[leagueId]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const { leagueId } = params;

	const { data: picks, error: dbError } = await locals.supabase
		.from('espn_draft_picks')
		.select(
			`
			pick_number,
			round_number,
			pick_in_round,
			player_name,
			player_position,
			player_nfl_team,
			pick_context,
			position_rank,
			avg_position_pick,
			timestamp,
			espn_teams!inner (
				team_name,
				owner_name
			)
		`
		)
		.eq('league_id', leagueId)
		.order('pick_number', { ascending: true });

	if (dbError) {
		console.error('Database error:', dbError);
		throw error(500, 'Failed to fetch draft picks');
	}

	// Transform the data to flatten the team information
	const transformedPicks = (picks || []).map((pick) => ({
		pick_number: pick.pick_number,
		round_number: pick.round_number,
		pick_in_round: pick.pick_in_round,
		player_name: pick.player_name,
		player_position: pick.player_position,
		player_nfl_team: pick.player_nfl_team,
		pick_context: pick.pick_context,
		position_rank: pick.position_rank,
		avg_position_pick: pick.avg_position_pick,
		timestamp: pick.timestamp,
		team_name: pick.espn_teams?.[0]?.team_name || 'Unknown Team',
		owner_name: pick.espn_teams?.[0]?.owner_name || 'Unknown Owner'
	}));

	return json({ picks: transformedPicks });
};
