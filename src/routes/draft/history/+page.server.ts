import { getDatabase } from '$lib/server/db/database';
import { readCurrentDraftState } from '$lib/server/espn-sync/store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Reading the live state also backfills a completed board captured before history existed.
	await readCurrentDraftState();
	const rows = getDatabase().prepare('SELECT * FROM draft_sessions ORDER BY completed_at DESC LIMIT 100').all() as any[];
	return { sessions: rows.map((row) => {
		const state = JSON.parse(row.state_json);
		const userTeam = state.teams?.find((team: any) => String(team.id) === String(row.user_team_id));
		return { id: row.id, platform: row.platform, externalId: row.external_id, seasonYear: row.season_year, kind: row.kind, name: row.name, teamCount: row.team_count, draftSlot: row.draft_slot, completedAt: row.completed_at, userTeamName: userTeam?.name ?? null, userPicks: userTeam?.picks ?? [], picks: state.picks ?? [], teams: state.teams ?? [], sync: state.sync ?? null };
	}) };
};
