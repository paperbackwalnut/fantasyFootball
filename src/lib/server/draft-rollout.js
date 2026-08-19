import { recommendPlayers } from './recommendations.js';

/** @param {any[]} recommendations @param {any[]} pool @param {any} context @param {any} market @param {string} seedText @param {number} [iterations] */
export function runShortHorizonRollouts(recommendations, pool, context, market, seedText, iterations = 160) {
	const coverage = pool.filter((player) => Number.isFinite(Number(player.projectedPoints))).length / Math.max(1, pool.length);
	if (coverage < 0.45 || recommendations.filter((player) => player.pointVorp != null).length < 4 || !context?.nextUserPick) {
		return { recommendations, meta: { status: 'INSUFFICIENT_PROJECTIONS', coverage: round(coverage), iterations: 0 } };
	}
	const rng = seededRandom(seedText);
	const candidates = recommendations.slice(0, 8);
	const results = candidates.map((candidate) => {
		const outcomes = [];
		const nextChoices = new Map();
		for (let iteration = 0; iteration < iterations; iteration++) {
			const surviving = pool.filter((player) => samePlayer(player, candidate) || rng() > selectedBeforeNext(player, context));
			const rosterCounts = { ...(context.rosterCounts ?? {}) };
			if (candidate.position) rosterCounts[candidate.position] = (rosterCounts[candidate.position] ?? 0) + 1;
			const next = recommendPlayers(surviving.filter((player) => !samePlayer(player, candidate)), { ...context, currentPick: context.nextUserPick, rosterCounts }, market)[0];
			const currentValue = Number(candidate.pointVorp ?? candidate.recommendationScore / 3);
			const nextValue = Number(next ? (next.pointVorp ?? next.recommendationScore / 3) : 0);
			outcomes.push(currentValue + nextValue);
			if (next?.name) nextChoices.set(next.name, (nextChoices.get(next.name) ?? 0) + 1);
		}
		outcomes.sort((a, b) => a - b);
		const expected = outcomes.reduce((sum, value) => sum + value, 0) / outcomes.length;
		const likelyNext = [...nextChoices.entries()].sort((a, b) => b[1] - a[1])[0];
		return { ...candidate, expectedRosterValue: round(expected), rolloutDownside: round(percentile(outcomes, 0.15)), rolloutUpside: round(percentile(outcomes, 0.85)),
			likelyNextPlayer: likelyNext?.[0] ?? null, likelyNextRate: likelyNext ? Math.round(likelyNext[1] / iterations * 100) : null };
	}).sort((a, b) => b.expectedRosterValue - a.expectedRosterValue).map((player, index) => ({ ...player, recommendationRank: index + 1,
		reasons: [`best expected two-turn roster value (${player.expectedRosterValue})`, ...(player.reasons ?? [])].slice(0, 3) }));
	const candidateIds = new Set(candidates.map((player) => player.catalogId ?? player.id ?? player.name));
	return { recommendations: [...results, ...recommendations.filter((player) => !candidateIds.has(player.catalogId ?? player.id ?? player.name))].map((player, index) => ({ ...player, recommendationRank: index + 1 })),
		meta: { status: 'REFINED', coverage: round(coverage), iterations, horizonTurns: 2 } };
}

/** @param {any} player @param {any} context */
function selectedBeforeNext(player, context) {
	const adp = Number(player.espnDisplayedRank ?? player.adp ?? player.consensusRank ?? context.currentPick);
	const midpoint = (Number(context.currentPick) + Number(context.nextUserPick)) / 2;
	const base = 1 / (1 + Math.exp(-(midpoint - adp) / 7));
	const ignored = Math.max(0, Number(context.currentPick) - adp);
	return Math.max(0.03, Math.min(0.96, base * Math.exp(-ignored / 24)));
}

/** @param {any} a @param {any} b */
function samePlayer(a, b) { return String(a.catalogId ?? a.id ?? a.name) === String(b.catalogId ?? b.id ?? b.name); }
/** @param {number[]} values @param {number} p */
function percentile(values, p) { return values[Math.min(values.length - 1, Math.max(0, Math.floor(values.length * p)))] ?? 0; }
/** @param {number} value */
function round(value) { return Math.round(value * 100) / 100; }
/** @param {string} seed */
function seededRandom(seed) { let state = [...seed].reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0; return () => { state += 0x6D2B79F5; let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; }; }
