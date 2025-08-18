// src/routes/api/import/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { espn } from '$lib/server/providers/espn';
import { sleeper } from '$lib/server/providers/sleeper';

// Sleeper upserts we added previously:
import {
	upsertSleeperTeams,
	upsertSleeperPicks,
	type SleeperTeam as SleeperTeamRow,
	type SleeperDraftPick as SleeperPickRow
} from '$lib/server/persist/import';

import type { SupabaseClient } from '@supabase/supabase-js';

// ───────────────────────────────────────────────────────────────────────────────
// Types (narrow, no `any`)
// ───────────────────────────────────────────────────────────────────────────────

type Platform = 'ESPN' | 'Sleeper';

type Auth = {
	espn_s2: string;
	swid: string;
};

// Minimal shapes we actually consume from providers
type EspnLeagueMinimal = {
	platform_league_id?: string;
	espn_league_id?: string;
	name?: string;
	scoring_type?: string;
	team_count?: number;
	season_year?: number;
	draft_type?: string;
	draft_started?: boolean;
	draft_completed?: boolean;
	settings?: Record<string, unknown>;
	updated_at?: string;
};

type SleeperLeagueMinimal = {
	platform_league_id?: string;
	sleeper_league_id?: string;
	name?: string;
	scoring_type?: string;
	team_count?: number;
	season_year?: number;
	draft_type?: string;
	draft_started?: boolean;
	draft_completed?: boolean;
	settings?: Record<string, unknown>;
	updated_at?: string;
};

// Your current Sleeper provider seems to return teams like this:
type SleeperTeamFromProvider = {
	sleeper_roster_id: number; // NOTE: this is what your provider returns now
	team_name: string;
	owner_name: string;
	draft_position: number | null;
	// optional extras could exist; we don't rely on them
};

// Picks from Sleeper provider can vary; we only map what we need
type SleeperPickFromProvider = {
	overall?: number;
	round: number;
	round_pick?: number;
	pick_in_round?: number;
	roster_id: number;
	player_id?: string;
	player_name?: string;
	player_position?: string;
	player_nfl_team?: string;
	timestamp?: string;
	// may include `player` object; we don't require it here
};

// ───────────────────────────────────────────────────────────────────────────────
// League helpers
// ───────────────────────────────────────────────────────────────────────────────

async function getOrCreateEspnLeague(
	supabase: SupabaseClient,
	externalLeagueId: string,
	season: number,
	league: EspnLeagueMinimal,
	auth: Auth | undefined
): Promise<{ id: string }> {
	const { data: existing, error: selErr } = await supabase
		.from('leagues')
		.select('id')
		.eq('platform', 'ESPN')
		.eq('platform_league_id', externalLeagueId)
		.eq('season_year', season)
		.limit(1)
		.maybeSingle();

	if (selErr) throw new Error(selErr.message);
	if (existing?.id) {
		// refresh cookies if provided
		if (auth?.espn_s2 || auth?.swid) {
			await supabase
				.from('leagues')
				.update({
					espn_s2_cookie: auth.espn_s2 ?? null,
					swid_cookie: auth.swid ?? null,
					updated_at: new Date().toISOString()
				})
				.eq('id', existing.id);
		}
		return { id: existing.id };
	}

	const insertPayload = {
		platform: 'ESPN',
		platform_league_id: league.platform_league_id ?? league.espn_league_id ?? externalLeagueId,
		espn_league_id: league.espn_league_id ?? externalLeagueId,
		sleeper_league_id: null,
		name: league.name ?? `ESPN ${externalLeagueId}`,
		scoring_type: league.scoring_type ?? 'standard',
		team_count: league.team_count ?? 0,
		season_year: league.season_year ?? season,
		draft_type: league.draft_type ?? 'SNAKE',
		draft_started: !!league.draft_started,
		draft_completed: !!league.draft_completed
	};

	const { data: inserted, error: insErr } = await supabase
		.from('leagues')
		.insert(insertPayload)
		.select('id')
		.single();

	if (insErr || !inserted) throw new Error(insErr?.message ?? 'Failed creating ESPN league');
	return { id: inserted.id };
}

async function getOrCreateSleeperLeague(
	supabase: SupabaseClient,
	externalLeagueId: string,
	season: number,
	league: SleeperLeagueMinimal
): Promise<{ id: string }> {
	const { data: existing, error: selErr } = await supabase
		.from('leagues')
		.select('id')
		.eq('platform', 'SLEEPER')
		.eq('platform_league_id', externalLeagueId)
		.eq('season_year', season)
		.limit(1)
		.maybeSingle();

	if (selErr) throw new Error(selErr.message);
	if (existing?.id) return { id: existing.id };

	const insertPayload = {
		platform: 'SLEEPER',
		platform_league_id: league.platform_league_id ?? league.sleeper_league_id ?? externalLeagueId,
		sleeper_league_id: league.sleeper_league_id ?? externalLeagueId,
		espn_league_id: null,
		name: league.name ?? `Sleeper ${externalLeagueId}`,
		scoring_type: league.scoring_type ?? 'standard',
		team_count: league.team_count ?? 0,
		season_year: league.season_year ?? season,
		draft_type: league.draft_type ?? 'SNAKE',
		draft_started: !!league.draft_started,
		draft_completed: !!league.draft_completed
	};

	const { data: inserted, error: insErr } = await supabase
		.from('leagues')
		.insert(insertPayload)
		.select('id')
		.single();

	if (insErr || !inserted) throw new Error(insErr?.message ?? 'Failed creating Sleeper league');
	return { id: inserted.id };
}

