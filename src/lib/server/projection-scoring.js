const statIds = {
	passing_yards: 3, passing_tds: 4, passing_2pt: 19, interceptions: 20,
	rushing_yards: 24, rushing_tds: 25, rushing_2pt: 26,
	receiving_yards: 42, receiving_tds: 43, receiving_2pt: 44,
	receptions: 53, fumbles: 72
};

/**
 * Convert a stat-line projection with the exact imported ESPN scoring rules we understand.
 * @param {Record<string, number>} stats
 * @param {{rules?: Record<string, number>} | null | undefined} scoring
 */
export function scoreProjectionStats(stats, scoring) {
	if (!stats || !scoring?.rules || !Object.keys(scoring.rules).length) return null;
	let points = 0;
	let matched = 0;
	for (const [name, statId] of Object.entries(statIds)) {
		const value = Number(stats[name]);
		const multiplier = Number(scoring.rules[String(statId)]);
		if (!Number.isFinite(value) || !Number.isFinite(multiplier)) continue;
		points += value * multiplier;
		matched++;
	}
	return matched ? { points, matchedStats: matched } : null;
}
