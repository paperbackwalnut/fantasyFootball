import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveLeagueContext } from './league-context.js';

test('detects the user team and next snake pick from the ESPN URL', () => {
	const state = {
		draftUrl: 'https://fantasy.espn.com/football/draft?leagueId=55&seasonId=2026&teamId=8', currentPick: 9,
		teams: [{ id: '3', name: 'Alpha', picks: [] }, { id: '8', name: 'Mine', picks: [{ pickNumber: 2, teamId: '8', position: 'RB' }] }, { id: '4', name: 'Beta', picks: [] }],
		picks: [{ pickNumber: 1, teamId: '3' }, { pickNumber: 2, teamId: '8' }, { pickNumber: 3, teamId: '4' }]
	};
	const context = deriveLeagueContext(state);
	assert.equal(context.userTeamName, 'Mine');
	assert.equal(context.draftSlot, 2);
	assert.equal(context.nextUserPick, 11);
	assert.equal(context.picksUntilNextTurn, 2);
	assert.deepEqual(context.rosterCounts, { RB: 1 });
});

test('does not project another turn after a complete 17-round draft', () => {
	const teams = Array.from({ length: 10 }, (_, index) => ({ id: String(index + 1), name: `Team ${index + 1}`, picks: [] }));
	const picks = Array.from({ length: 170 }, (_, index) => ({ pickNumber: index + 1, teamId: String((index % 10) + 1) }));
	const context = deriveLeagueContext({ draftUrl: 'https://fantasy.espn.com/football/draft?teamId=7', currentPick: 171, teams, picks });
	assert.equal(context.completed, true);
	assert.equal(context.nextUserPick, null);
	assert.equal(context.picksUntilNextTurn, null);
});
