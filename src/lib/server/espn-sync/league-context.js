const defaultRoster = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BENCH: 7, IR: 0 };
/** @type {Record<string, string>} */
const espnSlotNames = { '0': 'QB', '2': 'RB', '4': 'WR', '6': 'TE', '16': 'DST', '17': 'K', '20': 'BENCH', '21': 'IR', '23': 'FLEX', '24': 'FLEX', '25': 'SUPERFLEX' };

/** @param {any} state @param {any} [importedLeague] */
export function deriveLeagueContext(state, importedLeague) {
	const url = safeUrl(state?.draftUrl);
	const userTeamId = importedLeague?.user_team_id ? String(importedLeague.user_team_id) : url?.searchParams.get('teamId');
	const leagueId = importedLeague?.external_id ? String(importedLeague.external_id) : url?.searchParams.get('leagueId');
	const seasonYear = Number(importedLeague?.season_year ?? url?.searchParams.get('seasonId')) || new Date().getFullYear();
	const teams = state?.teams ?? [];
	const picks = state?.picks ?? [];
	const userTeam = teams.find((/** @type {any} */ team) => String(team.id) === String(userTeamId)) ?? null;
	const firstRound = picks.filter((/** @type {any} */ pick) => pick.pickNumber <= teams.length);
	const draftSlot = firstRound.findIndex((/** @type {any} */ pick) => String(pick.teamId) === String(userTeamId)) + 1 || Number(state?.draftSlotHint) || null;
	const currentPick = Number(state?.currentPick ?? picks.length + 1);
	const completed = Boolean(state?.completed || (teams.length > 0 && currentPick === picks.length + 1 && picks.length >= teams.length * 17 && picks.length % teams.length === 0));
	const nextUserPick = completed ? null : findNextPick(currentPick, teams.length, draftSlot);
	/** @type {Record<string, number>} */
	const rosterCounts = {};
	for (const pick of userTeam?.picks ?? []) rosterCounts[pick.position ?? 'UNKNOWN'] = (rosterCounts[pick.position ?? 'UNKNOWN'] ?? 0) + 1;
	const settings = importedLeague?.settings_json ? JSON.parse(importedLeague.settings_json) : null;
	const espnSettings = settings?.espn_data ?? settings;
	return {
		leagueId, seasonYear, userTeamId: userTeamId ?? null, userTeamName: userTeam?.name ?? null,
		teamCount: teams.length || importedLeague?.team_count || 0, draftType: importedLeague?.draft_type ?? 'SNAKE', draftSlot,
		rosterSizeHint: Number(state?.rosterSizeHint) || null,
		currentPick, completed, nextUserPick, picksUntilNextTurn: nextUserPick ? Math.max(0, nextUserPick - currentPick) : null,
		scoring: scoringLabel(espnSettings?.scoringSettings), rosterSlots: normalizeRosterSlots(espnSettings?.rosterSettings?.lineupSlotCounts),
		settingsSource: espnSettings ? 'league-import' : 'safe-defaults', rosterCounts,
		needsLeagueImport: !espnSettings, userTeamDetected: Boolean(userTeam)
	};
}

/** @param {Record<string, number> | null | undefined} slots */
export function normalizeRosterSlots(slots) {
	if (!slots) return { ...defaultRoster };
	/** @type {Record<string, number>} */
	const normalized = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPERFLEX: 0, DST: 0, K: 0, BENCH: 0, IR: 0 };
	for (const [raw, count] of Object.entries(slots)) {
		const key = espnSlotNames[raw] ?? raw.toUpperCase();
		if (key in normalized) normalized[key] += Number(count) || 0;
	}
	return Object.values(normalized).some(Boolean) ? normalized : { ...defaultRoster };
}

/** @param {number} current @param {number} teamCount @param {number | null} slot */
function findNextPick(current, teamCount, slot) {
	if (!teamCount || !slot) return null;
	for (let pick = current; pick < current + teamCount * 3; pick++) {
		const round = Math.floor((pick - 1) / teamCount) + 1;
		const withinRound = ((pick - 1) % teamCount) + 1;
		const owningSlot = round % 2 ? withinRound : teamCount - withinRound + 1;
		if (owningSlot === slot) return pick;
	}
	return null;
}

/** @param {any} settings */
function scoringLabel(settings) {
	if (!settings) return { format: 'UNKNOWN', receptionPoints: null, rules: {}, recognizedRules: 0, unknownRuleIds: [] };
	const knownStatIds = new Set([3, 4, 19, 20, 24, 25, 26, 42, 43, 44, 53, 72]);
	const rules = Object.fromEntries((settings.scoringItems ?? [])
		.map((/** @type {any} */ item) => [String(Number(item.statId)), Number(item.points)])
		.filter((/** @type {[string, number]} */ entry) => entry[0] !== 'NaN' && Number.isFinite(entry[1])));
	const reception = rules['53'];
	return {
		format: reception === 1 ? 'PPR' : reception === 0.5 ? 'HALF_PPR' : reception === 0 ? 'STANDARD' : 'CUSTOM',
		receptionPoints: reception ?? null, rules,
		recognizedRules: Object.keys(rules).filter((id) => knownStatIds.has(Number(id))).length,
		unknownRuleIds: Object.keys(rules).filter((id) => !knownStatIds.has(Number(id)))
	};
}

/** @param {unknown} value */
function safeUrl(value) {
	try { return typeof value === 'string' ? new URL(value) : null; } catch { return null; }
}
