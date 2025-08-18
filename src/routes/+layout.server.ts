// src/routes/+layout.server.ts - Pass session to client
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		session: locals.session,
		cookies: locals.cookies?.getAll() ?? []
	};
};
