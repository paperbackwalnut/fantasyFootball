import assert from 'node:assert/strict';
import test from 'node:test';
import { assessInjury, expectedGamesMissed, normalizeInjuryStatus } from './injury-intelligence.js';

test('treats provider NA markers as no injury designation', () => {
	assert.equal(normalizeInjuryStatus('NA'), null);
	assert.equal(assessInjury({ injuryStatus: 'NA' }, 2026, new Date('2026-09-03T00:00:00Z')).totalPenalty, 0);
});

test('turns an October return into missed-game risk', () => {
	assert.equal(expectedGamesMissed('2026-10-30', 2026, new Date('2026-09-03T00:00:00Z')), 8);
	const result = assessInjury({ injuryStatus: 'DAY-TO-DAY', estimatedReturnDate: '2026-10-30' }, 2026, new Date('2026-09-03T00:00:00Z'));
	assert.equal(result.currentPenalty, 32);
	assert.match(result.reasons[0], /8 missed games/);
});

test('caps historical durability as a secondary signal', () => {
	const result = assessInjury({ recentInjuryWeeks: 20, recentOutWeeks: 8, sameBodyRecentWeeks: 12, injuryBodyPart: 'Hamstring' }, 2026);
	assert.equal(result.historyPenalty, 8);
});
