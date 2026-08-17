import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv } from './csv.js';

test('parses quoted commas, escaped quotes, and CRLF rows', () => {
	assert.deepEqual(parseCsv('name,note,rank\r\n"Doe, John","said ""hi""",3.5\r\n'), [{ name: 'Doe, John', note: 'said "hi"', rank: '3.5' }]);
});
