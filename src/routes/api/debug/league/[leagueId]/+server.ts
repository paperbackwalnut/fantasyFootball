// src/routes/api/debug/league/[leagueId]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const { leagueId } = params;

	try {
		// Get league info
		const { data: league, error: leagueError } = await locals.supabase
			.from('leagues')
			.select('*')
			.eq('id', leagueId)
			.single();

		if (leagueError) {
			return json({
				debug: true,
				error: `League not found: ${leagueError.message}`,
				leagueId,
				userId: user.id
			});
		}

		// Check if user has access to this league
		const { data: userLeague, error: userLeagueError } = await locals.supabase
			.from('user_leagues')
			.select('*')
			.eq('user_id', user.id)
			.eq('league_id', leagueId)
			.single();

		// Get ESPN draft picks if ESPN league
		let espnPicksCount = 0;
		let espnTeamsCount = 0;
		let espnPicksSample = null;
		let espnTeamsSample = null;

		if (league?.platform === 'ESPN') {
			// Count picks
			const { count: picksCount } = await locals.supabase
				.from('espn_draft_picks')
				.select('*', { count: 'exact', head: true })
				.eq('league_id', leagueId);
			espnPicksCount = picksCount || 0;

			// Get sample picks
			const { data: picks } = await locals.supabase
				.from('espn_draft_picks')
				.select('*')
				.eq('league_id', leagueId)
				.limit(3);
			espnPicksSample = picks;

			// Count teams
			const { count: teamsCount } = await locals.supabase
				.from('espn_teams')
				.select('*', { count: 'exact', head: true })
				.eq('league_id', leagueId);
			espnTeamsCount = teamsCount || 0;

			// Get sample teams
			const { data: teams } = await locals.supabase
				.from('espn_teams')
				.select('*')
				.eq('league_id', leagueId)
				.limit(3);
			espnTeamsSample = teams;
		}

		// Get Sleeper draft picks if Sleeper league
		let sleeperPicksCount = 0;
		let sleeperTeamsCount = 0;
		let sleeperPicksSample = null;
		let sleeperTeamsSample = null;

		if (league?.platform === 'Sleeper') {
			// Count picks
			const { count: picksCount } = await locals.supabase
				.from('sleeper_draft_picks')
				.select('*', { count: 'exact', head: true })
				.eq('league_id', leagueId);
			sleeperPicksCount = picksCount || 0;

			// Get sample picks
			const { data: picks } = await locals.supabase
				.from('sleeper_draft_picks')
				.select('*')
				.eq('league_id', leagueId)
				.limit(3);
			sleeperPicksSample = picks;

			// Count teams
			const { count: teamsCount } = await locals.supabase
				.from('sleeper_teams')
				.select('*', { count: 'exact', head: true })
				.eq('league_id', leagueId);
			sleeperTeamsCount = teamsCount || 0;

			// Get sample teams
			const { data: teams } = await locals.supabase
				.from('sleeper_teams')
				.select('*')
				.eq('league_id', leagueId)
				.limit(3);
			sleeperTeamsSample = teams;
		}

		// Check if league was ever imported with draft data
		const draftDataExists =
			(league?.platform === 'ESPN' && espnPicksCount > 0) ||
			(league?.platform === 'Sleeper' && sleeperPicksCount > 0);

		return json({
			debug: true,
			leagueId,
			userId: user.id,
			league: {
				id: league.id,
				name: league.name,
				platform: league.platform,
				platform_league_id: league.platform_league_id,
				season_year: league.season_year,
				draft_started: league.draft_started,
				draft_completed: league.draft_completed,
				team_count: league.team_count
			},
			userLeague: userLeague
				? {
						has_access: true,
						espn_team_id: userLeague.espn_team_id,
						sleeper_roster_id: userLeague.sleeper_roster_id,
						is_owner: userLeague.is_owner
					}
				: {
						has_access: false,
						error: userLeagueError?.message
					},
			draftData: {
				exists: draftDataExists,
				espn: {
					picks_count: espnPicksCount,
					teams_count: espnTeamsCount,
					sample_picks: espnPicksSample,
					sample_teams: espnTeamsSample
				},
				sleeper: {
					picks_count: sleeperPicksCount,
					teams_count: sleeperTeamsCount,
					sample_picks: sleeperPicksSample,
					sample_teams: sleeperTeamsSample
				}
			},
			recommendations: {
				needs_import: !draftDataExists,
				platform_specific:
					league?.platform === 'ESPN'
						? 'Use the ESPN import feature to import draft data for this league'
						: 'Use the Sleeper import feature to import draft data for this league'
			}
		});
	} catch (e) {
		console.error('Debug endpoint error:', e);
		return json({
			debug: true,
			error: e instanceof Error ? e.message : 'Unknown error',
			leagueId,
			userId: user.id
		});
	}
};
