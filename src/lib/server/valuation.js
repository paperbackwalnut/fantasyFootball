const offense = new Set(['QB', 'RB', 'WR', 'TE']);

/**
 * Adds point-based value over a dynamic replacement player. Flex demand is
 * allocated to the strongest remaining RB/WR/TE projections across the room.
 * @param {any[]} players
 * @param {any} context
 * @param {Array<{picks?:any[]}>} teams
 */
export function applyLeagueValuation(players, context, teams = []) {
	const projected = players.filter((player) => offense.has(player.position) && Number.isFinite(Number(player.projectedPoints)));
	if (!projected.length) return players;
	const slots = context?.rosterSlots ?? {};
	const teamCount = Math.max(1, Number(context?.teamCount) || teams.length || 10);
	const rosteredByPosition = countRostered(teams);
	/** @type {Record<string, number>} */
	const baseDemand = {};
	for (const position of offense) baseDemand[position] = Math.max(0, teamCount * Number(slots[position] ?? 0) - Number(rosteredByPosition[position] ?? 0));
	const flexSlots = Math.max(0, teamCount * Number(slots.FLEX ?? 0) - countFilledFlex(teams, slots));
	const flexPool = projected.filter((player) => ['RB', 'WR', 'TE'].includes(player.position)).sort((a, b) => Number(b.projectedPoints) - Number(a.projectedPoints));
	/** @type {Record<string, number>} */
	const flexDemand = { RB: 0, WR: 0, TE: 0 };
	const consumed = { ...baseDemand };
	for (const player of flexPool) {
		if ((consumed[player.position] ?? 0) > 0) { consumed[player.position]--; continue; }
		if (Object.values(flexDemand).reduce((sum, value) => sum + value, 0) >= flexSlots) break;
		flexDemand[player.position]++;
	}
	/** @type {Record<string, number>} */
	const replacement = {};
	for (const position of offense) {
		const pool = projected.filter((player) => player.position === position).sort((a, b) => Number(b.projectedPoints) - Number(a.projectedPoints));
		const demand = Math.max(1, (baseDemand[position] ?? 0) + (flexDemand[position] ?? 0));
		replacement[position] = Number(pool[Math.min(pool.length - 1, demand - 1)]?.projectedPoints ?? pool.at(-1)?.projectedPoints ?? 0);
	}
	return players.map((player) => {
		const baseline = replacement[player.position];
		const pointVorp = Number.isFinite(Number(player.projectedPoints)) && Number.isFinite(baseline) ? Number(player.projectedPoints) - baseline : null;
		return { ...player, replacementPoints: baseline ?? null, pointVorp, valuationMethod: pointVorp == null ? 'rank-fallback' : 'league-points' };
	});
}

/** @param {Array<{picks?:any[]}>} teams */
function countRostered(teams) {
	/** @type {Record<string, number>} */
	const counts = {};
	for (const team of teams) for (const pick of team.picks ?? []) if (pick.position) counts[pick.position] = (counts[pick.position] ?? 0) + 1;
	return counts;
}

/** @param {Array<{picks?:any[]}>} teams @param {Record<string,number>} slots */
function countFilledFlex(teams, slots) {
	let filled = 0;
	for (const team of teams) {
		const counts = countRostered([team]);
		for (const position of ['RB', 'WR', 'TE']) filled += Math.max(0, Number(counts[position] ?? 0) - Number(slots[position] ?? 0));
	}
	return filled;
}
