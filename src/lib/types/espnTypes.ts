// ─── Common Param Types ────────────────────────────────────
export type SeasonId = number;
export type ScoringPeriodId = number; // your "week" or scoring period
export type MatchupPeriodId = number;
export type TeamId = number;
export type PlayerFilter = string; // e.g. "WR", "RB", etc.

// ─── Response Types ────────────────────────────────────────
// (these mirror the interfaces in mkreiser's client)

export interface LeagueInfo {
	id: number;
	name: string;
	teams: Team[];
	settings: LeagueSettings;
}

export interface DraftPlayer {
	pick: number;
	round: number;
	teamId: number;
	playerId: number;
	playerName: string;
}

export interface UserTeam {
	id: number;
	name: string;
	location: string;
	nickname: string;
	draftDayProjectedRank: number;
	rosterSlots: RosterSlot[];
}

export interface RosterSlot {
	playerId: number;
	lineupSlotId: number;
	acquisitionType: string;
}

export interface Matchup {
	home: { teamId: TeamId; score: number };
	away: { teamId: TeamId; score: number };
}

export interface Boxscore {
	matchups: Matchup[];
	scoring: { [slotId: number]: number }[];
}

export interface ScoreboardEntry {
	matchupId: number;
	homeScore: number;
	awayScore: number;
}

export interface Player {
	id: number;
	fullName: string;
	eligibleSlots: number[];
	proTeamId: number;
	injuryStatus: string;
	status: string;
	defaultPositionId?: number;
}
// ESPN League Settings Types

export interface AcquisitionSettings {
	acquisitionBudget: number;
	acquisitionLimit: number;
	acquisitionType: string;
	isUsingAcquisitionBudget: boolean;
	matchupAcquisitionLimit: number;
	matchupLimitPerScoringPeriod: number;
	minimumBid: number;
	waiverHours: number;
	waiverOrderReset: string;
	waiverProcessDays: string[];
	waiverProcessHour: number;
}

export interface DraftSettings {
	auctionBudget: number;
	availableDate: number;
	date: number;
	isTradingEnabled: boolean;
	keeperCount: number;
	keeperCountFuture: number;
	keeperOrderType: string;
	leagueSubType: string;
	orderType: string;
	pickOrder: number[];
	round: number;
	timePerSelection: number;
	type: string;
}

export interface FinanceSettings {
	entryFee: number;
	miscFee: number;
	perLoss: number;
	perTrade: number;
	playerAcquisition: number;
	playerDrop: number;
	playerMoveToActive: number;
	playerMoveToIR: number;
}

export interface RosterSettings {
	isBenchUnlimited: boolean;
	isUsingUndroppableList: boolean;
	lineupLocktimeType: string;
	lineupSlotCounts: Record<number, number>;
	lineupSlotStatLimits: Record<number, number>;
	moveLimit: number;
	positionLimits: Record<string, number>;
	rosterLocktimeType: string;
	universeIds: number[];
}

export interface Division {
	id: number;
	name: string;
	size: number;
}

export interface Period {
	id: number;
	startDate: number;
	endDate: number;
}

export interface ScheduleSettings {
	divisions: Division[];
	matchupPeriodCount: number;
	matchupPeriodLength: number;
	matchupPeriods: Record<number, Period>;
	periodTypeId: number;
	playoffMatchupPeriodLength: number;
	playoffSeedingRule: string;
	playoffSeedingRuleBy: string;
	playoffTeamCount: number;
}

export interface ScoringItem {
	statId: number;
	points: number;
	pointsOverrides?: Record<number, number>;
	isReverseItem: boolean;
	scoringId?: number;
}

export interface ScoringSettings {
	allowOutOfPositionScoring: boolean;
	homeTeamBonus: number;
	matchupTieRule: string;
	matchupTieRuleBy: string;
	playerRankType: string;
	playoffHomeTeamBonus: number;
	playoffMatchupTieRule: string;
	playoffMatchupTieRuleBy: string;
	scoringItems: ScoringItem[];
}

export interface TradeSettings {
	tradeDeadline: number;
	tradeReviewPeriodDays: number;
	tradeVotesRequired: number;
}

export interface LeagueSettings {
	acquisitionSettings: AcquisitionSettings;
	draftSettings: DraftSettings;
	financeSettings: FinanceSettings;
	rosterSettings: RosterSettings;
	scheduleSettings: ScheduleSettings;
	scoringSettings: ScoringSettings;
	tradeSettings: TradeSettings;
}

export interface Team {
	abbrev: string;
	currentProjectedRank: number;
	divisionId: number;
	draftDayProjectedRank: number;
	id: number;
	isActive: boolean;
	logo: string;
	logoType: string;
	name: string;
	nickname: string;
	owners: string[];
	playoffSeed: number;
	points: number;
	pointsAdjusted: number;
	pointsDelta: number;
	primaryOwner: string;
	rankCalculatedFinal: number;
	rankFinal: number;
	record: {
		away: RecordStats;
		division: RecordStats;
		home: RecordStats;
		overall: RecordStats;
	};
	tradeBlock: Record<string, never>;
	transactionCounter: {
		acquisitionBudgetSpent: number;
		acquisitions: number;
		drops: number;
		matchupAcquisitionTotals: Record<string, number>;
		misc: number;
		moveToActive: number;
		moveToIR: number;
		paid: number;
		teamCharges: number;
		trades: number;
	};
	waiverRank: number;
	draftStrategy?: {
		futureKeeperPlayerIds: number[];
		keeperPlayerIds: number[];
	};
}

type RecordStats = {
	gamesBack: number;
	losses: number;
	percentage: number;
	pointsAgainst: number;
	pointsFor: number;
	streakLength: number;
	streakType: string;
	ties: number;
	wins: number;
};

export type Teams = Team[];

export interface Pick {
	autoDraftTypeId: number;
	bidAmount: number;
	id: number;
	keeper: boolean;
	lineupSlotId: number;
	nominatingTeamId: number;
	overallPickNumber: number;
	playerId: number;
	reservedForKeeper: boolean;
	roundId: number;
	roundPickNumber: number;
	teamId: number;
	tradeLocked: boolean;
}

export type Picks = Pick[];
