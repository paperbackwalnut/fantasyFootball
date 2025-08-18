import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const { leagueId } = params;

	const { data: league, error: dbError } = await locals.supabase
		.from('leagues')
		.select('espn_s2_cookie, swid_cookie')
		.eq('id', leagueId)
		.single();

	if (dbError || !league) {
		throw error(404, 'League not found');
	}

	return json({
		espn_s2: league.espn_s2_cookie,
		swid: league.swid_cookie
	});
};
