// src/routes/api/espn/draft-picks/[leagueId]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const { leagueId } = params;

	try {
		// Get picks first - using actual schema columns
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
				team_id
			`
			)
			.eq('league_id', leagueId)
			.order('pick_number', { ascending: true });

		if (dbError) {
			console.error('Database error:', dbError);
			throw error(500, `Failed to fetch draft picks: ${dbError.message}`);
		}

		// Get teams separately
		const { data: teams, error: teamsError } = await locals.supabase
			.from('espn_teams')
			.select(
				`
				espn_team_id,
				team_name,
				owner_name
			`
			)
			.eq('league_id', leagueId);

		if (teamsError) {
			console.warn('Could not fetch teams:', teamsError);
		}

		// Create a team_id to team mapping
		const teamMap = new Map();
		(teams || []).forEach((team) => {
			teamMap.set(team.espn_team_id, {
				team_name: team.team_name || 'Unknown Team',
				owner_name: team.owner_name || 'Unknown Owner'
			});
		});

		// Transform the data and fix position mapping
		const transformedPicks = (picks || []).map((pick) => {
			const teamInfo = teamMap.get(pick.team_id) || {
				team_name: `Team ${pick.team_id}`,
				owner_name: 'Unknown Owner'
			};

			// Fix position mapping - ensure it's not defaulting to FLEX
			let position = pick.player_position;
			if (!position || position === 'FLEX' || position === '') {
				position = 'UNKNOWN';
			}

			return {
				pick_number: pick.pick_number,
				round_number: pick.round_number,
				pick_in_round: pick.pick_in_round,
				player_name: pick.player_name || 'Unknown Player',
				player_position: position,
				player_nfl_team: pick.player_nfl_team,
				pick_context: pick.pick_context || 'average',
				position_rank: pick.position_rank || 0,
				avg_position_pick: pick.avg_position_pick,
				timestamp: new Date().toISOString(), // Default timestamp
				team_name: teamInfo.team_name,
				owner_name: teamInfo.owner_name
			};
		});

		console.log(`Found ${transformedPicks.length} picks for league ${leagueId}`);
		return json({ picks: transformedPicks });
	} catch (e) {
		console.error('Error in draft-picks endpoint:', e);
		return json(
			{
				picks: [],
				error: e instanceof Error ? e.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
