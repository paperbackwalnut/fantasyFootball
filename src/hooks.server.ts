// src/hooks.server.ts - Updated to match official docs
import { createServerClient } from '@supabase/ssr';
import { type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

console.log('ENV CHECK:', {
	url: PUBLIC_SUPABASE_URL,
	key: PUBLIC_SUPABASE_ANON_KEY ? 'FOUND' : 'MISSING'
});
const ALLOWED_ORIGIN = 'https://fantasy.espn.com';

const supabase: Handle = async ({ event, resolve }) => {
	/**
	 * Creates a Supabase client specific to this server request.
	 */
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});

	/**
	 * Unlike `supabase.auth.getSession()`, which returns the session _without_
	 * validating the JWT, this function also calls `getUser()` to validate the
	 * JWT before returning the session.
	 */
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

const corsHandle: Handle = async ({ event, resolve }) => {
	// CORS preflight
	if (event.request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
				'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type,Authorization'
			}
		});
	}

	const response = await resolve(event);

	// CORS on responses
	const origin = event.request.headers.get('origin');
	if (origin === ALLOWED_ORIGIN) {
		response.headers.set('Access-Control-Allow-Origin', origin);
		response.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
	}

	return response;
};

const authGuard: Handle = async ({ event, resolve }) => {
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	// For API routes, let them handle auth individually
	if (event.url.pathname.startsWith('/api/')) {
		return resolve(event);
	}

	// For protected pages (if you want server-side protection)
	// We'll handle this client-side instead for API-first approach
	return resolve(event);
};

export const handle: Handle = sequence(supabase, corsHandle, authGuard);
