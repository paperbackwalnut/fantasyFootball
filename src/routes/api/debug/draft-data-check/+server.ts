// src/routes/api/debug/draft-data-check/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type RawLeague = {
	id: string;
	name: string;
	platform: 'ESPN' | 'Sleeper' | string;
	platform_league_id: string;
	season_year: number;
	draft_started: boolean;
	draft_completed: boolean;
};

type UserLeagueJoined = {
	league_id: string;
	// Supabase can return a single object or an array depending on relationship typing.
	leagues: RawLeague | RawLeague[] | null;
};

type LeagueWithDraftData = {
	id: string;
	name: string;
	platform: string;
	platform_league_id: string;
	season_year: number;
	draft_started: boolean;
	draft_completed: boolean;
	picks_count: number;
	teams_count: number;
	has_draft_data: boolean;
	needs_import: boolean;
};

function normalizeLeague(entry: UserLeagueJoined): RawLeague | null {
	const { leagues } = entry;
	if (!leagues) return null;
	return Array.isArray(leagues) ? (leagues[0] ?? null) : leagues;
}

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	try {
		// Get all user's leagues (joined)
		const { data: userLeagues, error: leaguesError } = await locals.supabase
			.from('user_leagues')
			.select(
				`
				league_id,
				leagues!inner (
					id,
					name,
					platform,
					platform_league_id,
					season_year,
					draft_started,
					draft_completed
				)
			`
			)
			.eq('user_id', user.id);

		if (leaguesError) {
			throw error(500, `Failed to fetch leagues: ${leaguesError.message}`);
		}

		const rows = (userLeagues ?? []) as unknown as UserLeagueJoined[];

		const leaguesWithDraftData: LeagueWithDraftData[] = [];

		for (const ul of rows) {
			const base = normalizeLeague(ul);
			if (!base) continue; // defensive: skip malformed join rows

			let picksCount = 0;
			let teamsCount = 0;

			if (base.platform === 'ESPN') {
				const { count: picks } = await locals.supabase
					.from('espn_draft_picks')
					.select('*', { count: 'exact', head: true })
					.eq('league_id', base.id);

				const { count: teams } = await locals.supabase
					.from('espn_teams')
					.select('*', { count: 'exact', head: true })
					.eq('league_id', base.id);

				picksCount = picks ?? 0;
				teamsCount = teams ?? 0;
			} else if (base.platform === 'Sleeper') {
				const { count: picks } = await locals.supabase
					.from('sleeper_draft_picks')
					.select('*', { count: 'exact', head: true })
					.eq('league_id', base.id);

				const { count: teams } = await locals.supabase
					.from('sleeper_teams')
					.select('*', { count: 'exact', head: true })
					.eq('league_id', base.id);

				picksCount = picks ?? 0;
				teamsCount = teams ?? 0;
			}

			const has_draft_data = picksCount > 0 && teamsCount > 0;
			const needs_import = base.draft_started && (!has_draft_data || !base.draft_completed);

			leaguesWithDraftData.push({
				id: base.id,
				name: base.name,
				platform: base.platform,
				platform_league_id: base.platform_league_id,
				season_year: base.season_year,
				draft_started: base.draft_started,
				draft_completed: base.draft_completed,
				picks_count: picksCount,
				teams_count: teamsCount,
				has_draft_data,
				needs_import
			});
		}

		// Summary stats
		const totalLeagues = leaguesWithDraftData.length;
		const leaguesWithData = leaguesWithDraftData.filter((l) => l.has_draft_data).length;
		const leaguesNeedingImport = leaguesWithDraftData.filter((l) => l.needs_import).length;

		return json({
			debug: true,
			summary: {
				total_leagues: totalLeagues,
				leagues_with_draft_data: leaguesWithData,
				leagues_needing_import: leaguesNeedingImport,
				percent_with_data: totalLeagues > 0 ? Math.round((leaguesWithData / totalLeagues) * 100) : 0
			},
			leagues: leaguesWithDraftData.sort((a, b) => b.season_year - a.season_year),
			recommendations:
				leaguesNeedingImport > 0
					? [
							`${leaguesNeedingImport} leagues need draft data imported`,
							'Use the Import feature to import historical draft data',
							'Only leagues with draft_started=true will show in the live draft view'
						]
					: ['All leagues have draft data imported', 'You can now use the Live Draft view']
		});
	} catch (e) {
		console.error('Draft data check error:', e);
		return json({
			debug: true,
			error: e instanceof Error ? e.message : 'Unknown error'
		});
	}
};
