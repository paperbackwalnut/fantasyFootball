import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreProjectionStats } from './projection-scoring.js';

test('applies ESPN league rules to projected stats', () => {
	const result = scoreProjectionStats({ passing_yards: 4000, passing_tds: 30, interceptions: 10 },
		{ rules: { '3': 0.04, '4': 4, '20': -2 } });
	assert.deepEqual(result, { points: 260, matchedStats: 3 });
});

test('does not pretend to rescore when no supported stat overlaps', () => {
	assert.equal(scoreProjectionStats({ sacks: 8 }, { rules: { '99': 2 } }), null);
});
