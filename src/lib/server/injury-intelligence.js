const activeStatuses = new Set(['', 'NA', 'N/A', 'NONE', 'HEALTHY', 'ACTIVE']);

/** @param {unknown} value */
export function normalizeInjuryStatus(value) {
	const status = String(value ?? '').trim().toUpperCase();
	return activeStatuses.has(status) ? null : status;
}

/** Approximate the number of regular-season games before an estimated return.
 * @param {string|null|undefined} returnDate @param {number} seasonYear @param {Date} [asOf] */
export function expectedGamesMissed(returnDate, seasonYear, asOf = new Date()) {
	const returned = parseDate(returnDate);
	if (!returned) return 0;
	const seasonStart = nflSeasonStart(Number(seasonYear));
	const riskStart = asOf > seasonStart ? asOf : seasonStart;
	if (returned <= riskStart) return 0;
	return Math.max(0, Math.min(17, Math.ceil((returned.getTime() - riskStart.getTime()) / 604800000)));
}

/** @param {number} seasonYear */
export function nflSeasonStart(seasonYear) {
	const septemberFirst = new Date(Date.UTC(seasonYear, 8, 1));
	const laborDay = new Date(septemberFirst);
	laborDay.setUTCDate(1 + ((8 - septemberFirst.getUTCDay()) % 7));
	const thursday = new Date(laborDay);
	thursday.setUTCDate(laborDay.getUTCDate() + 3);
	return thursday;
}

/**
 * Produce a bounded, explainable injury assessment. Historical reports mostly
 * widen downside; a current return timeline is allowed to move expected value.
 * @param {Record<string, any>} player
 * @param {number} seasonYear
 * @param {Date} [asOf]
 */
export function assessInjury(player, seasonYear, asOf = new Date()) {
	const status = normalizeInjuryStatus(player.injuryStatus);
	const missed = expectedGamesMissed(player.estimatedReturnDate, seasonYear, asOf);
	const recentWeeks = Number(player.recentInjuryWeeks ?? 0);
	const recentOutWeeks = Number(player.recentOutWeeks ?? 0);
	const recurringWeeks = Number(player.sameBodyRecentWeeks ?? 0);
	let currentPenalty = missed * 4;
	if (!missed && status) currentPenalty = status.includes('IR') || status.includes('PUP') || status.includes('OUT') ? 35
		: status.includes('DOUBTFUL') ? 20 : status.includes('QUESTIONABLE') || status.includes('DAY-TO-DAY') || status === 'DTD' ? 8 : 5;
	const historyPenalty = Math.min(8, recentOutWeeks * 1.25 + Math.max(0, recurringWeeks - 1) * 0.8 + Math.max(0, recentWeeks - 5) * 0.25);
	const totalPenalty = Math.min(48, currentPenalty + historyPenalty);
	const reasons = [];
	if (missed) reasons.push(`estimated return implies about ${missed} missed game${missed === 1 ? '' : 's'}`);
	else if (status) reasons.push(`${player.injuryStatus} injury designation`);
	if (recurringWeeks >= 3 && player.injuryBodyPart) reasons.push(`${recurringWeeks} recent ${String(player.injuryBodyPart).toLowerCase()} injury reports`);
	else if (recentOutWeeks >= 2) reasons.push(`${recentOutWeeks} recent weeks listed out`);
	return { status, expectedGamesMissed: missed, currentPenalty, historyPenalty: Math.round(historyPenalty * 10) / 10, totalPenalty: Math.round(totalPenalty * 10) / 10, reasons };
}

/** @param {string|null|undefined} value */
function parseDate(value) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}
