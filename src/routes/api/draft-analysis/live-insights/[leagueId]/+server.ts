// src/routes/api/draft-analysis/live-insights/[leagueId]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type PickContext = 'early' | 'average' | 'late';

type DraftPick = {
	pick_number: number;
	round_number: number;
	player_position: string;
	pick_context?: PickContext | null;
	position_rank?: number | null;
	avg_position_pick?: number | null;
};

type LiveInsight = {
	type: string;
	message: string;
	severity: 'info' | 'positive' | 'warning';
};

export const GET: RequestHandler = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const { leagueId } = params;

	try {
		// Determine platform for this league
		const { data: leagueData, error: leagueError } = await locals.supabase
			.from('leagues')
			.select('platform')
			.eq('id', leagueId)
			.single();

		if (leagueError || !leagueData) {
			throw error(404, 'League not found');
		}

		const platform = leagueData.platform;
		let picks: DraftPick[] = [];

		if (platform === 'ESPN') {
			// Get ESPN picks with available columns
			const { data: espnPicks, error: picksError } = await locals.supabase
				.from('espn_draft_picks')
				.select(
					`
					pick_number,
					round_number,
					player_position,
					pick_context,
					position_rank,
					avg_position_pick
				`
				)
				.eq('league_id', leagueId)
				.order('pick_number', { ascending: true });

			if (picksError) {
				console.error('Database error:', picksError);
				throw error(500, `Failed to fetch draft data: ${picksError.message}`);
			}
			picks = (espnPicks || []) as DraftPick[];
		} else if (platform === 'Sleeper') {
			// Get Sleeper picks with available columns (no pick_context)
			const { data: sleeperPicks, error: picksError } = await locals.supabase
				.from('sleeper_draft_picks')
				.select(
					`
					pick_number,
					round_number,
					player_position
				`
				)
				.eq('league_id', leagueId)
				.order('pick_number', { ascending: true });

			if (picksError) {
				console.error('Database error:', picksError);
				throw error(500, `Failed to fetch draft data: ${picksError.message}`);
			}

			// Add default values for missing columns
			picks = (sleeperPicks || []).map((pick) => ({
				...pick,
				pick_context: 'average' as PickContext,
				position_rank: 0,
				avg_position_pick: null
			})) as DraftPick[];
		}

		// Calculate analytics
		const positionBreakdown: Record<string, number> = {};
		const pickContextStats: Record<string, number> = { early: 0, average: 0, late: 0 };
		const roundAnalysis: Array<{ round: number; picks: number; avgPositionValue: number }> = [];

		// Process picks for analytics
		picks.forEach((pick) => {
			// Position breakdown - fix FLEX issue
			let position = pick.player_position;
			if (!position || position === 'FLEX' || position === '') {
				position = 'UNKNOWN';
			}
			positionBreakdown[position] = (positionBreakdown[position] || 0) + 1;

			// Pick context stats (only for platforms that have this data)
			if (pick.pick_context) {
				pickContextStats[pick.pick_context] = (pickContextStats[pick.pick_context] || 0) + 1;
			}
		});

		// Round analysis
		const picksByRound: Record<number, DraftPick[]> = {};
		picks.forEach((pick) => {
			if (!picksByRound[pick.round_number]) {
				picksByRound[pick.round_number] = [];
			}
			picksByRound[pick.round_number].push(pick);
		});

		Object.entries(picksByRound).forEach(([round, roundPicks]) => {
			const avgValue =
				roundPicks.reduce((sum, pick) => {
					const value = pick.avg_position_pick ? pick.avg_position_pick - pick.pick_number : 0;
					return sum + value;
				}, 0) / roundPicks.length;

			roundAnalysis.push({
				round: parseInt(round),
				picks: roundPicks.length,
				avgPositionValue: avgValue
			});
		});

		// Generate insights based on recent picks (last 10)
		const recentPicks = picks.slice(-10);
		const insights = generateLiveInsights(recentPicks, picks);

		return json({
			positionBreakdown,
			pickContextStats,
			roundAnalysis: roundAnalysis.sort((a, b) => a.round - b.round),
			insights,
			totalPicks: picks.length,
			lastUpdated: new Date().toISOString(),
			platform // Include platform info for debugging
		});
	} catch (e) {
		console.error('Error in live-insights endpoint:', e);
		return json(
			{
				positionBreakdown: {},
				pickContextStats: { early: 0, average: 0, late: 0 },
				roundAnalysis: [],
				insights: [],
				totalPicks: 0,
				error: e instanceof Error ? e.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

function generateLiveInsights(recentPicks: DraftPick[], allPicks: DraftPick[]): LiveInsight[] {
	const insights: LiveInsight[] = [];

	// Check for position runs
	if (recentPicks.length >= 4) {
		const last4Positions = recentPicks.slice(-4).map((p) => p.player_position);
		const positionCounts: Record<string, number> = {};
		last4Positions.forEach((pos) => {
			positionCounts[pos] = (positionCounts[pos] || 0) + 1;
		});

		Object.entries(positionCounts).forEach(([position, count]) => {
			if (count >= 3) {
				insights.push({
					type: 'position_run',
					message: `${position} Run: ${count} ${position}s taken in last 4 picks`,
					severity: 'info'
				});
			}
		});
	}

	// Check for value picks (players going significantly below ADP)
	const valuePicks = recentPicks.filter(
		(pick) => pick.avg_position_pick && pick.avg_position_pick - pick.pick_number > 12
	);
	if (valuePicks.length > 0) {
		insights.push({
			type: 'value_alert',
			message: `Value Alert: ${valuePicks.length} players drafted below ADP in recent picks`,
			severity: 'positive'
		});
	}

	// Check for reaches (players going significantly above ADP)
	const reaches = recentPicks.filter(
		(pick) => pick.avg_position_pick && pick.pick_number - pick.avg_position_pick > 12
	);
	if (reaches.length > 0) {
		insights.push({
			type: 'reach_alert',
			message: `Reach Alert: ${reaches.length} players drafted above ADP recently`,
			severity: 'warning'
		});
	}

	// Check QB trend
	const qbPicks = allPicks.filter((p) => p.player_position === 'QB');
	if (qbPicks.length > 0) {
		const avgQBPick = qbPicks.reduce((sum, pick) => sum + pick.pick_number, 0) / qbPicks.length;
		const expectedQBPick =
			qbPicks.reduce((sum, pick) => sum + (pick.avg_position_pick || pick.pick_number), 0) /
			qbPicks.length;

		if (avgQBPick > expectedQBPick + 6) {
			insights.push({
				type: 'trend',
				message: 'Trend: QBs going later than ADP - opportunity for value',
				severity: 'positive'
			});
		}
	}

	return insights;
}
