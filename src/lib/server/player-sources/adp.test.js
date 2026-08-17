import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMflName } from './adp-utils.js';

test('normalizes MFL last-first names and team defenses', () => {
	assert.equal(normalizeMflName('Robinson, Bijan', 'RB'), 'Bijan Robinson');
	assert.equal(normalizeMflName('Steelers, Pittsburgh', 'Def'), 'Pittsburgh Steelers');
});
