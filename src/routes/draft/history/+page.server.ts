import { getDatabase } from '$lib/server/db/database';
import { readCurrentDraftState } from '$lib/server/espn-sync/store';
import { ensurePlayerCatalog } from '$lib/server/player-intelligence';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Reading the live state also backfills a completed board captured before history existed.
	await readCurrentDraftState();
	ensurePlayerCatalog();
	const rows = getDatabase().prepare('SELECT * FROM draft_sessions ORDER BY completed_at DESC LIMIT 100').all() as any[];
	return { sessions: rows.map((row) => {
		const state = JSON.parse(row.state_json);
		const userTeam = state.teams?.find((team: any) => String(team.id) === String(row.user_team_id));
		const playerPosition = getDatabase().prepare('SELECT position,nfl_team FROM players WHERE id=?');
		const picks = (state.picks ?? []).map((pick: any) => {
			const catalog = pick.catalogId ? playerPosition.get(pick.catalogId) as any : null;
			return { ...pick, position: pick.position ?? catalog?.position ?? null, nflTeam: pick.nflTeam ?? catalog?.nfl_team ?? null };
		});
		const userPicks = picks.filter((pick: any) => String(pick.teamId) === String(row.user_team_id));
		const runs = getDatabase().prepare(`SELECT id,current_pick,created_at FROM recommendation_runs
			WHERE platform=? AND external_id IS ? AND season_year=? AND user_team_id IS ? ORDER BY current_pick,created_at DESC`).all(row.platform, row.external_id, row.season_year, row.user_team_id) as any[];
		const latestByPick = new Map<number, any>();
		for (const run of runs) if (!latestByPick.has(run.current_pick)) latestByPick.set(run.current_pick, run);
		let advice = [...latestByPick.values()].map((run) => ({ currentPick: run.current_pick,
			recommendations: (getDatabase().prepare('SELECT details_json FROM recommendation_candidates WHERE run_id=? ORDER BY rank').all(run.id) as any[]).map((candidate) => JSON.parse(candidate.details_json)), capturedAt: run.created_at }));
		if (!advice.length) {
			const snapshots = getDatabase().prepare(`SELECT current_pick,recommendations_json,created_at FROM recommendation_snapshots
				WHERE platform=? AND external_id IS ? AND season_year=? AND user_team_id IS ? ORDER BY current_pick,created_at DESC`).all(row.platform, row.external_id, row.season_year, row.user_team_id) as any[];
			for (const snapshot of snapshots) if (!latestByPick.has(snapshot.current_pick)) latestByPick.set(snapshot.current_pick, snapshot);
			advice = [...latestByPick.values()].map((snapshot) => ({ currentPick: snapshot.current_pick, recommendations: JSON.parse(snapshot.recommendations_json), capturedAt: snapshot.created_at }));
		}
		return { id: row.id, platform: row.platform, externalId: row.external_id, seasonYear: row.season_year, kind: row.kind, name: row.name, teamCount: row.team_count, draftSlot: row.draft_slot, completedAt: row.completed_at, userTeamName: userTeam?.name ?? null, userPicks, picks, teams: state.teams ?? [], sync: state.sync ?? null, advice };
	}) };
};
