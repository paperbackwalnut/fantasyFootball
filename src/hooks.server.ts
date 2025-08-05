import { createSupabaseServerClient } from '$lib/supabase';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// Create a properly typed event for the supabase client
	const supabaseEvent = {
		cookies: {
			getAll: () => event.cookies.getAll(),
			set: (name: string, value: string, options: Record<string, unknown>) => {
				event.cookies.set(name, value, { path: '/', ...options });
			}
		}
	};

	event.locals.supabase = createSupabaseServerClient(supabaseEvent);

	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		if (!session) {
			return { session: null, user: null };
		}

		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();
		if (error) {
			// JWT validation has failed
			return { session: null, user: null };
		}

		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
