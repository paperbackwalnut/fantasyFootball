import { createSupabaseLoadClient } from '$lib/supabase.js';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data, depends }) => {
	depends('supabase:auth');

	const supabase = createSupabaseLoadClient(data);

	return {
		supabase,
		session: data.session,
		user: data.user,
		cookies: data.cookies // Add the missing cookies property
	};
};
