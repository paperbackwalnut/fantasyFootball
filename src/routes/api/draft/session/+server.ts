// src/routes/api/draft/sessions/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const sessionId = url.searchParams.get('session_id');

	try {
		if (sessionId) {
			// Get specific session info
			const { data: picks, error: picksError } = await locals.supabase
				.from('live_draft_picks')
				.select('*')
				.eq('session_id', sessionId)
				.order('pick_number', { ascending: true });

			if (picksError) throw picksError;

			return json({
				sessionId,
				picks: picks || [],
				totalPicks: picks?.length || 0,
				isMock: sessionId.startsWith('mock-'),
				lastActivity: picks?.length ? picks[picks.length - 1].created_at : null
			});
		} else {
			// Get recent sessions with aggregated data
			const { data: rawData, error: queryError } = await locals.supabase
				.from('live_draft_picks')
				.select('session_id, created_at, is_mock')
				.order('created_at', { ascending: false });

			if (queryError) throw queryError;

			// Group by session and calculate stats
			const sessionMap = new Map();

			for (const row of rawData || []) {
				const { session_id, created_at, is_mock } = row;

				if (!sessionMap.has(session_id)) {
					sessionMap.set(session_id, {
						sessionId: session_id,
						isMock: is_mock,
						pickCount: 0,
						lastActivity: created_at,
						firstActivity: created_at
					});
				}

				const session = sessionMap.get(session_id);
				session.pickCount++;

				// Update activity times
				if (new Date(created_at) > new Date(session.lastActivity)) {
					session.lastActivity = created_at;
				}
				if (new Date(created_at) < new Date(session.firstActivity)) {
					session.firstActivity = created_at;
				}
			}

			// Sort by most recent activity and limit to 10
			const sessions = Array.from(sessionMap.values())
				.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
				.slice(0, 10);

			console.log('[Sessions API] Found sessions:', sessions.length);

			return json({
				sessions,
				total: sessions.length
			});
		}
	} catch (e) {
		console.error('[Draft Sessions API] Error:', e);
		return json(
			{
				error: e instanceof Error ? e.message : 'Unknown error',
				sessions: []
			},
			{ status: 500 }
		);
	}
};
