import type { Handle } from '@sveltejs/kit';
import { startDataRefreshScheduler } from '$lib/server/data-refresh';

const allowedOrigin = 'https://fantasy.espn.com';

export const handle: Handle = async ({ event, resolve }) => {
	startDataRefreshScheduler();
	if (event.url.pathname.startsWith('/api/sync/espn/')) return resolve(event);
	if (event.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
	const response = await resolve(event);
	if (event.request.headers.get('origin') === allowedOrigin) for (const [key, value] of Object.entries(corsHeaders())) response.headers.set(key, value);
	return response;
};

function corsHeaders() {
	return { 'access-control-allow-origin': allowedOrigin, 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,authorization,x-espn-sync-token' };
}
