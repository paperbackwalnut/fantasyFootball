// src/routes/api/sleeper/import-history/+server.ts - Sleeper History Import
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const { username, seasons } = await request.json();

	if (!username) {
		throw error(400, 'Missing required field: username');
	}

	// Default to last 3 seasons if not specified
	const seasonsToImport = seasons || [2024, 2023, 2022];
	const results = [];

	try {
		// Get Sleeper user ID from username
		const sleeperUser = await getSleeperUser(username);
		if (!sleeperUser) {
			throw error(404, 'Sleeper user not found');
		}

		// Update user profile with Sleeper ID
		await locals.supabase.from('profiles').upsert({
			id: user.id,
			sleeper_user_id: sleeperUser.user_id
		});

		// Import each season
		for (const season of seasonsToImport) {
			console.log(`Importing Sleeper season ${season}...`);

			try {
				const seasonResult = await importSleeperSeason(locals.supabase, {
					sleeperUserId: sleeperUser.user_id,
					season,
					userId: user.id
				});

				results.push({
					season,
					success: true,
					...seasonResult
				});
			} catch (seasonError) {
				console.error(`Failed to import season ${season}:`, seasonError);
				results.push({
					season,
					success: false,
					error: (seasonError as Error).message || 'Unknown error'
				});
			}
		}

		return json({
			success: true,
			results,
			totalSeasons: seasonsToImport.length,
			successCount: results.filter((r) => r.success).length
		});
	} catch (e) {
		console.error('Sleeper import error:', e);
		throw error(500, 'Sleeper import failed');
	}
};

async function getSleeperUser(username: string) {
	try {
		const response = await fetch(`https://api.sleeper.app/v1/user/${username}`);
		if (response.ok) {
			return await response.json();
		}
		return null;
	} catch (e) {
		console.error('Failed to get Sleeper user:', e);
		return null;
	}
}

async function importSleeperSeason(
	supabase: SupabaseClient,
	params: {
		sleeperUserId: string;
		season: number;
		userId: string;
	}
) {
	const { sleeperUserId, season, userId } = params;

	// Get user's leagues for this season with rate limiting
	const response = await rateLimitedFetch(
		`https://api.sleeper.app/v1/user/${sleeperUserId}/leagues/nfl/${season}`
	);
	if (!response.ok) {
		throw new Error(`Failed to fetch leagues for ${season}`);
	}

	const leagues = await response.json();
	if (!leagues || leagues.length === 0) {
		throw new Error(`No leagues found for ${season}`);
	}

	let totalImported = 0;
	const importedLeagues = [];

	// Import each league the user was in (with rate limiting)
	for (const league of leagues) {
		try {
			// Add delay between league imports to respect rate limits
			await new Promise((resolve) => setTimeout(resolve, 200));

			const leagueResult = await importSleeperLeague(supabase, {
				league,
				season,
				userId,
				sleeperUserId
			});

			importedLeagues.push(leagueResult);
			totalImported++;
		} catch (leagueError) {
			console.warn(`Failed to import league ${league.league_id}:`, leagueError);
		}
	}

	return {
		leagues: importedLeagues,
		totalLeagues: leagues.length,
		importedCount: totalImported
	};
}
type LeagueSubset = {
	league_id: string;
	name: string;
	total_rosters: number;
	status: string;
	draft_id?: string;
	scoring_settings?: { rec?: number };
};

async function importSleeperLeague(
	supabase: SupabaseClient,
	params: {
		league: LeagueSubset;
		season: number;
		userId: string;
		sleeperUserId: string;
	}
) {
	const { league, season, userId, sleeperUserId } = params;

	// Store league data
	const { data: storedLeague, error: leagueError } = await supabase
		.from('leagues')
		.upsert(
			{
				platform: 'SLEEPER',
				platform_league_id: league.league_id,
				sleeper_league_id: league.league_id,
				name: league.name,
				scoring_type: league.scoring_settings?.rec ? 'ppr' : 'standard',
				team_count: league.total_rosters,
				season_year: season,
				draft_type: league.draft_id ? 'SNAKE' : 'UNKNOWN',
				draft_started: league.status !== 'pre_draft',
				draft_completed: league.status === 'complete',
				settings: {
					sleeper_data: league,
					last_synced: new Date().toISOString()
				},
				updated_at: new Date().toISOString()
			},
			{
				onConflict: 'platform,platform_league_id,season_year'
			}
		)
		.select()
		.single();

	if (leagueError) {
		throw new Error(`Failed to save league: ${leagueError.message}`);
	}

	// Get and store rosters/teams with rate limiting
	let userRoster = null;
	const rostersResponse = await rateLimitedFetch(
		`https://api.sleeper.app/v1/league/${league.league_id}/rosters`
	);
	if (rostersResponse.ok) {
		const rosters = await rostersResponse.json();
		userRoster = rosters.find((r: { owner_id: string }) => r.owner_id === sleeperUserId);

		// Get users for owner names with rate limiting
		const usersResponse = await rateLimitedFetch(
			`https://api.sleeper.app/v1/league/${league.league_id}/users`
		);
		let users = [];
		if (usersResponse.ok) {
			users = await usersResponse.json();
		}

		// Store teams
		for (const roster of rosters) {
			const owner = users.find((u: { user_id: string }) => u.user_id === roster.owner_id);
			await supabase.from('sleeper_teams').upsert(
				{
					league_id: storedLeague.id,
					sleeper_roster_id: roster.roster_id,
					owner_id: roster.owner_id,
					owner_name: owner?.display_name || owner?.username || 'Unknown',
					wins: roster.settings?.wins || 0,
					losses: roster.settings?.losses || 0,
					points_for: roster.settings?.fpts || 0,
					points_against: roster.settings?.fpts_against || 0,
					playoff_seed: roster.settings?.rank
				},
				{
					onConflict: 'league_id,sleeper_roster_id'
				}
			);
		}
	}

	// Store user-league association
	if (userRoster) {
		await supabase.from('user_leagues').upsert(
			{
				user_id: userId,
				league_id: storedLeague.id,
				sleeper_roster_id: userRoster.roster_id,
				is_owner: true
			},
			{
				onConflict: 'user_id,league_id'
			}
		);
	}

	// Import draft if available
	let draftPicks = 0;
	if (league.draft_id) {
		draftPicks = await importSleeperDraft(supabase, {
			draftId: league.draft_id,
			leagueId: storedLeague.id,
			season
		});
	}

	return {
		id: storedLeague.id,
		name: league.name,
		teams: league.total_rosters,
		draftPicks,
		userRoster: userRoster
			? {
					id: userRoster.roster_id,
					wins: userRoster.settings?.wins || 0,
					losses: userRoster.settings?.losses || 0,
					rank: userRoster.settings?.rank
				}
			: null
	};
}

