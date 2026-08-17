import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const prefix = 'enc:v1:';
const aad = Buffer.from('draftsync:league-auth:v1', 'utf8');
const defaultKeyPath = resolve('.data', 'credential.key');
/** @type {Buffer | null} */
let cachedKey = null;

export function getMasterKey() {
	if (cachedKey) return cachedKey;
	if (process.env.LOCAL_CREDENTIAL_KEY) {
		const decoded = Buffer.from(process.env.LOCAL_CREDENTIAL_KEY, 'base64');
		if (decoded.length !== 32) throw new Error('LOCAL_CREDENTIAL_KEY must be a base64-encoded 32-byte key');
		return (cachedKey = decoded);
	}
	const keyPath = resolve(process.env.LOCAL_CREDENTIAL_KEY_PATH || defaultKeyPath);
	mkdirSync(dirname(keyPath), { recursive: true });
	try {
		cachedKey = readFileSync(keyPath);
	} catch (cause) {
		if (/** @type {NodeJS.ErrnoException} */ (cause).code !== 'ENOENT') throw cause;
		const generated = randomBytes(32);
		try { writeFileSync(keyPath, generated, { flag: 'wx', mode: 0o600 }); }
		catch (writeCause) {
			if (/** @type {NodeJS.ErrnoException} */ (writeCause).code !== 'EEXIST') throw writeCause;
		}
		cachedKey = readFileSync(keyPath);
	}
	if (cachedKey.length !== 32) throw new Error('Local credential key is invalid');
	return cachedKey;
}

/** @param {unknown} value */
export function isEncryptedSecret(value) {
	return typeof value === 'string' && value.startsWith(prefix);
}

/** @param {unknown} value @param {Buffer} key */
export function encryptJson(value, key = getMasterKey()) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(aad);
	const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
	const envelope = { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
	return prefix + Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
}

/** @param {string} value @param {Buffer} key */
export function decryptJson(value, key = getMasterKey()) {
	if (!isEncryptedSecret(value)) throw new Error('Credential value is not encrypted');
	const envelope = JSON.parse(Buffer.from(value.slice(prefix.length), 'base64').toString('utf8'));
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
	decipher.setAAD(aad);
	decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
	const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
	return JSON.parse(plaintext.toString('utf8'));
}
