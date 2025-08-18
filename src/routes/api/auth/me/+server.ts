import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();

	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	return json({
		id: user.id,
		email: user.email
		// Add any other user fields you need
	});
};
