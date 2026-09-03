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

test('does not preserve a stale consensus value indefinitely', () => {
	const result = recommendPlayers([
		{ name: 'Repeatedly Ignored WR', position: 'WR', consensusRank: 80, adp: 100 },
		{ name: 'Current RB', position: 'RB', consensusRank: 145, adp: 150 }
	], { ...context, currentPick: 150, nextUserPick: 161, rosterCounts: { WR: 4, RB: 2 } });
	assert.equal(result[0].name, 'Current RB');
	const ignored = result.find((player) => player.name === 'Repeatedly Ignored WR');
	assert.ok(ignored);
	assert.match(ignored.reasons.join(' '), /ranking confidence reduced/);
});

test('requires missing DST and kicker when only two roster selections remain', () => {
	const players = [
		{ name: 'Bench RB', position: 'RB', consensusRank: 40, adp: 45 },
		{ name: 'Defense', position: 'DST', consensusRank: 150, adp: 150 },
		{ name: 'Kicker', position: 'K', consensusRank: 160, adp: 160 }
	];
	const result = recommendPlayers(players, {
		...context,
		currentPick: 154,
		rosterSizeHint: 17,
		rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BENCH: 8 },
		rosterCounts: { QB: 2, RB: 6, WR: 4, TE: 2, UNKNOWN: 1 }
	});
	assert.deepEqual(result.map((player) => player.position).sort(), ['DST', 'K']);
	assert.match(result[0].reasons.join(' '), /must be filled/);
});

test('encourages but does not reach for a second quarterback late', () => {
	const early = recommendPlayers([
		{ name: 'Backup QB', position: 'QB', consensusRank: 40, adp: 40 },
		{ name: 'Receiver', position: 'WR', consensusRank: 45, adp: 45 }
	], { ...context, currentPick: 45, nextUserPick: 56, rosterCounts: { QB: 1, RB: 2, WR: 2 } });
	assert.equal(early[0].name, 'Receiver');
	const late = recommendPlayers([
		{ name: 'Backup QB', position: 'QB', consensusRank: 100, adp: 100 },
		{ name: 'Receiver', position: 'WR', consensusRank: 100, adp: 100 }
	], { ...context, currentPick: 105, nextUserPick: 116, rosterCounts: { QB: 1, RB: 4, WR: 4, TE: 1 } });
	assert.equal(late[0].name, 'Backup QB');
	assert.match(late[0].reasons.join(' '), /second quarterback/);
});

test('does not treat NA as an injury and strongly suppresses IR players', () => {
	const result = recommendPlayers([
		{ name: 'Healthy Marker', position: 'RB', consensusRank: 50, adp: 50, injuryStatus: 'NA' },
		{ name: 'IR Player', position: 'RB', consensusRank: 45, adp: 45, injuryStatus: 'IR' }
	], { ...context, currentPick: 50, nextUserPick: 61 });
	assert.equal(result[0].name, 'Healthy Marker');
	assert.doesNotMatch(result[0].reasons.join(' '), /injury risk/);
});

test('penalizes a backup quarterback with the same bye as the starter', () => {
	const result = recommendPlayers([
		{ name: 'Same Bye QB', position: 'QB', consensusRank: 100, adp: 100, byeWeek: 8 },
		{ name: 'Different Bye QB', position: 'QB', consensusRank: 102, adp: 102, byeWeek: 11 }
	], { ...context, currentPick: 105, nextUserPick: 116, rosterCounts: { QB: 1 }, rosterByeCounts: { 8: 1 }, rosterPositionByeCounts: { QB: { 8: 1 } } });
	assert.equal(result[0].name, 'Different Bye QB');
});

test('uses a granular expected-return penalty when supplied', () => {
	const result = recommendPlayers([
		{ name: 'Unavailable RB', position: 'RB', consensusRank: 40, adp: 40, injuryStatus: 'DAY-TO-DAY', expectedGamesMissed: 8, injuryRiskPenalty: 32, injuryRiskReasons: ['estimated return implies about 8 missed games'] },
		{ name: 'Healthy RB', position: 'RB', consensusRank: 50, adp: 50 }
	], { ...context, currentPick: 50, nextUserPick: 61 });
	assert.equal(result[0].name, 'Healthy RB');
	assert.match(result[1].reasons.join(' '), /8 missed games/);
});
