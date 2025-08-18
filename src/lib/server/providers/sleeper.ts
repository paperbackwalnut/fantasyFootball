import type {
	SleeperUser,
	SleeperLeague,
	SleeperUserInLeague,
	SleeperRoster,
	SleeperPick
} from '../../types/sleeperTypes';
type SleeperPickWire = Omit<SleeperPick, 'roster_id'> & {
	roster_id: string | number;
};

function api(path: string) {
	return fetch(`https://api.sleeper.app${path}`, { cache: 'no-store' });
}

function scoringTypeFromSettings(s?: Record<string, unknown>): string {
	const ppr = Number(s?.ppr ?? 0);
	if (ppr >= 1) return 'ppr';
	if (ppr >= 0.5) return 'half';
	return 'standard';
}

function posName(p?: string) {
	const up = (p || '').toUpperCase();
	return ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST', 'FLEX', 'LB', 'DL', 'DB', 'IDP'].includes(up)
		? up
		: 'FLEX';
}

function positionalADP(
	picks: Array<{ overall: number; position: string }>
): Record<string, number> {
	const buckets: Record<string, number[]> = {};
	for (const p of picks) (buckets[posName(p.position)] ||= []).push(p.overall);
	const out: Record<string, number> = {};
	for (const k in buckets) {
		const arr = buckets[k];
		out[k] = arr.reduce((a, b) => a + b, 0) / arr.length;
	}
	return out;
}

type PickNormalized = {
	overall: number;
	round: number;
	pick_in_round: number;
	roster_id: number;
	player_id: string;
	position: string;
	team: string | null;
	player_name: string;
};

export const sleeper = {
	async fetchSeason({
		username,
		season,
		leagueId
	}: {
		username: string;
		season: number;
		leagueId?: string;
	}) {
		// 1) user
		const uRes = await api(`/v1/user/${encodeURIComponent(username)}`);
		if (!uRes.ok) throw new Error(`Sleeper: user lookup failed (${uRes.status})`);
		const u = (await uRes.json()) as SleeperUser;
		if (!u?.user_id) throw new Error('Sleeper: user not found');

		// 2) leagues
		const lRes = await api(`/v1/user/${u.user_id}/leagues/nfl/${season}`);
		if (!lRes.ok) throw new Error(`Sleeper: leagues fetch failed (${lRes.status})`);
		const leagues = (await lRes.json()) as SleeperLeague[];

		let league: SleeperLeague | undefined;
		if (leagueId) {
			league = leagues.find((l) => String(l.league_id) === String(leagueId));
			if (!league) throw new Error(`Sleeper: league ${leagueId} not found for user in ${season}`);
		} else {
			if (leagues.length === 0) throw new Error(`Sleeper: no leagues for ${username} in ${season}`);
			if (leagues.length > 1) {
				const names = leagues.map((l) => `${l.name} (${l.league_id})`).join(', ');
				throw new Error(`Multiple leagues in ${season}. Specify one: ${names}`);
			}
			league = leagues[0];
		}

		// 3) users + rosters
		const [usersRes, rostersRes] = await Promise.all([
			api(`/v1/league/${league.league_id}/users`),
			api(`/v1/league/${league.league_id}/rosters`)
		]);
		if (!usersRes.ok || !rostersRes.ok) throw new Error('Sleeper: users/rosters fetch failed');
		const users = (await usersRes.json()) as SleeperUserInLeague[];
		const rosters = (await rostersRes.json()) as SleeperRoster[];

		const myRoster = rosters.find((r) => r.owner_id && r.owner_id === u.user_id) || null;

		// 4) draft + picks
		let draftId = league.draft_id || null;
		if (!draftId) {
			const dlist = await api(`/v1/league/${league.league_id}/drafts`);
			if (dlist.ok) {
				const arr = (await dlist.json()) as Array<{ draft_id: string }>;
				draftId = arr?.[0]?.draft_id || null;
			}
		}

		let rawPicks: SleeperPick[] = [];
		if (draftId) {
			const pRes = await api(`/v1/draft/${draftId}/picks`);
			if (pRes.ok) {
				const json = (await pRes.json()) as SleeperPickWire[]; // raw API may have roster_id as string
				rawPicks = json.map((p) => ({ ...p, roster_id: Number(p.roster_id) })) as SleeperPick[];
			}
		}

		const size = Number(league.total_rosters || 12);

		// normalize picks (trust round & pick_no from API)
		const picksNormalized: PickNormalized[] = rawPicks.map((p) => {
			const position = p.metadata?.position || 'FLEX';
			const team = p.metadata?.team ?? null;
			const player_name =
				[p.metadata?.first_name, p.metadata?.last_name].filter(Boolean).join(' ') ||
				String(p.player_id);

			return {
				overall: (p.round - 1) * size + p.pick_no,
				round: p.round,
				pick_in_round: p.pick_no,
				roster_id: p.roster_id,
				player_id: p.player_id,
				position,
				team,
				player_name
			};
		});

		// compute positional ADP + context
		const adp = positionalADP(
			picksNormalized.map((p) => ({ overall: p.overall, position: p.position }))
		);

		const picks = picksNormalized.map((p) => {
			const avgForPos = adp[p.position] ?? p.overall;
			const ctx =
				p.overall < avgForPos - size ? 'early' : p.overall > avgForPos + size ? 'late' : 'average';

			const rank = picksNormalized.filter(
				(q) => q.position === p.position && q.overall <= p.overall
			).length;

			return {
				pick_number: p.overall,
				round_number: p.round,
				pick_in_round: p.pick_in_round,
				team_id: p.roster_id,
				sleeper_player_id: p.player_id,
				player_name: p.player_name,
				player_position: p.position,
				player_nfl_team: p.team,
				position_rank: rank,
				pick_context: ctx,
				avg_position_pick: adp[p.position] ?? null,
				player_data: null
			};
		});

		// teams (roster ↔ owner)
		const nameByUser: Record<string, string> = {};
		for (const usr of users) nameByUser[usr.user_id] = usr.display_name || usr.username || '';

		const teams = rosters.map((r) => ({
			sleeper_roster_id: r.roster_id,
			team_name: nameByUser[r.owner_id || ''] || `Roster ${r.roster_id}`,
			owner_name: nameByUser[r.owner_id || ''] || 'Unknown Owner',
			draft_position: r.draft_slot ?? null
		}));

		// league row
		const leagueRow = {
			platform_league_id: String(league.league_id),
			name: league.name || `Sleeper ${league.league_id}`,
			scoring_type: scoringTypeFromSettings(league.settings),
			team_count: league.total_rosters || teams.length || 12,
			season_year: Number(league.season || season),
			draft_type: 'SNAKE',
			draft_started: Boolean(draftId && rawPicks.length > 0),
			draft_completed: Boolean(draftId && rawPicks.length > 0),
			settings: { sleeper_data: league, last_synced: new Date().toISOString() },
			updated_at: new Date().toISOString()
		};

		return {
			league: leagueRow,
			teams,
			picks,
			userTeamId: myRoster?.roster_id ?? null
		};
	}
};
