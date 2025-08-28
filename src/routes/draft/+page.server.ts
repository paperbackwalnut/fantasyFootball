// src/routes/draft/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw error(401, 'Please sign in to access draft boards');
	}

	return {
		user: {
			id: user.id,
			email: user.email
		}
	};
};
