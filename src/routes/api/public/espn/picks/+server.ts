// src/routes/api/public/espn/picks/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// This endpoint doesn't require authentication - for extension use only
export const POST: RequestHandler = async ({ locals, request }) => {
	try {
		const { platform, isMock, leagueId, teamId, playerId, slotId, type } = await request.json();

		console.log('[Public Extension API] Received pick:', {
			platform,
			isMock,
			leagueId,
			teamId,
			playerId,
			slotId,
			type
		});

		// Look up player information from the players table
		let playerName = 'Unknown Player';
		let playerPosition = 'UNKNOWN';
		let playerTeam = null;

		const { data: player, error: playerError } = await locals.supabase
			.from('players')
			.select('name, espn_name, position, team_abbr')
			.eq('espn_player_id', playerId)
			.single();

		if (!playerError && player) {
			playerName = player.espn_name || player.name || 'Unknown Player';
			playerPosition = player.position || 'UNKNOWN';
			playerTeam = player.team_abbr;
			console.log('[Public Extension API] Found player:', playerName, playerPosition, playerTeam);
		} else {
			console.log('[Public Extension API] Player not found in database:', playerId);
		}

		// Count current picks to determine pick number
		const { count: currentPicks } = await locals.supabase
			.from('live_draft_picks')
			.select('*', { count: 'exact', head: true })
			.eq('session_id', leagueId);

		const pickNumber = (currentPicks || 0) + 1;

		// Insert the pick into our live tracking table
		const { data: newPick, error: insertError } = await locals.supabase
			.from('live_draft_picks')
			.insert({
				session_id: leagueId,
				pick_number: pickNumber,
				team_id: parseInt(teamId),
				espn_player_id: playerId,
				player_name: playerName,
				player_position: playerPosition,
				player_nfl_team: playerTeam,
				is_mock: isMock,
				pick_data: {
					slotId,
					type,
					timestamp: new Date().toISOString(),
					platform,
					source: 'extension'
				}
			})
			.select()
			.single();

		if (insertError) {
			console.error('Failed to insert pick:', insertError);
			throw error(500, `Failed to save pick: ${insertError.message}`);
		}

		console.log(
			`[Public Extension API] ✅ Saved pick #${pickNumber}: ${playerName} (${playerPosition}) to team ${teamId}`
		);

		return json({
			success: true,
			pick: {
				id: newPick.id,
				pickNumber,
				playerName,
				playerPosition,
				playerTeam,
				teamId: parseInt(teamId),
				sessionId: leagueId,
				isMock
			},
			message: `Pick #${pickNumber} saved: ${playerName} (${playerPosition})`
		});
	} catch (e) {
		console.error('[Public Extension API] Error:', e);
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
