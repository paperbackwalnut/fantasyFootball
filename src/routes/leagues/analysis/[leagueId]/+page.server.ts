// src/routes/leagues/analysis/[leagueId]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
// import type { OwnerTendencies } from '$lib/types/analysisTypes'; // optional

export const load = (async ({ params, fetch, parent }) => {
	const { leagueId } = params;
	if (!leagueId) throw error(400, 'Missing leagueId');

	// (optional) pull layout data if you need it
	await parent();

	const res = await fetch(`/api/draft-analysis/owner-tendencies/${leagueId}`);
	if (!res.ok) throw error(res.status, await res.text());

	// const ownerTendencies: OwnerTendencies = await res.json();
	const ownerTendencies = await res.json();

	return { leagueId, ownerTendencies } as const;
}) satisfies PageServerLoad;
