// src/routes/api/draft-analysis/owner-tendencies/[leagueId]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type Platform = 'ESPN' | 'Sleeper';

type Row = {
	player_position: 'RB' | 'WR' | 'QB' | 'TE' | string;
	pick_context: 'early' | 'middle' | 'late' | string | null;
	round_number: number;
	position_rank: number | null;
	// joined
	leagues: { season_year: number }[]; // Supabase join array
	espn_teams?: { owner_name: string | null }[];
	sleeper_teams?: { owner_name: string | null }[];
};

interface OwnerPattern {
	earlyRB: number;
	earlyWR: number;
	earlyQB: number;
	earlyTE: number;
	totalPicks: number;
	roundOnePicks: string[];
	roundTwoPicks: string[];
	avgRBRound: number[];
	avgWRRound: number[];
	avgQBRound: number[];
	earlyRBPercent?: string;
	earlyWRPercent?: string;
	avgRBRoundCalc?: string;
	avgWRRoundCalc?: string;
	commonR1?: string;
	commonR2?: string;
}

export const GET: RequestHandler = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const { leagueId } = params; // internal leagues.id (uuid)

	// Figure out which platform this league is
	const { data: leagueRow, error: leagueErr } = await locals.supabase
		.from('leagues')
		.select('platform')
		.eq('id', leagueId)
		.single();

	if (leagueErr || !leagueRow) throw error(404, 'League not found');

	const platform = leagueRow.platform as Platform;

	let rows: Row[] = [];

	if (platform === 'ESPN') {
		const { data, error: dbErr } = await locals.supabase
			.from('espn_draft_picks')
			.select(
				`
        player_position,
        pick_context,
        round_number,
        position_rank,
        espn_teams!inner ( owner_name ),
        leagues!inner   ( season_year )
      `
			)
			.eq('league_id', leagueId)
			.order('season_year', { ascending: false, foreignTable: 'leagues' });

		if (dbErr) {
			console.error(dbErr);
			throw error(500, 'Failed to fetch ESPN draft data');
		}
		rows = (data ?? []) as Row[];
	} else {
		// Sleeper
		const { data, error: dbErr } = await locals.supabase
			.from('sleeper_draft_picks')
			.select(
				`
        player_position,
        pick_context,
        round_number,
        position_rank,
        sleeper_teams!inner ( owner_name ),
        leagues!inner       ( season_year )
      `
			)
			.eq('league_id', leagueId)
			.order('season_year', { ascending: false, foreignTable: 'leagues' });

		if (dbErr) {
			console.error(dbErr);
			throw error(500, 'Failed to fetch Sleeper draft data');
		}
		rows = (data ?? []) as Row[];
	}

	// Flatten Supabase's join arrays into a simple shape
	const flattened = rows
		.map((r) => ({
			owner_name:
				platform === 'ESPN'
					? (r.espn_teams?.[0]?.owner_name ?? null)
					: (r.sleeper_teams?.[0]?.owner_name ?? null),
			player_position: r.player_position,
			pick_context: r.pick_context,
			round_number: r.round_number,
			position_rank: r.position_rank,
			season_year: r.leagues?.[0]?.season_year ?? null
		}))
		.filter((p) => !!p.owner_name);

	// Aggregate
	const ownerPatterns: Record<string, OwnerPattern> = {};

	for (const pick of flattened) {
		const owner = pick.owner_name as string;
		ownerPatterns[owner] ??= {
			earlyRB: 0,
			earlyWR: 0,
			earlyQB: 0,
			earlyTE: 0,
			totalPicks: 0,
			roundOnePicks: [],
			roundTwoPicks: [],
			avgRBRound: [],
			avgWRRound: [],
			avgQBRound: []
		};

		const pat = ownerPatterns[owner];
		pat.totalPicks++;

		if (pick.pick_context === 'early') {
			if (pick.player_position === 'RB') pat.earlyRB++;
			else if (pick.player_position === 'WR') pat.earlyWR++;
			else if (pick.player_position === 'QB') pat.earlyQB++;
			else if (pick.player_position === 'TE') pat.earlyTE++;
		}

		if (pick.round_number === 1) pat.roundOnePicks.push(pick.player_position);
		if (pick.round_number === 2) pat.roundTwoPicks.push(pick.player_position);

		if (pick.player_position === 'RB') pat.avgRBRound.push(pick.round_number);
		if (pick.player_position === 'WR') pat.avgWRRound.push(pick.round_number);
		if (pick.player_position === 'QB') pat.avgQBRound.push(pick.round_number);
	}

	// Post-calcs
	for (const owner of Object.keys(ownerPatterns)) {
		const p = ownerPatterns[owner];
		p.earlyRBPercent = ((p.earlyRB / p.totalPicks) * 100).toFixed(1);
		p.earlyWRPercent = ((p.earlyWR / p.totalPicks) * 100).toFixed(1);
		p.avgRBRoundCalc = p.avgRBRound.length ? avg(p.avgRBRound).toFixed(1) : 'N/A';
		p.avgWRRoundCalc = p.avgWRRound.length ? avg(p.avgWRRound ?? p.avgWRRound).toFixed(1) : 'N/A';
		p.commonR1 = mostCommon(p.roundOnePicks);
		p.commonR2 = mostCommon(p.roundTwoPicks);
	}

	return json({ ownerPatterns });
};

function avg(ns: number[]) {
	return ns.reduce((a, b) => a + b, 0) / ns.length;
}
function mostCommon(arr: string[]): string {
	if (!arr.length) return 'N/A';
	const m = new Map<string, number>();
	for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
	let best = arr[0];
	for (const [k, c] of m) if ((m.get(best) ?? 0) < c) best = k;
	return best;
}
