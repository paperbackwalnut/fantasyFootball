import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeDraftMarket } from './draft-market.js';

test('detects a clustered quarterback run', () => {
	const positions = ['RB', 'WR', 'TE', 'QB', 'QB', 'WR', 'QB'];
	const market = analyzeDraftMarket(positions.map((position, index) => ({ position, pickNumber: index + 1 })));
	assert.equal(market.activeRuns[0].position, 'QB');
	assert.equal(market.activeRuns[0].lastSix, 3);
});

test('does not call two isolated picks a run', () => {
	const positions = ['QB', 'RB', 'WR', 'RB', 'TE', 'QB', 'WR', 'RB'];
	assert.equal(analyzeDraftMarket(positions.map((position) => ({ position }))).activeRuns.length, 0);
});
