import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from './types/database.types';

export const createSupabaseLoadClient = (data: { cookies: Record<string, string> }) => {
	return createBrowserClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		global: {
			fetch
		},
		cookies: {
			getAll: () => {
				return Object.entries(data.cookies || {}).map(([name, value]) => ({ name, value }));
			},
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					if (typeof document !== 'undefined') {
						let cookieString = `${name}=${value}`;
						if (options?.maxAge) cookieString += `; max-age=${options.maxAge}`;
						if (options?.path) cookieString += `; path=${options.path}`;
						document.cookie = cookieString;
					}
				});
			}
		}
	});
};

export const createSupabaseServerClient = (event: {
	cookies: {
		getAll: () => Array<{ name: string; value: string }>;
		set: (name: string, value: string, options: Record<string, unknown>) => void;
	};
}) => {
	return createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});
};
