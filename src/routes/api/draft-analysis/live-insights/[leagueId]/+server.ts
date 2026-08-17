import { getLeaguePicks } from '$lib/server/db/repositories';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const picks = getLeaguePicks(params.leagueId);
	const positionBreakdown: Record<string, number> = {};
	for (const pick of picks) positionBreakdown[pick.player_position || 'UNKNOWN'] = (positionBreakdown[pick.player_position || 'UNKNOWN'] ?? 0) + 1;
	const recent = picks.slice(-4);
	const insights = Object.entries(recent.reduce<Record<string, number>>((out, pick) => ({ ...out, [pick.player_position]: (out[pick.player_position] ?? 0) + 1 }), {}))
		.filter(([, count]) => count >= 3).map(([position, count]) => ({ type: 'position_run', message: `${position} Run: ${count} in the last 4 picks`, severity: 'info' }));
	return json({ positionBreakdown, pickContextStats: {}, roundAnalysis: [], insights, totalPicks: picks.length, lastUpdated: new Date().toISOString() });
};
