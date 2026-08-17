const positions = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'];

/** Detect short-term positional runs and draft-room demand from completed picks. @param {Array<{position?:string|null,pickNumber?:number}>} picks */
export function analyzeDraftMarket(picks) {
	const resolved = picks.filter((pick) => positions.includes(pick.position ?? ''));
	const recentSix = resolved.slice(-6);
	const recentTen = resolved.slice(-10);
	const overallCounts = countPositions(resolved);
	const recentCounts = countPositions(recentTen);
	const tailPosition = resolved.at(-1)?.position ?? null;
	let tailLength = 0;
	for (let index = resolved.length - 1; index >= 0 && resolved[index].position === tailPosition; index--) tailLength++;
	const signals = positions.map((position) => {
		const lastSix = recentSix.filter((pick) => pick.position === position).length;
		const lastTen = recentCounts[position] ?? 0;
		const overallRate = resolved.length ? (overallCounts[position] ?? 0) / resolved.length : 0;
		const recentRate = recentTen.length ? lastTen / recentTen.length : 0;
		const demandMultiple = overallRate > 0 ? recentRate / overallRate : recentRate > 0 ? 2 : 0;
		const active = lastSix >= 3 || (tailPosition === position && tailLength >= 2);
		const intensity = Math.min(1, Math.max(lastSix / 5, tailPosition === position ? tailLength / 4 : 0, (demandMultiple - 1) / 2));
		return { position, active, lastSix, lastTen, consecutive: tailPosition === position ? tailLength : 0, overallCount: overallCounts[position] ?? 0, demandMultiple: Math.round(demandMultiple * 10) / 10, intensity: Math.round(intensity * 100) / 100 };
	}).filter((signal) => signal.lastTen || signal.overallCount);
	const activeRuns = signals.filter((signal) => signal.active).sort((a, b) => b.intensity - a.intensity);
	return { sampleSize: resolved.length, windowSize: recentTen.length, activeRuns, signals: signals.sort((a, b) => b.intensity - a.intensity), summary: activeRuns.length ? activeRuns.map((run) => `${run.position}: ${run.lastSix} of last 6`).join(' · ') : 'No active positional run' };
}

/** @param {Array<{position?:string|null}>} picks */
function countPositions(picks) {
	/** @type {Record<string,number>} */
	const counts = {};
	for (const pick of picks) if (pick.position) counts[pick.position] = (counts[pick.position] ?? 0) + 1;
	return counts;
}
