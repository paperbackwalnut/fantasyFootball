// src/routes/api/espn/extension/picks/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	try {
		const { platform, isMock, leagueId, teamId, playerId, slotId, type } = await request.json();

		console.log('[Extension API] Received pick:', {
			platform,
			isMock,
			leagueId,
			teamId,
			playerId,
			slotId,
			type
		});

		// For now, we'll just store all picks in a simple table
		// Later you can add league validation, player lookup, etc.

		// Count current picks to determine pick number
		const { count: currentPicks } = await locals.supabase
			.from('live_draft_picks')
			.select('*', { count: 'exact', head: true })
			.eq('session_id', isMock ? `mock-${leagueId}` : leagueId);

		const pickNumber = (currentPicks || 0) + 1;

		// Insert the pick into our live tracking table
		const { data: newPick, error: insertError } = await locals.supabase
			.from('live_draft_picks')
			.insert({
				session_id: isMock ? `mock-${leagueId}` : leagueId,
				pick_number: pickNumber,
				team_id: parseInt(teamId),
				espn_player_id: playerId,
				player_name: 'Unknown Player', // Will be populated later
				player_position: 'UNKNOWN',
				is_mock: isMock,
				pick_data: {
					slotId,
					type,
					timestamp: new Date().toISOString(),
					platform
				}
			})
			.select()
			.single();

		if (insertError) {
			console.error('Failed to insert pick:', insertError);
			throw error(500, `Failed to save pick: ${insertError.message}`);
		}

		console.log(`[Extension API] ✅ Saved pick #${pickNumber}: ${playerId} to team ${teamId}`);

		return json({
			success: true,
			pick: {
				id: newPick.id,
				pickNumber,
				playerName: 'Unknown Player',
				teamId: parseInt(teamId),
				sessionId: isMock ? `mock-${leagueId}` : leagueId,
				isMock
			},
			message: `Pick #${pickNumber} saved successfully`
		});
	} catch (e) {
		console.error('[Extension API] Error:', e);
		if (e instanceof Response) throw e;

		return json(
			{
				success: false,
				error: e instanceof Error ? e.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
