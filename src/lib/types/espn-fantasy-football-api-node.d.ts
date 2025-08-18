declare module 'espn-fantasy-football-api/node' {
	import pkg from 'espn-fantasy-football-api';
	export = pkg;

	export interface ClientOptions {
		leagueId: number;
		espnS2: string;
		SWID: string;
	}

	// the shapes you get back from the client
	export interface LeagueInfo {
		id: number;
		name: string;
		size: number;
		// …any other fields you consume…
	}

	export interface DraftPlayer {
		pick: number;
		round: number;
		teamId: number;
		playerId: number;
		playerName: string;
	}

	export interface Team {
		id: number;
		location: string;
		nickname: string;
		owner: string;
		draftPosition: number;
	}

	export class Client {
		constructor(opts: ClientOptions);
		getLeagueInfo(opts: { seasonId: number }): Promise<LeagueInfo>;
		getDraftPicks(opts: { seasonId: number }): Promise<DraftPlayer[]>;
		getTeams(): Promise<Team[]>;
	}
}
