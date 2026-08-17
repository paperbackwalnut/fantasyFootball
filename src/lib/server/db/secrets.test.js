import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { decryptJson, encryptJson, isEncryptedSecret } from './secrets.js';

test('round trips credential JSON without exposing plaintext', () => {
	const key = randomBytes(32);
	const secret = { espn_s2: 'private-cookie', swid: '{private-id}' };
	const encrypted = encryptJson(secret, key);
	assert.equal(isEncryptedSecret(encrypted), true);
	assert.equal(encrypted.includes('private-cookie'), false);
	assert.deepEqual(decryptJson(encrypted, key), secret);
});

test('rejects ciphertext modified after encryption', () => {
	const key = randomBytes(32);
	const encrypted = encryptJson({ token: 'secret' }, key);
	const replacement = encrypted.endsWith('A') ? 'B' : 'A';
	assert.throws(() => decryptJson(encrypted.slice(0, -1) + replacement, key));
});

test('rejects decryption with a different key', () => {
	const encrypted = encryptJson({ token: 'secret' }, randomBytes(32));
	assert.throws(() => decryptJson(encrypted, randomBytes(32)));
});
