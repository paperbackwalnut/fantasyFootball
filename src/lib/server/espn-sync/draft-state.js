/** @typedef {{ id?: string | null, espn_id?: string | null, full_name?: string | null, sleeper_name?: string | null, fantasypros_name?: string | null, team_abbr?: string | null, default_position_id?: string | number | null, active?: string | boolean | null }} CatalogPlayer */
/** @typedef {{ pick?: string, espnPlayerId?: string | null, name?: string, team?: string, detail?: string }} SnapshotPick */

const suffixPattern = /\b(?:jr|sr|ii|iii|iv|v)\b/g;
const nameAliases = new Map([['kenny gainwell', 'kenneth gainwell']]);
const positionOverrides = new Map([
	['malik nabers', 'WR'], ['alec pierce', 'WR'], ['travis hunter', 'WR'],
	['makai lemon', 'WR'], ['kc concepcion', 'WR'], ['zach charbonnet', 'RB']
]);

/** @param {string | null | undefined} value */
export function normalizePlayerName(value) {
	const normalized = (value ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[’']/g, '')
		.replace(suffixPattern, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
	return nameAliases.get(normalized) ?? normalized;
}

/** @param {string} detail @param {string} name */
export function parsePlayerDetail(detail, name) {
	const compact = detail.replace(name, '').replace(/\s+/g, '').toUpperCase();
	const match = compact.match(/^([A-Z]{2,3})(QB|RB|WR|TE|K|DST|D\/ST)$/);
	return match ? { nflTeam: match[1], position: match[2] === 'D/ST' ? 'DST' : match[2] } : { nflTeam: null, position: null };
}

/** @param {CatalogPlayer[]} catalog */
export function createPlayerIndex(catalog) {
	/** @type {Map<string, CatalogPlayer[]>} */
	const byName = new Map();
	/** @type {Map<string, CatalogPlayer>} */
	const byEspnId = new Map();
	for (const candidate of catalog) {
		if (candidate.espn_id) byEspnId.set(String(candidate.espn_id), candidate);
		for (const sourceName of [candidate.full_name, candidate.sleeper_name, candidate.fantasypros_name]) {
			const key = normalizePlayerName(sourceName);
			if (!key) continue;
			const matches = byName.get(key) ?? [];
			if (!matches.includes(candidate)) matches.push(candidate);
			byName.set(key, matches);
		}
	}
	return { byName, byEspnId, catalog };
}

/** @param {SnapshotPick} pick @param {ReturnType<typeof createPlayerIndex>} index */
export function resolvePlayer(pick, index) {
	const detail = parsePlayerDetail(pick.detail ?? '', pick.name ?? '');
	detail.position ??= positionOverrides.get(normalizePlayerName(pick.name)) ?? null;
	if (pick.espnPlayerId && index.byEspnId.has(String(pick.espnPlayerId))) {
		const player = index.byEspnId.get(String(pick.espnPlayerId)) ?? null;
		detail.position ??= catalogPosition(player);
		return { player, confidence: 'espn-id', ...detail };
	}
	const candidates = index.byName.get(normalizePlayerName(pick.name)) ?? [];
	if (candidates.length === 1) { detail.position ??= catalogPosition(candidates[0]); return { player: candidates[0], confidence: 'exact-name', ...detail }; }
	const teamMatches = detail.nflTeam ? candidates.filter((candidate) => candidate.team_abbr === detail.nflTeam) : [];
	if (teamMatches.length === 1) { detail.position ??= catalogPosition(teamMatches[0]); return { player: teamMatches[0], confidence: 'name-team', ...detail }; }
	const fantasyCandidates = candidates.filter((candidate) => candidate.sleeper_name || candidate.fantasypros_name);
	if (fantasyCandidates.length === 1) { detail.position ??= catalogPosition(fantasyCandidates[0]); return { player: fantasyCandidates[0], confidence: 'fantasy-catalog', ...detail }; }
	return { player: null, confidence: candidates.length ? 'ambiguous' : 'unmatched', ...detail };
}

/** @param {CatalogPlayer | null | undefined} player */
function catalogPosition(player) {
	return ({ '1': 'QB', '2': 'RB', '3': 'WR', '4': 'TE', '5': 'K', '16': 'DST' })[String(player?.default_position_id ?? '')] ?? null;
}

/** @param {Record<string, any>} snapshot @param {CatalogPlayer[]} catalog @param {string} capturedAt */
export function reduceDraftSnapshot(snapshot, catalog, capturedAt) {
	const index = createPlayerIndex(catalog);
	const teams = Array.isArray(snapshot.teams) ? snapshot.teams : [];
	/** @type {Map<string, { id: string, name: string, picks: any[] }>} */
	const teamByName = new Map(teams.map((team) => [team.name, { id: String(team.id ?? ''), name: team.name, picks: [] }]));
	const draftedEspnIds = new Set();
	let resolvedCount = 0;
	const picks = (Array.isArray(snapshot.historyPicks) ? snapshot.historyPicks : []).map((pick, offset) => {
		const resolution = resolvePlayer(pick, index);
		const espnPlayerId = resolution.player?.espn_id ? String(resolution.player.espn_id) : pick.espnPlayerId || null;
		if (espnPlayerId) draftedEspnIds.add(espnPlayerId);
		if (resolution.player) resolvedCount += 1;
		const normalizedPick = {
			pickNumber: Number(pick.pick) || offset + 1,
			round: Math.floor(offset / Math.max(teams.length, 1)) + 1,
			teamId: teamByName.get(pick.team)?.id ?? null,
			teamName: pick.team ?? '',
			playerId: resolution.player?.espn_id ?? null,
			playerKey: resolution.player?.espn_id ? `espn:${resolution.player.espn_id}` : `name:${normalizePlayerName(pick.name)}`,
			catalogId: resolution.player?.id ?? null,
			playerName: pick.name ?? '',
			position: resolution.position,
			nflTeam: resolution.nflTeam ?? resolution.player?.team_abbr ?? null,
			matchConfidence: resolution.confidence
		};
		teamByName.get(pick.team)?.picks.push(normalizedPick);
		return normalizedPick;
	});
	const activeCatalog = catalog.filter((player) => player.active === true || player.active === 'true');
	return {
		schemaVersion: 2,
		platform: 'espn',
		updatedAt: capturedAt,
		draftUrl: snapshot.url ?? null,
		draftKind: ['MOCK', 'LEAGUE'].includes(snapshot.draftKind) ? snapshot.draftKind : 'UNKNOWN',
		roomLabel: snapshot.roomLabel ?? null,
		draftSlotHint: Number(snapshot.draftSlotHint) || null,
		preDraft: Boolean(snapshot.preDraft),
		currentPick: snapshot.currentPick ?? (picks.length + 1),
		completed: Boolean(snapshot.completed),
		userIsOnTheClock: Boolean(snapshot.userIsOnTheClock),
		sync: {
			source: snapshot.source ?? 'espn-pick-history',
			status: 'live',
			pickCount: picks.length,
			resolvedCount,
			unresolvedCount: picks.length - resolvedCount
		},
		picks,
		teams: [...teamByName.values()],
		espnObservedAvailable: Array.isArray(snapshot.espnObservedAvailable) ? snapshot.espnObservedAvailable : [],
		availablePlayers: activeCatalog
			.filter((player) => player.espn_id && !draftedEspnIds.has(String(player.espn_id)))
			.map((player) => ({ id: String(player.espn_id), catalogId: player.id ?? null, name: player.full_name ?? '', nflTeam: player.team_abbr || null }))
	};
}
