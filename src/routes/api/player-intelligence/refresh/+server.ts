import { json } from '@sveltejs/kit';
import { refreshSleeperPlayers, sleeperRefreshStatus } from '$lib/server/player-sources/sleeper';
import { consensusRankingStatus, refreshConsensusRankings } from '$lib/server/player-sources/rankings';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json({ sleeper: sleeperRefreshStatus(), rankings: consensusRankingStatus() }, { headers: { 'cache-control': 'no-store' } });

export const POST: RequestHandler = async () => {
	const sleeper = await refreshSleeperPlayers();
	const rankings = await refreshConsensusRankings();
	return json({ sleeper, rankings });
};
