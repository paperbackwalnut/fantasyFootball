import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayerIndex, normalizePlayerName, parsePlayerDetail, reduceDraftSnapshot, resolvePlayer } from './draft-state.js';

const catalog = [
	{ id: 'a', espn_id: '1', full_name: 'Amon-Ra St. Brown', team_abbr: 'DET', active: 'true' },
	{ id: 'b', espn_id: '2', full_name: 'James Cook', team_abbr: 'BUF', active: 'true' },
	{ id: 'c', espn_id: '3', full_name: 'Jahmyr Gibbs', team_abbr: 'DET', active: 'true' }
];

test('normalizes punctuation, accents, and suffixes', () => {
	assert.equal(normalizePlayerName('Amon-Ra St. Brown'), 'amon ra st brown');
	assert.equal(normalizePlayerName('James Cook III'), 'james cook');
	assert.equal(normalizePlayerName('Gary’s Player Jr.'), 'garys player');
});

test('extracts NFL team and position from ESPN detail text', () => {
	assert.deepEqual(parsePlayerDetail('Jahmyr GibbsDETRB', 'Jahmyr Gibbs'), { nflTeam: 'DET', position: 'RB' });
});

test('resolves ESPN suffix variants against the catalog', () => {
	const result = resolvePlayer({ name: 'James Cook III', detail: 'James Cook IIIBUFRB' }, createPlayerIndex(catalog));
	assert.equal(result.player?.espn_id, '2');
	assert.equal(result.confidence, 'exact-name');
});

test('normalizes known nickname variants conservatively', () => {
	assert.equal(normalizePlayerName('Kenny Gainwell'), 'kenneth gainwell');
});

test('fills positions when ESPN omits detail for known captured players', () => {
	const result = resolvePlayer({ name: 'Malik Nabers', espnPlayerId: '4', detail: '' }, createPlayerIndex([{ id: 'd', espn_id: '4', full_name: 'Malik Nabers', default_position_id: '3', active: 'true' }]));
	assert.equal(result.position, 'WR');
});

test('falls back to the catalog position when ESPN omits player detail', () => {
	const result = resolvePlayer({ name: 'DK Metcalf', detail: '' }, createPlayerIndex([{ id: 'd', espn_id: '5', full_name: 'DK Metcalf', default_position_id: '3', active: 'true' }]));
	assert.equal(result.position, 'WR');
});

test('reduces a full snapshot into picks, rosters, and availability', () => {
	const state = reduceDraftSnapshot({
		source: 'espn-pick-history', currentPick: 3, teams: [{ id: '10', name: 'Alpha' }, { id: '20', name: 'Beta' }],
		historyPicks: [
			{ pick: '1', name: 'Jahmyr Gibbs', team: 'Alpha', detail: 'Jahmyr GibbsDETRB' },
			{ pick: '2', name: 'James Cook III', team: 'Beta', detail: 'James Cook IIIBUFRB' }
		]
	}, catalog, '2026-08-17T12:00:00.000Z');
	assert.equal(state.picks.length, 2);
	assert.equal(state.sync.resolvedCount, 2);
	assert.equal(state.teams[0].picks.length, 1);
	assert.deepEqual(state.availablePlayers.map((player) => player.id), ['1']);
});

test('reduces an empty pre-draft snapshot into usable initial state', () => {
	const state = reduceDraftSnapshot({ source: 'espn-pick-history', preDraft: true, draftKind: 'MOCK', roomLabel: 'Practice Draft for JCE League', currentPick: 1, draftSlotHint: 7, teams: [{ id: '8', name: 'Mine' }], historyPicks: [] }, catalog, '2026-08-19T12:00:00.000Z');
	assert.equal(state.picks.length, 0);
	assert.equal(state.currentPick, 1);
	assert.equal(state.draftSlotHint, 7);
	assert.equal(state.preDraft, true);
	assert.equal(state.draftKind, 'MOCK');
	assert.equal(state.roomLabel, 'Practice Draft for JCE League');
	assert.equal(state.teams.length, 1);
});

test('infers the user is on the clock from the preserved snake draft slot', () => {
	const teams = Array.from({ length: 10 }, (_, index) => ({ id: String(index + 1), name: `Team ${index + 1}` }));
	const state = reduceDraftSnapshot({ url: 'https://fantasy.espn.com/football/draft?teamId=7', currentPick: 7, draftSlotHint: 7, teams, historyPicks: [], userIsOnTheClock: false }, catalog, '2026-08-19T12:00:00.000Z');
	assert.equal(state.userIsOnTheClock, true);
});
