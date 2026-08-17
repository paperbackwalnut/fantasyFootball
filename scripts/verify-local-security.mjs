import { mkdir } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';

const testDirectory = resolve('.data', '.security-test');
if (process.argv[2] !== '--child') {
	const child = spawnSync(process.execPath, [new URL(import.meta.url).pathname.slice(1), '--child'], { stdio: 'inherit', env: process.env });
	rmSync(testDirectory, { recursive: true, force: true });
	process.exit(child.status ?? 1);
}
process.env.LOCAL_DB_PATH = resolve(testDirectory, 'test.sqlite');
process.env.LOCAL_CREDENTIAL_KEY_PATH = resolve(testDirectory, 'credential.key');
await mkdir(testDirectory, { recursive: true });

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
	const repositories = await server.ssrLoadModule('/src/lib/server/db/repositories.ts');
	const sentinel = 'SENTINEL-COOKIE-MUST-NOT-APPEAR';
	const id = repositories.saveLeague({ platform: 'ESPN', externalId: 'security-test', seasonYear: 2026, name: 'Security Test', teamCount: 0, auth: { espn_s2: sentinel, swid: '{local}' } });
	const database = await server.ssrLoadModule('/src/lib/server/db/database.ts');
	const raw = database.getDatabase().prepare('SELECT auth_json FROM leagues WHERE id=?').get(id).auth_json;
	if (!raw.startsWith('enc:v1:') || raw.includes(sentinel)) throw new Error('Credential was not encrypted in SQLite');
	const league = repositories.getLeague(id);
	if (league.auth.espn_s2 !== sentinel) throw new Error('Credential did not decrypt through repository');
	console.log(JSON.stringify({ encryptedAtRest: true, authenticatedRoundTrip: true }));
	repositories.closeRepositoryDatabase();
	database.closeDatabase();
} finally {
	await server.close();
}
