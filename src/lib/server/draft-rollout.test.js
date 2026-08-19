import assert from 'node:assert/strict';
import test from 'node:test';
import { runShortHorizonRollouts } from './draft-rollout.js';
import { recommendPlayers } from './recommendations.js';

test('refines sufficiently projected candidates deterministically', () => {
	const positions = ['RB','WR','RB','WR','TE','QB','RB','WR','TE','QB','RB','WR'];
	const pool = positions.map((position, index) => ({ id: String(index), name: `P${index}`, position, consensusRank: index + 10, adp: index + 12, projectedPoints: 260 - index * 7, pointVorp: 70 - index * 5 }));
	const context = { currentPick: 10, nextUserPick: 21, teamCount: 10, rosterCounts: {}, rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 } };
	const initial = recommendPlayers(pool, context);
	const first = runShortHorizonRollouts(initial, pool, context, {}, 'fixed', 20);
	const second = runShortHorizonRollouts(initial, pool, context, {}, 'fixed', 20);
	assert.equal(first.meta.status, 'REFINED');
	assert.deepEqual(first, second);
});

test('does not run simulations when projections are missing', () => {
	const pool = Array.from({ length: 12 }, (_, index) => ({ id: String(index), name: `P${index}`, position: index % 2 ? 'WR' : 'RB', consensusRank: index + 1, projectedPoints: null }));
	const context = { currentPick: 10, nextUserPick: 21, teamCount: 10, rosterCounts: {} };
	const result = runShortHorizonRollouts(recommendPlayers(pool, context), pool, context, {}, 'missing');
	assert.equal(result.meta.status, 'INSUFFICIENT_PROJECTIONS');
});
