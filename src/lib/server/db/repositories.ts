import { randomUUID } from 'node:crypto';
import { closeDatabase, getDatabase } from './database';
import { decryptJson, encryptJson, isEncryptedSecret } from './secrets.js';

export type LocalLeague = {
	id?: string; platform: 'ESPN' | 'SLEEPER'; externalId: string; seasonYear: number; name: string;
	teamCount: number; draftType?: string; draftStarted?: boolean; draftCompleted?: boolean;
	userTeamId?: string | null; auth?: unknown; settings?: unknown;
};
export type LocalTeam = { platformTeamId: string; name: string; ownerName?: string | null; draftPosition?: number | null; isUser?: boolean; data?: unknown };
export type LocalPick = { pickNumber: number; roundNumber: number; roundPick: number; teamId?: string | null; platformPlayerId?: string | null; playerName: string; position?: string | null; nflTeam?: string | null; data?: unknown; pickedAt?: string | null };

const parse = (value: string | null) => value ? JSON.parse(value) : null;
export const closeRepositoryDatabase = closeDatabase;

export function listLeagues(platform?: 'ESPN' | 'SLEEPER') {
	const rows = platform
		? getDatabase().prepare('SELECT * FROM leagues WHERE platform=? ORDER BY season_year DESC, updated_at DESC').all(platform)
		: getDatabase().prepare('SELECT * FROM leagues ORDER BY season_year DESC, updated_at DESC').all();
	return (rows as any[]).map((row) => ({
		id: row.id, name: row.name, platform: row.platform, platform_league_id: row.external_id,
		team_count: row.team_count, season_year: row.season_year, draft_type: row.draft_type,
		draft_started: Boolean(row.draft_started), draft_completed: Boolean(row.draft_completed),
		userTeamId: row.user_team_id, userRosterId: row.user_team_id, created_at: row.created_at, updated_at: row.updated_at
	}));
}

export function getLeague(id: string) {
	const db = getDatabase();
	const row = db.prepare('SELECT * FROM leagues WHERE id=?').get(id) as any;
	if (!row) return null;
	let auth = null;
	if (row.auth_json) {
		if (isEncryptedSecret(row.auth_json)) auth = decryptJson(row.auth_json);
		else {
			auth = JSON.parse(row.auth_json);
			db.prepare('UPDATE leagues SET auth_json=?, updated_at=? WHERE id=?').run(encryptJson(auth), new Date().toISOString(), id);
		}
	}
	return { ...row, auth, auth_json: undefined, settings: parse(row.settings_json) };
}

export function getLeagueTeams(leagueId: string) {
	return (getDatabase().prepare('SELECT * FROM teams WHERE league_id=? ORDER BY draft_position, name').all(leagueId) as any[]).map((row) => ({
		id: row.id, team_name: row.name, owner_name: row.owner_name, draft_position: row.draft_position,
		espn_team_id: Number(row.platform_team_id) || row.platform_team_id,
		sleeper_roster_id: Number(row.platform_team_id) || row.platform_team_id, is_user: Boolean(row.is_user)
	}));
}

export function getLeaguePicks(leagueId: string) {
	return (getDatabase().prepare('SELECT * FROM draft_picks WHERE league_id=? ORDER BY pick_number').all(leagueId) as any[]).map((row) => ({
		pick_number: row.pick_number, round_number: row.round_number, round_pick: row.round_pick,
		team_id: row.team_id, espn_player_id: row.platform_player_id, sleeper_player_id: row.platform_player_id,
		player_name: row.player_name, player_position: row.player_position, player_nfl_team: row.player_nfl_team,
		player_data: parse(row.player_data_json)
	}));
}

export function saveLeague(input: LocalLeague, teams: LocalTeam[] = [], picks: LocalPick[] = []) {
	const db = getDatabase();
	const now = new Date().toISOString();
	const existing = db.prepare('SELECT id, created_at FROM leagues WHERE platform=? AND external_id=? AND season_year=?').get(input.platform, input.externalId, input.seasonYear) as any;
	const id = (existing?.id ?? input.id) || randomUUID();
	const transaction = db.transaction(() => {
		db.prepare(`INSERT INTO leagues(id,platform,external_id,season_year,name,team_count,draft_type,draft_started,draft_completed,user_team_id,auth_json,settings_json,created_at,updated_at)
		VALUES(@id,@platform,@externalId,@seasonYear,@name,@teamCount,@draftType,@draftStarted,@draftCompleted,@userTeamId,@authJson,@settingsJson,@createdAt,@updatedAt)
		ON CONFLICT(id) DO UPDATE SET name=excluded.name,team_count=excluded.team_count,draft_type=excluded.draft_type,draft_started=excluded.draft_started,draft_completed=excluded.draft_completed,user_team_id=excluded.user_team_id,auth_json=excluded.auth_json,settings_json=excluded.settings_json,updated_at=excluded.updated_at`).run({
			...input, id, draftType: input.draftType ?? 'SNAKE', draftStarted: Number(Boolean(input.draftStarted)), draftCompleted: Number(Boolean(input.draftCompleted)), userTeamId: input.userTeamId ?? null,
			authJson: input.auth ? encryptJson(input.auth) : null, settingsJson: input.settings ? JSON.stringify(input.settings) : null, createdAt: existing?.created_at ?? now, updatedAt: now
		});
		db.prepare('DELETE FROM teams WHERE league_id=?').run(id);
		const teamInsert = db.prepare('INSERT INTO teams(id,league_id,platform_team_id,name,owner_name,draft_position,is_user,data_json) VALUES(?,?,?,?,?,?,?,?)');
		for (const team of teams) teamInsert.run(randomUUID(), id, String(team.platformTeamId), team.name, team.ownerName ?? null, team.draftPosition ?? null, Number(team.isUser), team.data ? JSON.stringify(team.data) : null);
		db.prepare('DELETE FROM draft_picks WHERE league_id=?').run(id);
		const pickInsert = db.prepare('INSERT INTO draft_picks(league_id,pick_number,round_number,round_pick,team_id,platform_player_id,player_name,player_position,player_nfl_team,player_data_json,picked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
		for (const pick of picks) pickInsert.run(id, pick.pickNumber, pick.roundNumber, pick.roundPick, pick.teamId ?? null, pick.platformPlayerId ?? null, pick.playerName, pick.position ?? null, pick.nflTeam ?? null, pick.data ? JSON.stringify(pick.data) : null, pick.pickedAt ?? null);
	});
	transaction();
	return id;
}
