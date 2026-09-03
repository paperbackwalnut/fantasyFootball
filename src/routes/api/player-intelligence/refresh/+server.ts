import { json } from '@sveltejs/kit';
import { sleeperRefreshStatus } from '$lib/server/player-sources/sleeper';
import { consensusRankingStatus } from '$lib/server/player-sources/rankings';
import { mflAdpStatus } from '$lib/server/player-sources/adp';
import { projectionImportDirectory, providerHealth, refreshPlayerData } from '$lib/server/data-refresh';
import { historicalInjuryStatus } from '$lib/server/player-sources/injury-history';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const teamCount = Number(url.searchParams.get('teamCount')) || 10;
	return json({ sleeper: sleeperRefreshStatus(), rankings: consensusRankingStatus(), adp: mflAdpStatus(teamCount), injuryHistory: historicalInjuryStatus(), health: providerHealth(), projectionImportDirectory: projectionImportDirectory() }, { headers: { 'cache-control': 'no-store' } });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const refreshed = await refreshPlayerData({ force: true, teamCount: Number(body.teamCount) || 10 });
	return json(refreshed);
};
