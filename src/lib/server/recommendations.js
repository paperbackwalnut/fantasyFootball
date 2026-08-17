/** @type {Record<string, number>} */
const starterTargets = { QB: 1, RB: 2, WR: 2, TE: 1, DST: 1, K: 1 };

/** @typedef {{name:string,position?:string|null,consensusRank?:number|null,adp?:number|null,tier?:number|null,projectedPoints?:number|null,injuryStatus?:string|null,[key:string]:unknown}} Candidate */
/** @typedef {{completed?:boolean,currentPick?:number,nextUserPick?:number|null,teamCount?:number,rosterCounts?:Record<string,number>,rosterSlots?:Record<string,number>}} DraftContext */
/** @typedef {{signals?:Array<{position:string,active:boolean,intensity:number,lastSix:number,demandMultiple:number}>}} DraftMarket */

/** Build an explainable shortlist from provider-neutral player signals. */
/** @param {Candidate[]} players @param {DraftContext} context @param {DraftMarket} [market] */
export function recommendPlayers(players, context, market = {}) {
	if (!context || context.completed || !players?.length) return [];
	const currentPick = Number(context.currentPick) || 1;
	const nextPick = Number(context.nextUserPick) || currentPick;
	const round = Math.floor((currentPick - 1) / Math.max(1, context.teamCount || 10)) + 1;
	const eligible = players.slice(0, 220).filter((player) => !positionIsFull(player.position, context.rosterCounts ?? {}));
	return eligible.map((player, index, pool) => {
		const rank = Number(player.consensusRank) || index + 1;
		const adp = Number(player.adp) || rank;
		const position = player.position || 'UNKNOWN';
		const rostered = Number(context.rosterCounts?.[position] || 0);
		const target = starterTargets[position] || 0;
		const needBonus = target && rostered < target ? 11 + (target - rostered) * 3 : rostered === 0 && ['RB', 'WR'].includes(position) ? 5 : 0;
		const value = clamp((currentPick - rank) * 0.55, -14, 24);
		const adpValue = clamp((currentPick - adp) * 0.3, -8, 12);
		const goneBeforeNext = estimateAvailabilityRisk(currentPick, nextPick, adp, context.teamCount || 10);
		const urgency = goneBeforeNext * 15;
		const nextAtPosition = pool.slice(index + 1).find((candidate) => candidate.position === position);
		const tierDrop = nextAtPosition?.tier != null && player.tier != null && nextAtPosition.tier > player.tier ? 8 : 0;
		const run = market.signals?.find((signal) => signal.position === position && signal.active);
		const marketRunBonus = run && rostered < Math.max(1, target) ? Math.round(run.intensity * 8 * 10) / 10 : 0;
		const injuryPenalty = player.injuryStatus && !['Healthy', 'Active'].includes(player.injuryStatus) ? 13 : 0;
		const earlySpecialistPenalty = ['K', 'DST'].includes(position) && round < Math.max(10, (context.teamCount || 10) - 1) ? 35 : 0;
		const qbDepthPenalty = position === 'QB' && rostered >= 1 ? (round < 10 ? 38 : 24) : 0;
		const rawScore = 110 - rank * 0.34 + value + adpValue + urgency + needBonus + tierDrop + marketRunBonus - injuryPenalty - earlySpecialistPenalty - qbDepthPenalty;
		const reasons = [];
		if (value >= 5) reasons.push(`${Math.round(value / 0.55)} picks past consensus value`);
		if (needBonus >= 11) reasons.push(`fills a starting ${position} need`);
		if (tierDrop) reasons.push(`${position} tier drops after this option`);
		if (marketRunBonus && run) reasons.push(`${run.lastSix} ${position}s taken in the last 6 picks`);
		if (goneBeforeNext >= 0.72 && nextPick > currentPick) reasons.push(`${Math.round(goneBeforeNext * 100)}% estimated chance gone by pick ${nextPick}`);
		if (player.projectedPoints != null) reasons.push(`${Number(player.projectedPoints).toFixed(1)} projected PPR points`);
		if (injuryPenalty) reasons.push(`${player.injuryStatus} injury risk applied`);
		if (qbDepthPenalty) reasons.push(`${rostered} QB already rostered; backup cost applied`);
		if (!reasons.length) reasons.push('best blended rank and roster fit');
		return { ...player, recommendationScore: Math.round(rawScore * 10) / 10, availabilityRisk: Math.round(goneBeforeNext * 100), reasons: reasons.slice(0, 3), scoreComponents: {
			consensus: roundScore(110 - rank * 0.34), value: roundScore(value), adpValue: roundScore(adpValue), availability: roundScore(urgency), rosterNeed: roundScore(needBonus), tierScarcity: roundScore(tierDrop), roomTrend: roundScore(marketRunBonus), injury: roundScore(-injuryPenalty), rosterConstruction: roundScore(-earlySpecialistPenalty - qbDepthPenalty)
		} };
	}).sort((a, b) => b.recommendationScore - a.recommendationScore).slice(0, 12).map((player, index) => ({ ...player, recommendationRank: index + 1 }));
}

/** @param {number} value */
function logistic(value) { return 1 / (1 + Math.exp(-value)); }
/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
/** @param {number} value */
function roundScore(value) { return Math.round(value * 10) / 10; }

/** @param {string|null|undefined} position @param {Record<string,number>} roster */
function positionIsFull(position, roster) {
	/** @type {Record<string,number>} */
	const hardCaps = { QB: 2, TE: 2, DST: 1, K: 1 };
	return Boolean(position && hardCaps[position] && (roster[position] ?? 0) >= hardCaps[position]);
}

/** Conditional estimate that discounts stale ADP after the room has repeatedly passed on a player.
 * @param {number} currentPick @param {number} nextPick @param {number} adp @param {number} teamCount */
function estimateAvailabilityRisk(currentPick, nextPick, adp, teamCount) {
	if (nextPick <= currentPick) return 1;
	const gap = nextPick - currentPick;
	const base = logistic((nextPick - adp) / 6);
	const ignoredByRoom = Math.max(0, currentPick - adp);
	const staleDiscount = Math.exp(-ignoredByRoom / Math.max(12, teamCount * 1.8));
	const turnExposure = clamp(gap / Math.max(1, teamCount), 0.35, 1.5);
	return clamp(base * staleDiscount * turnExposure, 0.03, 0.97);
}
