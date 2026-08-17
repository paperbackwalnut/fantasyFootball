import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendPlayers } from './recommendations.js';

const context = { currentPick: 25, nextUserPick: 36, teamCount: 10, completed: false, rosterCounts: { RB: 2 } };

test('prioritizes an unfilled starter need over a similarly ranked surplus position', () => {
	const result = recommendPlayers([
		{ name: 'Third RB', position: 'RB', consensusRank: 20, adp: 22, tier: 2 },
		{ name: 'First WR', position: 'WR', consensusRank: 21, adp: 22, tier: 2 }
	], context);
	assert.equal(result[0].name, 'First WR');
	assert.match(result[0].reasons.join(' '), /starting WR need/);
});

test('penalizes kickers during early rounds', () => {
	const result = recommendPlayers([
		{ name: 'Kicker', position: 'K', consensusRank: 1, adp: 1, tier: 1 },
		{ name: 'Receiver', position: 'WR', consensusRank: 25, adp: 25, tier: 3 }
	], { ...context, currentPick: 15, nextUserPick: 26 });
	assert.equal(result[0].name, 'Receiver');
});

test('returns no advice after the draft completes', () => {
	assert.deepEqual(recommendPlayers([{ name: 'Player', position: 'RB', consensusRank: 1 }], { ...context, completed: true }), []);
});

test('never recommends a third quarterback in a one-QB draft', () => {
	const result = recommendPlayers([
		{ name: 'Quarterback', position: 'QB', consensusRank: 10, adp: 10 },
		{ name: 'Running Back', position: 'RB', consensusRank: 100, adp: 100 }
	], { ...context, rosterCounts: { QB: 2 } });
	assert.equal(result.some((player) => player.position === 'QB'), false);
});

test('discounts stale ADP when the room has already passed repeatedly', () => {
	const result = recommendPlayers([
		{ name: 'Ignored QB', position: 'QB', consensusRank: 100, adp: 30 },
		{ name: 'Current RB', position: 'RB', consensusRank: 101, adp: 105 }
	], { ...context, currentPick: 100, nextUserPick: 111, rosterCounts: { QB: 1 } });
	assert.equal(result[0].name, 'Current RB');
	assert.ok((result.find((player) => player.name === 'Ignored QB')?.availabilityRisk ?? 100) < 20);
});
