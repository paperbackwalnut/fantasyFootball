// src/lib/types/sleeperTypes.ts
export type LeagueSettingsKeys =
	| 'best_ball'
	| 'last_report'
	| 'waiver_budget'
	| 'disable_adds'
	| 'capacity_override'
	| 'taxi_deadline'
	| 'draft_rounds'
	| 'reserve_allow_na'
	| 'start_week'
	| 'playoff_seed_type'
	| 'playoff_teams'
	| 'veto_votes_needed'
	| 'num_teams'
	| 'daily_waivers_hour'
	| 'playoff_type'
	| 'taxi_slots'
	| 'sub_start_time_eligibility'
	| 'last_scored_leg'
	| 'daily_waivers_days'
	| 'sub_lock_if_starter_active'
	| 'playoff_week_start'
	| 'waiver_clear_days'
	| 'reserve_allow_doubtful'
	| 'commissioner_direct_invite'
	| 'veto_auto_poll'
	| 'reserve_allow_dnr'
	| 'taxi_allow_vets'
	| 'waiver_day_of_week'
	| 'playoff_round_type'
	| 'reserve_allow_out'
	| 'reserve_allow_sus'
	| 'veto_show_votes'
	| 'trade_deadline'
	| 'taxi_years'
	| 'daily_waivers'
	| 'disable_trades'
	| 'pick_trading'
	| 'type'
	| 'max_keepers'
	| 'waiver_type'
	| 'max_subs'
	| 'league_average_match'
	| 'trade_review_days'
	| 'bench_lock'
	| 'offseason_adds'
	| 'leg'
	| 'reserve_slots'
	| 'reserve_allow_cov'
	| 'daily_waivers_last_ran';
export type LeagueSettings = Partial<Record<LeagueSettingsKeys, number | null>>;

export type SleeperUser = { user_id: string; username: string; display_name: string };
export type SleeperLeague = {
	league_id: string;
	name: string;
	season: string;
	total_rosters: number;
	draft_id?: string | null;
	settings?: LeagueSettings;
};
export type SleeperUserInLeague = {
	user_id: string;
	display_name: string;
	metadata?: Record<string, unknown>;
	username?: string;
};
export type SleeperRoster = {
	roster_id: number;
	owner_id?: string | null;
	draft_slot?: number | null;
};
export interface SleeperPick {
	pick_no: number; // pick within the round
	round: number; // round number
	roster_id: number; // roster making the pick
	player_id: string; // Sleeper player ID (stringified int)
	picked_by: string; // user ID that made the pick
	is_keeper: boolean; // whether the pick was a keeper
	draft_id: string; // ID of the draft
	draft_slot: number; // slot in the draft
	pick_id: string; // unique pick ID
	metadata: {
		first_name?: string;
		last_name?: string;
		full_name?: string;
		team?: string;
		position?: string;
		years_exp?: string;
		status?: string;
		number?: string;
		height?: string;
		weight?: string;
		college?: string;
		injury_status?: string;
		[key: string]: unknown; // Sleeper sometimes throws extras in here
	};
	// Some drafts include this
	player_id_override?: string;
	is_traded_pick?: boolean;
	draft_picked_by?: string; // alt field for user
	// Not always present:
	drafted_at?: number; // timestamp
	[key: string]: unknown; // future-proofing
}
