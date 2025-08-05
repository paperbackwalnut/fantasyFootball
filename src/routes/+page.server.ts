import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();

	if (!session) {
		throw redirect(303, '/auth');
	}

	// Don't return supabase from server - it's added in the client layout
	return {
		session,
		user
	};
};
