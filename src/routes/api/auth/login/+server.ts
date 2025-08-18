import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { email, password } = await request.json();

	const { data, error } = await locals.supabase.auth.signInWithPassword({
		email,
		password
	});

	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	return json({
		success: true,
		user: {
			id: data.user.id,
			email: data.user.email
		}
	});
};
