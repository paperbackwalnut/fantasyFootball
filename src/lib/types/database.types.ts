export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
	public: {
		Tables: {
			leagues: {
				Row: {
					id: string;
					platform: string;
					platform_league_id: string;
					name: string;
					scoring_type: string;
					team_count: number;
					settings: Json | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					platform: string;
					platform_league_id: string;
					name: string;
					scoring_type: string;
					team_count: number;
					settings?: Json | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					platform?: string;
					platform_league_id?: string;
					name?: string;
					scoring_type?: string;
					team_count?: number;
					settings?: Json | null;
					created_at?: string;
					updated_at?: string;
				};
			};
			players: {
				Row: {
					id: string;
					name: string;
					position: string;
					team: string | null;
					espn_id: string | null;
					sleeper_id: string | null;
					fantasypros_rank: number | null;
					adp: number | null;
					projections: Json | null;
					news_alerts: Json[] | null;
					bye_week: number | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					name: string;
					position: string;
					team?: string | null;
					espn_id?: string | null;
					sleeper_id?: string | null;
					fantasypros_rank?: number | null;
					adp?: number | null;
					projections?: Json | null;
					news_alerts?: Json[] | null;
					bye_week?: number | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					name?: string;
					position?: string;
					team?: string | null;
					espn_id?: string | null;
					sleeper_id?: string | null;
					fantasypros_rank?: number | null;
					adp?: number | null;
					projections?: Json | null;
					news_alerts?: Json[] | null;
					bye_week?: number | null;
					created_at?: string;
					updated_at?: string;
				};
			};
		};
	};
}
