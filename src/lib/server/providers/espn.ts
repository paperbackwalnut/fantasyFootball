// src/lib/server/providers/espn.ts
import {
	fetchEspnPlayers,
	calculatePositionalADP,
	getPositionName,
	getNFLTeamName,
	calculatePositionRank
} from '$lib/server/draft/utils';
import type { Team, Pick } from '$lib/types/espnTypes';

type Auth = { espn_s2: string; swid: string };

export const espn = {
	async fetchSeason({ leagueId, season, auth }: { leagueId: string; season: number; auth: Auth }) {
		const espnUserId = auth.swid.replace(/[{}]/g, '');

		const res = await fetch(
			`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${leagueId}?view=mDraftDetail&view=mSettings&view=mTeam&view=modular&view=mNav&seasonId=${season}`,
			{ headers: { Cookie: `espn_s2=${auth.espn_s2}; SWID=${auth.swid};` } }
		);
		if (!res.ok) throw new Error(`ESPN fetch failed for ${season}`);

		const history = await res.json();
		const leagueData = history?.[0];
		if (!leagueData) throw new Error(`No ESPN data for ${season}`);

		const userTeam = leagueData.teams?.find((t: { owners: string[] }) =>
			t.owners?.some((oid: string) => oid.replace(/[{}]/g, '') === espnUserId)
		);
		if (!userTeam) throw new Error(`You were not a member in ${season}`);

		// league row (matches your upserts)
		const league = {
			platform_league_id: String(leagueId),
			espn_league_id: String(leagueId),
			name: leagueData.settings?.name ?? `ESPN League ${leagueId}`,
			scoring_type: leagueData.settings?.scoringSettings?.scoringType ?? 'standard',
			team_count: leagueData.settings?.size ?? 12,
			season_year: leagueData.seasonId,
			draft_type: leagueData.settings?.draftSettings?.type ?? 'SNAKE',
			draft_started: true,
			draft_completed: true,
			espn_s2_cookie: auth.espn_s2,
			swid_cookie: auth.swid,
			settings: {
				espn_data: leagueData.settings,
				last_synced: new Date().toISOString(),
				season_stats: {
					champion: leagueData.status?.playoffTierType ? 'determined' : 'unknown',
					regular_season_length: leagueData.settings?.scheduleSettings?.matchupPeriodCount,
					playoff_week_start: leagueData.settings?.scheduleSettings?.playoffMatchupPeriodLength
				}
			},
			updated_at: new Date().toISOString()
		};

		// teams (exact columns you’ve been inserting)
		const teams = (leagueData.teams ?? []).map((t: Team) => ({
			espn_team_id: t.id,
			team_name: t.name || `${t.nickname}`,
			owner_name: t.primaryOwner || 'Unknown Owner', // you were storing GUID here; keep match
			draft_position: t.draftDayProjectedRank ?? null,
			espn_owner_ids: t.owners || [],
			final_standing: t.playoffSeed ?? t.rankCalculatedFinal ?? null,
			regular_season_wins: t.record?.overall?.wins ?? 0,
			regular_season_losses: t.record?.overall?.losses ?? 0,
			points_for: t.record?.overall?.pointsFor ?? 0,
			points_against: t.record?.overall?.pointsAgainst ?? 0
		}));

		// picks (enhanced like your history route)
		const picksSrc = leagueData.draftDetail?.picks ?? [];
		const playerIds = [...new Set(picksSrc.map((p: Pick) => p.playerId))];
		const playerDataMap = await fetchEspnPlayers(
			playerIds as string[],
			season,
			auth.espn_s2,
			auth.swid
		);
		const positionADP = calculatePositionalADP(picksSrc, playerDataMap);
		const size = leagueData.settings?.size ?? 12;

		const picks = picksSrc.map((pick: Pick, index: number) => {
			const playerInfo = playerDataMap.get(pick.playerId);
			const pickNumber = pick.overallPickNumber ?? index + 1;
			const position = playerInfo?.defaultPositionId ?? playerInfo?.eligibleSlots?.[0];
			const posName = getPositionName(position);
			const avgPickForPos = positionADP[posName] ?? pickNumber;
			const pickContext =
				pickNumber < avgPickForPos - 12
					? 'early'
					: pickNumber > avgPickForPos + 12
						? 'late'
						: 'average';

			return {
				pick_number: pickNumber,
				round_number: pick.roundId ?? Math.ceil(pickNumber / size),
				pick_in_round: pick.roundPickNumber ?? ((pickNumber - 1) % size) + 1,
				team_id: pick.teamId,
				espn_player_id: String(pick.playerId),
				player_name: playerInfo?.fullName ?? 'Unknown Player',
				player_position: posName,
				player_nfl_team: playerInfo?.proTeamId ? getNFLTeamName(playerInfo.proTeamId) : null,
				position_rank: calculatePositionRank(pickNumber, posName, picksSrc, playerDataMap),
				pick_context: pickContext,
				avg_position_pick: avgPickForPos,
				player_data: playerInfo ?? null
			};
		});

		return { league, teams, picks, userTeamId: userTeam.id as number };
	}
};
