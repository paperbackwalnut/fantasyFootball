import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { databasePath, getDatabase } from '$lib/server/db/database';
import { refreshSleeperPlayers, sleeperRefreshStatus } from '$lib/server/player-sources/sleeper';
import { consensusRankingStatus, refreshConsensusRankings } from '$lib/server/player-sources/rankings';
import { mflAdpStatus, refreshMflAdp } from '$lib/server/player-sources/adp';
import { importProjectionCsv } from '$lib/server/player-sources/projections';
import { projectionFilename } from './data-refresh-utils.js';

export { projectionFilename } from './data-refresh-utils.js';

const importsDirectory = join(dirname(databasePath), 'imports', 'projections');
const archiveDirectory = join(importsDirectory, 'archive');
const inFlight = new Map<string, Promise<unknown>>();
let schedulerStarted = false;

export function projectionImportDirectory() { return importsDirectory; }

export function startDataRefreshScheduler() {
	if (schedulerStarted) return;
	schedulerStarted = true;
	mkdirSync(archiveDirectory, { recursive: true });
	setTimeout(() => void refreshPlayerData({ force: false }).catch(() => {}), 750).unref?.();
	setInterval(() => void refreshPlayerData({ force: false }).catch(() => {}), 15 * 60 * 1000).unref?.();
}

export async function refreshPlayerData(options: { force?: boolean; teamCount?: number } = {}) {
	const force = Boolean(options.force);
	const teamCount = Number(options.teamCount) || 10;
	const results: Record<string, unknown> = {};
	results.watchedImports = await runProvider('watched-projections', () => scanWatchedProjectionImports(), true);
	const [sleeper, rankings, adp] = await Promise.all([
		runProvider('sleeper', refreshSleeperPlayers, force || isStale(sleeperRefreshStatus())),
		runProvider('consensus-rankings', refreshConsensusRankings, force || isStale(consensusRankingStatus())),
		runProvider(`mfl-adp-${teamCount}`, () => refreshMflAdp(teamCount), force || isStale(mflAdpStatus(teamCount)))
	]);
	Object.assign(results, { sleeper, rankings, adp });
	return { results, health: providerHealth() };
}

async function runProvider(name: string, work: () => unknown | Promise<unknown>, shouldRun: boolean) {
	if (!shouldRun) return { status: 'fresh', skipped: true };
	if (inFlight.has(name)) return inFlight.get(name);
	const promise = Promise.resolve().then(work).then((result) => {
		writeHealth(name, 'healthy', null, result);
		return result;
	}).catch((cause) => {
		const message = cause instanceof Error ? cause.message : String(cause);
		writeHealth(name, 'failed', message, null);
		return { status: 'failed', message };
	}).finally(() => inFlight.delete(name));
	inFlight.set(name, promise);
	return promise;
}

export function scanWatchedProjectionImports() {
	mkdirSync(archiveDirectory, { recursive: true });
	const files = existsSync(importsDirectory)
		? readdirSync(importsDirectory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv')).map((entry) => join(importsDirectory, entry.name))
		: [];
	const imported = [];
	for (const file of files) {
		const descriptor = projectionFilename(basename(file));
		const csv = readFileSync(file, 'utf8');
		const result = importProjectionCsv(csv, { ...descriptor, minimumMatchRate: 0.5 });
		const archivedName = `${new Date().toISOString().replace(/[:.]/g, '-') }--${basename(file)}`;
		renameSync(file, join(archiveDirectory, archivedName));
		imported.push({ file: basename(file), archive: archivedName, ...result });
	}
	return { status: 'healthy', directory: importsDirectory, imported };
}

export function providerHealth() {
	const rows = getDatabase().prepare("SELECT key,value_json,updated_at FROM provider_cache WHERE key LIKE 'provider-health:%' ORDER BY key").all() as any[];
	return rows.map((row) => ({ provider: row.key.slice('provider-health:'.length), ...JSON.parse(row.value_json), updatedAt: row.updated_at }));
}

function writeHealth(provider: string, status: string, error: string | null, result: unknown) {
	const now = new Date().toISOString();
	const previous = getDatabase().prepare('SELECT value_json FROM provider_cache WHERE key=?').get(`provider-health:${provider}`) as { value_json: string } | undefined;
	const lastSuccessAt = status === 'healthy' ? now : previous ? JSON.parse(previous.value_json).lastSuccessAt ?? null : null;
	getDatabase().prepare(`INSERT INTO provider_cache(key,value_json,updated_at) VALUES(?,?,?)
		ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`)
		.run(`provider-health:${provider}`, JSON.stringify({ status, error, lastSuccessAt, summary: summarize(result) }), now);
}

function summarize(result: any) {
	if (!result || typeof result !== 'object') return null;
	return Object.fromEntries(Object.entries(result).filter(([key, value]) => ['source','players','imported','rows','totalDrafts','directory'].includes(key) && ['string','number'].includes(typeof value)));
}

function isStale(status: any) { return !status || status.stale; }
