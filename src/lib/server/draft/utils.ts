// src/lib/server/draft/utils.ts
export type ESPNPlayer = {
	id: number;
	fullName: string;
	defaultPositionId?: number;
	eligibleSlots?: number[];
	proTeamId?: number;
};

export function getPositionName(id?: number): string {
	const map: Record<number, string> = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST' };
	return id ? (map[id] ?? 'FLEX') : 'FLEX';
}

export function getNFLTeamName(id?: number): string {
	const map: Record<number, string> = {
		1: 'ATL',
		2: 'BUF',
		3: 'CHI',
		4: 'CIN',
		5: 'CLE',
		6: 'DAL',
		7: 'DEN',
		8: 'DET',
		9: 'GB',
		10: 'TEN',
		11: 'IND',
		12: 'KC',
		13: 'LV',
		14: 'LAR',
		15: 'MIA',
		16: 'MIN',
		17: 'NE',
		18: 'NO',
		19: 'NYG',
		20: 'NYJ',
		21: 'PHI',
		22: 'ARI',
		23: 'PIT',
		24: 'LAC',
		25: 'SF',
		26: 'SEA',
		27: 'TB',
		28: 'WAS',
		29: 'CAR',
		30: 'JAX',
		33: 'BAL',
		34: 'HOU'
	};
	return id ? (map[id] ?? 'FA') : 'FA';
}

export function calculatePositionalADP(
	picks: { playerId: number; overallPickNumber?: number }[],
	players: Map<number, ESPNPlayer>
): Record<string, number> {
	const buckets: Record<string, number[]> = {};
	picks.forEach((p, i) => {
		const info = players.get(p.playerId);
		const pos = getPositionName(info?.defaultPositionId);
		(buckets[pos] ??= []).push(p.overallPickNumber ?? i + 1);
	});
	const out: Record<string, number> = {};
	for (const k in buckets) out[k] = buckets[k].reduce((a, b) => a + b, 0) / buckets[k].length;
	return out;
}

export function calculatePositionRank(
	pickNumber: number,
	pos: string,
	allPicks: { playerId: number; overallPickNumber?: number }[],
	players: Map<number, ESPNPlayer>
): number {
	const arr = allPicks
		.filter((p) => getPositionName(players.get(p.playerId)?.defaultPositionId) === pos)
		.sort((a, b) => (a.overallPickNumber ?? 999) - (b.overallPickNumber ?? 999));
	return arr.findIndex((p) => (p.overallPickNumber ?? 999) === pickNumber) + 1;
}

export async function fetchEspnPlayers(
	ids: string[],
	season: number,
	espn_s2: string,
	swid: string
): Promise<Map<number, ESPNPlayer>> {
	const map = new Map<number, ESPNPlayer>();
	try {
		const r = await fetch(
			`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/players?scoringPeriodId=0&view=players_wl`,
			{ headers: { Cookie: `espn_s2=${espn_s2}; SWID=${swid};` } }
		);
		if (r.ok) {
			const rows = (await r.json()) as ESPNPlayer[];
			for (const p of rows) if (ids.includes(p.id.toString())) map.set(p.id, p);
		}
	} catch {
		/* swallow */
	}
	return map;
}
