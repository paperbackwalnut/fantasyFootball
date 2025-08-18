import type { SupabaseClient } from '@supabase/supabase-js';

// --- Types that match what we actually insert ---
export type SleeperTeam = {
	sleeper_roster_id: number;
	owner_id?: string | null;
	owner_name?: string | null;
	wins?: number | null;
	losses?: number | null;
	points_for?: number | null;
	points_against?: number | null;
	playoff_seed?: number | null;
};

export type SleeperDraftPick = {
	pick_number: number; // overall
	round_number: number;
	pick_in_round: number;
	roster_id: number; // Sleeper roster_id (team)
	sleeper_player_id?: string | null;
	player_name?: string | null;
	player_position?: string | null;
	player_nfl_team?: string | null;
	timestamp?: string | null; // ISO if you have it
	player_data?: Record<string, unknown> | null;
};

/**
 * Upsert Sleeper teams into BOTH `sleeper_teams` (detail) and `teams` (generic mapping).
 * @param supabase        Supabase client
 * @param leagueUuid      UUID from public.leagues.id
 * @param userUuid        Current auth.user.id (required by `teams.user_id`)
 * @param platformLabel   Your enum/string stored in `teams.platform` (use 'SLEEPER')
 * @param teams           Parsed teams from Sleeper
 */
export async function upsertSleeperTeams(
	supabase: SupabaseClient,
	leagueUuid: string,
	userUuid: string,
	platformLabel: 'SLEEPER',
	teams: SleeperTeam[]
) {
	// 1) Replace detail rows in sleeper_teams for this league
	const rosterIds = teams.map((t) => t.sleeper_roster_id);
	if (rosterIds.length) {
		const { error: delErr } = await supabase
			.from('sleeper_teams')
			.delete()
			.eq('league_id', leagueUuid);
		if (delErr) throw delErr;

		const payload = teams.map((t) => ({
			league_id: leagueUuid,
			sleeper_roster_id: t.sleeper_roster_id,
			owner_id: t.owner_id ?? null,
			owner_name: t.owner_name ?? null,
			wins: t.wins ?? 0,
			losses: t.losses ?? 0,
			points_for: t.points_for ?? 0,
			points_against: t.points_against ?? 0,
			playoff_seed: t.playoff_seed ?? null
		}));

		const { error: insErr } = await supabase.from('sleeper_teams').insert(payload);
		if (insErr) throw insErr;
	}

	// 2) Rebuild the generic mapping in `teams` (platform + platform_team_id)
	//    Schema requires: user_id, league_id, platform, platform_team_id, owner_name
	const { error: delTeamsErr } = await supabase
		.from('teams')
		.delete()
		.eq('league_id', leagueUuid)
		.eq('platform', platformLabel);
	if (delTeamsErr) throw delTeamsErr;

	if (teams.length) {
		const genericRows = teams.map((t) => ({
			user_id: userUuid,
			league_id: leagueUuid,
			platform: platformLabel, // 'SLEEPER'
			platform_team_id: String(t.sleeper_roster_id),
			owner_name: t.owner_name ?? null
		}));
		const { error: insTeamsErr } = await supabase.from('teams').insert(genericRows);
		if (insTeamsErr) throw insTeamsErr;
	}
}

/**
 * Upsert Sleeper draft picks into `sleeper_draft_picks` (detail).
 * @param supabase   Supabase client
 * @param leagueUuid UUID from public.leagues.id
 * @param picks      Parsed picks from Sleeper
 */
export async function upsertSleeperPicks(
	supabase: SupabaseClient,
	leagueUuid: string,
	picks: SleeperDraftPick[]
) {
	const { error: delErr } = await supabase
		.from('sleeper_draft_picks')
		.delete()
		.eq('league_id', leagueUuid);
	if (delErr) throw delErr;

	if (!picks.length) return;

	const payload = picks.map((p) => ({
		league_id: leagueUuid,
		pick_number: p.pick_number,
		round_number: p.round_number,
		pick_in_round: p.pick_in_round,
		roster_id: p.roster_id,
		sleeper_player_id: p.sleeper_player_id ?? null,
		player_name: p.player_name ?? null,
		player_position: p.player_position ?? null,
		player_nfl_team: p.player_nfl_team ?? null,
		timestamp: p.timestamp ?? null,
		player_data: p.player_data ?? null
	}));

	const { error: insErr } = await supabase.from('sleeper_draft_picks').insert(payload);
	if (insErr) throw insErr;
}
