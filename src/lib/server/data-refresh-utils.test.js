import test from 'node:test';
import assert from 'node:assert/strict';
import { projectionFilename } from './data-refresh-utils.js';

test('parses watched projection filename metadata', () => {
	assert.deepEqual(projectionFilename('community-model--2026--half_ppr.csv'), { source: 'community-model', seasonYear: 2026, scoringFormat: 'HALF_PPR' });
});
