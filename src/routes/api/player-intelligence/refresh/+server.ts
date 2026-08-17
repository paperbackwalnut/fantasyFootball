import { json } from '@sveltejs/kit';
import { refreshSleeperPlayers, sleeperRefreshStatus } from '$lib/server/player-sources/sleeper';
import { consensusRankingStatus, refreshConsensusRankings } from '$lib/server/player-sources/rankings';
import { mflAdpStatus, refreshMflAdp } from '$lib/server/player-sources/adp';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const teamCount = Number(url.searchParams.get('teamCount')) || 10;
	return json({ sleeper: sleeperRefreshStatus(), rankings: consensusRankingStatus(), adp: mflAdpStatus(teamCount) }, { headers: { 'cache-control': 'no-store' } });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const sleeper = await refreshSleeperPlayers();
	const rankings = await refreshConsensusRankings();
	const adp = await refreshMflAdp(Number(body.teamCount) || 10);
	return json({ sleeper, rankings, adp });
};