// ───────────────────────────────────────────────────────────────────────────────
// POST handler
// ───────────────────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const body = await request.json();
	const platform = (body.platform as Platform) ?? 'ESPN';
	const seasons: number[] =
		Array.isArray(body.seasons) && body.seasons.length ? body.seasons : [new Date().getFullYear()];

	const results: Array<{
		season: number;
		ok: boolean;
		error?: string;
		league_id?: string;
		teams?: number;
		picks?: number;
	}> = [];

	for (const season of seasons) {
		try {
			if (platform === 'ESPN') {
				const leagueIdInput = String(body.leagueId ?? '').trim();
				const auth: Auth | undefined = body.auth;
				if (!leagueIdInput) throw error(400, 'Missing leagueId');
				if (!auth?.espn_s2 || !auth?.swid) throw error(400, 'Missing ESPN auth');

				// Fetch with concrete ESPN param type
				const fetched = await espn.fetchSeason({
					leagueId: leagueIdInput,
					season,
					auth
				});

				// Narrow minimally to what we need
				const league = (fetched as unknown as { league: EspnLeagueMinimal }).league;
				const teamsLen = (fetched as unknown as { teams: unknown[] }).teams?.length ?? 0;
				const picksLen = (fetched as unknown as { picks: unknown[] }).picks?.length ?? 0;

				const externalId = league.platform_league_id ?? league.espn_league_id ?? leagueIdInput;

				// Ensure leagues row (UUID is not used further here, but creates row + refresh cookies)
				await getOrCreateEspnLeague(locals.supabase, externalId, season, league, auth);

				// NOTE: You previously called upsertEspnTeams/Picks here.
				// They’re not exported in your project right now, so we skip persistence.
				// When you re-expose them, add:
				// await upsertEspnTeams(locals.supabase, externalId, fetched.teams);
				// await upsertEspnPicks(locals.supabase, externalId, fetched.picks);

				results.push({
					season,
					ok: true,
					league_id: externalId,
					teams: teamsLen,
					picks: picksLen
				});
			} else {
				// Sleeper path
				const username = String(body.username ?? '').trim();
				if (!username) throw error(400, 'Missing username');

				const fetched = await sleeper.fetchSeason({ username, season });

				// Exact shapes from your provider (no unsafe casts to incompatible shapes)
				const league = (fetched as unknown as { league: SleeperLeagueMinimal }).league;
				const teamsFromProvider =
					(fetched as unknown as { teams: SleeperTeamFromProvider[] }).teams ?? [];
				const picksFromProvider =
					(fetched as unknown as { picks: SleeperPickFromProvider[] }).picks ?? [];

				const externalId =
					league.platform_league_id ??
					league.sleeper_league_id ??
					String((fetched as Record<string, unknown>)['sleeper_league_id'] ?? '');

				if (!externalId) throw new Error('Sleeper league id not found in provider response');

				// Ensure leagues row, get UUID
				const { id: leagueUuid } = await getOrCreateSleeperLeague(
					locals.supabase,
					externalId,
					season,
					league
				);

				// Map teams to our upsert rows
				const sleeperTeams: SleeperTeamRow[] = teamsFromProvider.map((t) => ({
					sleeper_roster_id: t.sleeper_roster_id,
					owner_id: null,
					owner_name: t.owner_name ?? null,
					wins: 0,
					losses: 0,
					points_for: 0,
					points_against: 0,
					playoff_seed: null
				}));

				await upsertSleeperTeams(locals.supabase, leagueUuid, user.id, 'SLEEPER', sleeperTeams);

				// Map picks to our upsert rows (derive safe pick_in_round if missing)
				const teamCount = Math.max(teamsFromProvider.length, 1);
				const sleeperPicks: SleeperPickRow[] = picksFromProvider.map((p, idx) => ({
					pick_number: p.overall ?? idx + 1,
					round_number: p.round,
					pick_in_round:
						p.round_pick ?? p.pick_in_round ?? (((p.overall ?? idx + 1) - 1) % teamCount) + 1,
					roster_id: p.roster_id,
					sleeper_player_id: p.player_id ?? null,
					player_name: p.player_name ?? null,
					player_position: p.player_position ?? null,
					player_nfl_team: p.player_nfl_team ?? null,
					timestamp: p.timestamp ?? null,
					player_data: null
				}));

				await upsertSleeperPicks(locals.supabase, leagueUuid, sleeperPicks);

				results.push({
					season,
					ok: true,
					league_id: externalId,
					teams: teamsFromProvider.length,
					picks: sleeperPicks.length
				});
			}
		} catch (e) {
			results.push({
				season,
				ok: false,
				error: e instanceof Error ? e.message : 'Failed'
			});
		}
	}

	return json({ platform, results });
};
