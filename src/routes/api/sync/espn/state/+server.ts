import { readCurrentDraftState, readSyncStatus } from '$lib/server/espn-sync/store';
import { getDatabase } from '$lib/server/db/database';
import { deriveLeagueContext } from '$lib/server/espn-sync/league-context.js';
import { intelligenceSummary, learnDraftedPlayerPositions, rankedAvailablePlayers } from '$lib/server/player-intelligence';
import { recommendPlayers } from '$lib/server/recommendations.js';
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
	const rankedAvailable = draft && context ? rankedAvailablePlayers(seasonYear, context.teamCount || 10, draft.picks) : [];
	const recommendations = context ? recommendPlayers(rankedAvailable, context) : [];
	return json(
		{ state: draft ? { ...draft, availablePlayers: rankedAvailable.length ? rankedAvailable : draft.availablePlayers, recommendations, context, intelligence: intelligenceSummary(seasonYear) } : null, receiver },
		{ headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } }
	);
};
