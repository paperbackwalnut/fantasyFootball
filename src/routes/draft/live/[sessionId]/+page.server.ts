// src/routes/draft/live/[sessionId]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw error(401, 'Please sign in to view draft boards');
	}

	const { sessionId } = params;

	// Basic validation
	if (!sessionId || sessionId.length < 3) {
		throw error(400, 'Invalid session ID');
	}

	return {
		sessionId,
		user: {
			id: user.id,
			email: user.email
		}
	};
};
