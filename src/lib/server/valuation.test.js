import assert from 'node:assert/strict';
import test from 'node:test';
import { applyLeagueValuation } from './valuation.js';

test('calculates point value over a league and flex aware replacement baseline', () => {
	const players = [
		{ name: 'RB A', position: 'RB', projectedPoints: 240 }, { name: 'RB B', position: 'RB', projectedPoints: 210 }, { name: 'RB C', position: 'RB', projectedPoints: 180 },
		{ name: 'WR A', position: 'WR', projectedPoints: 230 }, { name: 'WR B', position: 'WR', projectedPoints: 200 }, { name: 'WR C', position: 'WR', projectedPoints: 170 },
		{ name: 'QB A', position: 'QB', projectedPoints: 350 }, { name: 'QB B', position: 'QB', projectedPoints: 310 }
	];
	const valued = applyLeagueValuation(players, { teamCount: 1, rosterSlots: { QB: 1, RB: 1, WR: 1, TE: 0, FLEX: 1 } }, []);
	const rb = valued.find((player) => player.name === 'RB A');
	assert.equal(rb.replacementPoints, 210);
	assert.equal(rb.pointVorp, 30);
});
