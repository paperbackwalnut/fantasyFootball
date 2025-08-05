import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { safeGetSession }, cookies }) => {
	const { session, user } = await safeGetSession();

	// Convert cookies to the format expected by the client
	const cookieData: Record<string, string> = {};
	cookies.getAll().forEach(({ name, value }) => {
		cookieData[name] = value;
	});

	return {
		session,
		user,
		cookies: cookieData
	};
};
