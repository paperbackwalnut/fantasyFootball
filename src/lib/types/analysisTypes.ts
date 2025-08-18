// src/lib/types/analysisTypes.ts
export interface OwnerTendencies {
	earlyRB: number;
	earlyWR: number;
	earlyQB: number;
	earlyTE: number;
	totalPicks: number;
	roundOnePicks: string[];
	roundTwoPicks: string[];
	avgRBRound: number[];
	avgWRRound: number[];
	avgQBRound: number[];
	earlyRBPercent?: string;
	earlyWRPercent?: string;
	avgRBRoundCalc?: string;
	avgWRRoundCalc?: string;
	commonR1?: string;
	commonR2?: string;
}

export interface PageData {
	leagueId: string;
	ownerTendencies: OwnerTendencies; // You can replace `any` with a more specific type if you have one
}
