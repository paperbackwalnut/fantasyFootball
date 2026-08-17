import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { closeDatabase, databasePath, getDatabase } from './database';

const backupDirectory = resolve('.data', 'backups');

export async function createBackup() {
	await mkdir(backupDirectory, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const target = resolve(backupDirectory, `fantasy-football-${stamp}.sqlite`);
	await getDatabase().backup(target);
	return { name: basename(target), createdAt: new Date().toISOString(), size: (await stat(target)).size };
}

export async function listBackups() {
	await mkdir(backupDirectory, { recursive: true });
	const names = (await readdir(backupDirectory)).filter((name) => /^fantasy-football-.*\.sqlite$/.test(name));
	return Promise.all(names.sort().reverse().map(async (name) => ({ name, size: (await stat(resolve(backupDirectory, name))).size })));
}

export async function restoreBackup(name: string) {
	if (!/^fantasy-football-[\w.-]+\.sqlite$/.test(name)) throw new Error('Invalid backup name');
	const source = resolve(backupDirectory, name);
	await stat(source);
	closeDatabase();
	await copyFile(source, databasePath);
	getDatabase();
	return { name, restoredAt: new Date().toISOString() };
}
