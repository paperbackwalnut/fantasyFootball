// src/routes/api/debug/sessions/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	console.log('[Debug Sessions] API called');

	try {
		// First, let's see if the table exists and has data
		const {
			data: rawPicks,
			error: rawError,
			count
		} = await locals.supabase
			.from('live_draft_picks')
			.select('session_id, created_at, is_mock, player_name, pick_number', { count: 'exact' })
			.order('created_at', { ascending: false })
			.limit(20);

		console.log('[Debug Sessions] Query result:', { rawPicks, rawError, count });

		if (rawError) {
			return json({
				success: false,
				error: rawError.message,
				table_exists: false,
				count: 0
			});
		}

		// Process sessions
		const sessionMap = new Map();
		const allSessions = [];

		for (const pick of rawPicks || []) {
			allSessions.push(pick.session_id);

			if (!sessionMap.has(pick.session_id)) {
				sessionMap.set(pick.session_id, {
					sessionId: pick.session_id,
					isMock: pick.is_mock,
					pickCount: 1,
					lastActivity: pick.created_at,
					firstActivity: pick.created_at,
					samplePlayer: pick.player_name
				});
			} else {
				const session = sessionMap.get(pick.session_id);
				session.pickCount++;
				if (new Date(pick.created_at) < new Date(session.firstActivity)) {
					session.firstActivity = pick.created_at;
				}
			}
		}

		const processedSessions = Array.from(sessionMap.values());

		return json({
			success: true,
			table_exists: true,
			total_picks: count,
			raw_picks_returned: rawPicks?.length || 0,
			unique_sessions: processedSessions.length,
			all_session_ids: [...new Set(allSessions)],
			processed_sessions: processedSessions,
			sample_picks: rawPicks?.slice(0, 3) || []
		});
	} catch (e) {
		console.error('[Debug Sessions] Error:', e);
		return json({
			success: false,
			error: e instanceof Error ? e.message : 'Unknown error',
			stack: e instanceof Error ? e.stack : undefined
		});
	}
};
