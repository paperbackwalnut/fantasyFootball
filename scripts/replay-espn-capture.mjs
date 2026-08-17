import { readFile } from 'node:fs/promises';
import { reduceDraftSnapshot } from '../src/lib/server/espn-sync/draft-state.js';

const capturePath = process.argv[2];
if (!capturePath) throw new Error('Usage: npm run replay:sync -- <capture.json>');

const [capture, catalog] = await Promise.all([
	readFile(capturePath, 'utf8').then(JSON.parse),
	readFile(new URL('../src/lib/data/master_players_enriched.json', import.meta.url), 'utf8').then(JSON.parse)
]);
const observations = Array.isArray(capture.observations) ? capture.observations : [];
const authoritative = observations.filter((observation) =>
	observation.type === 'dom_snapshot' && observation.data?.source === 'espn-pick-history'
);
if (!authoritative.length) throw new Error('Capture has no authoritative ESPN Pick History snapshot');
const latest = authoritative.at(-1);
const state = reduceDraftSnapshot(latest.data, catalog, latest.capturedAt);
console.log(JSON.stringify({
	updatedAt: state.updatedAt,
	currentPick: state.currentPick,
	completed: state.completed,
	picks: state.picks.length,
	teams: state.teams.length,
	resolved: state.sync.resolvedCount,
	unresolved: state.sync.unresolvedCount,
	availablePlayers: state.availablePlayers.length,
	unmatched: state.picks.filter((pick) => !pick.playerId).map((pick) => pick.playerName)
}, null, 2));
