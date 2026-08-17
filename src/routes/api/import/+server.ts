import { saveLeague } from '$lib/server/db/repositories';
import { espn } from '$lib/server/providers/espn';
import { sleeper } from '$lib/server/providers/sleeper';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const platform = String(body.platform ?? 'ESPN').toUpperCase() as 'ESPN' | 'SLEEPER';
	if (!['ESPN', 'SLEEPER'].includes(platform)) throw error(400, 'Unsupported platform');
	const seasons = Array.isArray(body.seasons) && body.seasons.length ? body.seasons.map(Number) : [new Date().getFullYear()];
	const results = [];
	for (const season of seasons) {
		try {
			const fetched: any = platform === 'ESPN'
				? await espn.fetchSeason({ leagueId: String(body.leagueId ?? ''), season, auth: body.auth })
				: await sleeper.fetchSeason({ username: String(body.username ?? ''), season, leagueId: body.leagueId ? String(body.leagueId) : undefined });
			const league = fetched.league;
			const externalId = String(league.platform_league_id ?? league.espn_league_id ?? body.leagueId ?? '');
			if (!externalId) throw new Error('Provider did not return a league id');
			const teamCount = Number(league.team_count ?? fetched.teams.length);
			const id = saveLeague({
				platform, externalId, seasonYear: Number(league.season_year ?? season), name: league.name,
				teamCount, draftType: league.draft_type, draftStarted: league.draft_started,
				draftCompleted: league.draft_completed, userTeamId: fetched.userTeamId ? String(fetched.userTeamId) : null,
				auth: platform === 'ESPN' ? body.auth : { username: body.username }, settings: league.settings
			}, fetched.teams.map((team: any) => ({
				platformTeamId: String(team.espn_team_id ?? team.sleeper_roster_id),
				name: team.team_name, ownerName: team.owner_name, draftPosition: team.draft_position,
				isUser: String(team.espn_team_id ?? team.sleeper_roster_id) === String(fetched.userTeamId), data: team
			})), fetched.picks.map((pick: any, index: number) => ({
				pickNumber: Number(pick.pick_number ?? index + 1), roundNumber: Number(pick.round_number),
				roundPick: Number(pick.pick_in_round ?? ((index % teamCount) + 1)), teamId: String(pick.team_id ?? ''),
				platformPlayerId: String(pick.espn_player_id ?? pick.sleeper_player_id ?? ''), playerName: pick.player_name,
				position: pick.player_position, nflTeam: pick.player_nfl_team, data: pick.player_data
			})));
			results.push({ season, ok: true, league_id: id, teams: fetched.teams.length, picks: fetched.picks.length });
		} catch (cause) {
			results.push({ season, ok: false, error: cause instanceof Error ? cause.message : 'Import failed' });
		}
	}
	return json({ platform, results });
};
