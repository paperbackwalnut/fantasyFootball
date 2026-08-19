import { clearCurrentDraftState, readCurrentDraftState, readSyncStatus, saveRecommendationSnapshot } from '$lib/server/espn-sync/store';
import { getDatabase } from '$lib/server/db/database';
import { deriveLeagueContext } from '$lib/server/espn-sync/league-context.js';
import { intelligenceSummary, learnDraftedPlayerPositions, rankedAvailablePlayers } from '$lib/server/player-intelligence';
import { recommendPlayers } from '$lib/server/recommendations.js';
import { analyzeDraftMarket } from '$lib/server/draft-market.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const [state, receiver] = await Promise.all([readCurrentDraftState(), readSyncStatus()]);
	const draft = state as any;
	if (draft?.picks) learnDraftedPlayerPositions(draft.picks);
	const url = (() => { try { return draft?.draftUrl ? new URL(draft.draftUrl) : null; } catch { return null; } })();
	const externalId = url?.searchParams.get('leagueId');
	const seasonYear = Number(url?.searchParams.get('seasonId')) || new Date().getFullYear();
	const importedLeague = externalId ? getDatabase().prepare('SELECT * FROM leagues WHERE platform=? AND external_id=? AND season_year=?').get('ESPN', externalId, seasonYear) : null;
	const context = draft ? deriveLeagueContext(draft, importedLeague) : null;
	const rankedAvailable = draft && context ? rankedAvailablePlayers(seasonYear, context.teamCount || 10, draft.picks, draft.espnObservedAvailable) : [];
	const market = analyzeDraftMarket(draft?.picks ?? []);
	const recommendations = context ? recommendPlayers(rankedAvailable, context, market) : [];
	if (draft && context) saveRecommendationSnapshot(draft, context, recommendations);
	const commandRows = getDatabase().prepare("SELECT key,value_json,updated_at FROM provider_cache WHERE key IN ('espn:draft-command:last-poll','espn:draft-command:last-result','espn:draft-command:pending')").all() as any[];
	const commandValues = Object.fromEntries(commandRows.map((row) => [row.key, { ...JSON.parse(row.value_json), updatedAt: row.updated_at }]));
	const commandBridge = { online: Boolean(commandValues['espn:draft-command:last-poll'] && Date.now() - new Date(commandValues['espn:draft-command:last-poll'].updatedAt).getTime() <= 5000), lastPollAt: commandValues['espn:draft-command:last-poll']?.updatedAt ?? null, pending: commandValues['espn:draft-command:pending'] ?? null, lastResult: commandValues['espn:draft-command:last-result'] ?? null };
	return json(
		{ state: draft ? { ...draft, availablePlayers: rankedAvailable.length ? rankedAvailable : draft.availablePlayers, recommendations, market, commandBridge, context, intelligence: intelligenceSummary(seasonYear) } : null, receiver },
		{ headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } }
	);
};

export const DELETE: RequestHandler = async () => {
	return json(clearCurrentDraftState(), { headers: { 'cache-control': 'no-store' } });
};
