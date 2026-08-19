import { clearCurrentDraftState, readCurrentDraftState, readSyncStatus } from '$lib/server/espn-sync/store';
import { getDatabase } from '$lib/server/db/database';
import { intelligenceSummary, learnDraftedPlayerPositions } from '$lib/server/player-intelligence';
import { buildDraftAdvice } from '$lib/server/recommendation-engine';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const [state, receiver] = await Promise.all([readCurrentDraftState(), readSyncStatus()]);
	const draft = state as any;
	if (draft?.picks) learnDraftedPlayerPositions(draft.picks);
	const url = (() => { try { return draft?.draftUrl ? new URL(draft.draftUrl) : null; } catch { return null; } })();
	const externalId = url?.searchParams.get('leagueId');
	const seasonYear = Number(url?.searchParams.get('seasonId')) || new Date().getFullYear();
	const advice = draft ? buildDraftAdvice(draft) : { context: null, recommendations: [], market: { sampleSize: 0, windowSize: 0, summary: '', activeRuns: [], signals: [] }, run: null };
	const commandRows = getDatabase().prepare("SELECT key,value_json,updated_at FROM provider_cache WHERE key IN ('espn:draft-command:last-poll','espn:draft-command:last-result','espn:draft-command:pending')").all() as any[];
	const commandValues = Object.fromEntries(commandRows.map((row) => [row.key, { ...JSON.parse(row.value_json), updatedAt: row.updated_at }]));
	const commandBridge = { online: Boolean(commandValues['espn:draft-command:last-poll'] && Date.now() - new Date(commandValues['espn:draft-command:last-poll'].updatedAt).getTime() <= 5000), lastPollAt: commandValues['espn:draft-command:last-poll']?.updatedAt ?? null, pending: commandValues['espn:draft-command:pending'] ?? null, lastResult: commandValues['espn:draft-command:last-result'] ?? null };
	return json(
		{ state: draft ? { ...draft, recommendations: advice.recommendations, market: advice.market, recommendationRun: advice.run, commandBridge, context: advice.context, intelligence: intelligenceSummary(seasonYear) } : null, receiver },
		{ headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } }
	);
};

export const DELETE: RequestHandler = async () => {
	return json(clearCurrentDraftState(), { headers: { 'cache-control': 'no-store' } });
};
