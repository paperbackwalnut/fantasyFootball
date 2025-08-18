import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals }) => {
	await locals.supabase.auth.signOut();
	return json({ success: true });
};