async function importSleeperDraft(
	supabase: SupabaseClient,
	params: {
		draftId: string;
		leagueId: string;
		season: number;
	}
) {
	const { draftId, leagueId, season } = params;
	console.log(`draftId ${draftId}, leagueId ${leagueId}, season ${season}`);

	try {
		// Get draft picks
		const response = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
		if (!response.ok) return 0;

		const picks = await response.json();
		if (!picks || picks.length === 0) return 0;

		// Get cached player data from our database
		let playersData = await getCachedPlayerData(supabase);

		// If no cached data or it's old, fetch fresh data
		if (!playersData) {
			playersData = await fetchAndCachePlayerData(supabase);
		}

		// Process and store picks
		type Pick = {
			player_id: string;
			picked_by: string;
			pick_no: number;
			round: number;
			draft_slot: number;
			roster_id: number;
			metadata: Metadata;
		};

		type Metadata = Record<
			| 'team'
			| 'status'
			| 'sport'
			| 'position'
			| 'player_id'
			| 'number'
			| 'news_updated'
			| 'last_name'
			| 'injury_status'
			| 'first_name',
			string
		>;
		const picksToInsert = picks.map((pick: Pick) => {
			const player = playersData[pick.player_id] || pick.metadata || {};

			return {
				league_id: leagueId,
				pick_number: pick.pick_no,
				round_number: pick.round,
				pick_in_round: pick.draft_slot,
				roster_id: pick.roster_id,
				sleeper_player_id: pick.player_id,
				player_name: pick.metadata
					? `${pick.metadata.first_name || ''} ${pick.metadata.last_name || ''}`.trim()
					: `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown',
				player_position: pick.metadata?.position || player.position || 'FLEX',
				player_nfl_team: pick.metadata?.team || player.team || null,
				timestamp: new Date().toISOString(),
				player_data: pick.metadata || player
			};
		});

		const { error: picksError } = await supabase.from('sleeper_draft_picks').upsert(picksToInsert, {
			onConflict: 'league_id,pick_number'
		});

		if (picksError) {
			console.warn('Failed to save Sleeper draft picks:', picksError);
			return 0;
		}

		return picks.length;
	} catch (error) {
		console.warn('Failed to import draft:', error);
		return 0;
	}
}

async function getCachedPlayerData(supabase: SupabaseClient) {
	try {
		// Check if we have recent player data (within 24 hours)
		const { data: cachedData, error } = await supabase
			.from('sleeper_player_cache')
			.select('player_data, updated_at')
			.order('updated_at', { ascending: false })
			.limit(1)
			.single();

		if (error || !cachedData) return null;

		// Check if data is less than 24 hours old
		const cacheAge = Date.now() - new Date(cachedData.updated_at).getTime();
		const isStale = cacheAge > 24 * 60 * 60 * 1000; // 24 hours in ms

		if (isStale) {
			console.log('Player cache is stale, will fetch fresh data');
			return null;
		}

		console.log('Using cached player data');
		return cachedData.player_data;
	} catch (error) {
		console.warn('Error checking player cache:', error);
		return null;
	}
}

async function fetchAndCachePlayerData(supabase: SupabaseClient) {
	try {
		console.log('Fetching fresh Sleeper player data (once per day)...');

		// Add delay to respect rate limits
		await new Promise((resolve) => setTimeout(resolve, 1000));

		const response = await fetch('https://api.sleeper.app/v1/players/nfl');
		if (!response.ok) {
			throw new Error('Failed to fetch player data');
		}

		const playersData = await response.json();

		// Cache the data in our database
		await supabase.from('sleeper_player_cache').upsert({
			id: 'nfl_players',
			player_data: playersData,
			updated_at: new Date().toISOString()
		});

		console.log('Player data cached successfully');
		return playersData;
	} catch (error) {
		console.error('Failed to fetch/cache player data:', error);
		return {};
	}
}

// Add rate limiting between API calls
async function rateLimitedFetch(url: string, delayMs = 100) {
	await new Promise((resolve) => setTimeout(resolve, delayMs));
	return fetch(url);
}
