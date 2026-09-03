import { createHash, randomUUID } from 'node:crypto';
import { getDatabase } from '$lib/server/db/database';
import { deriveLeagueContext } from '$lib/server/espn-sync/league-context.js';
import { rankedAvailablePlayers } from '$lib/server/player-intelligence';
import { analyzeDraftMarket } from '$lib/server/draft-market.js';
import { recommendPlayers } from '$lib/server/recommendations.js';
import { applyLeagueValuation } from '$lib/server/valuation.js';
import { runShortHorizonRollouts } from '$lib/server/draft-rollout.js';

const MODEL_VERSION = 'draft-advisor-2.1.0';

export function draftStateHash(draft: any) {
	return hash(JSON.stringify({ url: draft?.draftUrl, currentPick: draft?.currentPick, completed: draft?.completed, onClock: draft?.userIsOnTheClock, rosterSizeHint: draft?.rosterSizeHint,
		picks: (draft?.picks ?? []).map((pick: any) => [pick.pickNumber, pick.teamId, pick.catalogId ?? pick.playerName]),
		visible: (draft?.espnObservedAvailable ?? []).map((player: any) => [player.espnPlayerId ?? player.name, player.displayedRank, player.projectedPoints]) }));
}

export function buildDraftAdvice(draft: any) {
	const started = performance.now();
	if (!draft?.picks || draft.completed) return { recommendations: [], market: analyzeDraftMarket(draft?.picks ?? []), context: null, run: null };
	const db = getDatabase();
	const url = safeUrl(draft.draftUrl);
	const externalId = url?.searchParams.get('leagueId');
	const seasonYear = Number(url?.searchParams.get('seasonId')) || new Date().getFullYear();
	const importedLeague = externalId ? db.prepare('SELECT * FROM leagues WHERE platform=? AND external_id=? AND season_year=?').get('ESPN', externalId, seasonYear) : null;
	const baseContext = deriveLeagueContext(draft, importedLeague);
	const context = { ...baseContext, ...deriveRosterByeContext(db, draft, baseContext.userTeamId) };
	const stateHash = draftStateHash(draft);
	const manifest = ensureManifest(context, seasonYear);
	const existing = db.prepare(`SELECT id FROM recommendation_runs WHERE platform='ESPN' AND state_hash=? AND model_manifest_id=?`).get(stateHash, manifest.id) as { id: string } | undefined;
	const market = analyzeDraftMarket(draft.picks);
	if (existing) {
		const stored = db.prepare('SELECT details_json FROM recommendation_candidates WHERE run_id=? ORDER BY rank').all(existing.id) as { details_json: string }[];
		return { recommendations: stored.map((row) => JSON.parse(row.details_json)), market, context, run: { id: existing.id, modelVersion: MODEL_VERSION, cached: true } };
	}
	const base = rankedAvailablePlayers(seasonYear, context.teamCount || 10, draft.picks, draft.espnObservedAvailable, context.scoring);
	const valued = applyLeagueValuation(base, context, draft.teams ?? []);
	const initialRecommendations = recommendPlayers(valued, context, market);
	const rollout = runShortHorizonRollouts(initialRecommendations, valued, context, market, stateHash);
	const recommendations = rollout.recommendations;
	const runId = randomUUID();
	const now = new Date().toISOString();
	db.transaction(() => {
		db.prepare(`INSERT INTO recommendation_runs(id,platform,external_id,season_year,user_team_id,current_pick,state_hash,model_manifest_id,status,runtime_ms,simulation_count,context_json,created_at,completed_at)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(runId, 'ESPN', externalId, seasonYear, context.userTeamId, context.currentPick, stateHash, manifest.id, rollout.meta.status, Math.round(performance.now() - started), rollout.meta.iterations, JSON.stringify({ ...context, rollout: rollout.meta }), now, now);
		const insert = db.prepare(`INSERT INTO recommendation_candidates(run_id,player_id,rank,expected_roster_value,starter_points_added,vor,survival_probability,downside,upside,confidence,details_json)
			VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
		for (const player of recommendations) {
			const confidence = projectionConfidence(player);
			insert.run(runId, String(player.catalogId ?? player.id ?? player.name), player.recommendationRank, player.expectedRosterValue ?? null, null, player.pointVorp ?? null,
				1 - Number(player.availabilityRisk ?? 0) / 100, null, null, confidence, JSON.stringify(player));
		}
	})();
	return { recommendations, market, context, run: { id: runId, modelVersion: MODEL_VERSION, cached: false } };
}

function ensureManifest(context: any, seasonYear: number) {
	const db = getDatabase();
	const sources = db.prepare('SELECT source,MAX(fetched_at) fetchedAt,COUNT(*) rows FROM player_values WHERE season_year=? GROUP BY source ORDER BY source').all(seasonYear);
	const leagueSettingsHash = hash(JSON.stringify({ scoring: context.scoring, rosterSlots: context.rosterSlots, teamCount: context.teamCount }));
	const inputs = { seasonYear, sources };
	const id = hash(`${MODEL_VERSION}:${leagueSettingsHash}:${JSON.stringify(inputs)}`);
	db.prepare(`INSERT OR IGNORE INTO model_manifests(id,model_version,league_settings_hash,inputs_json,generated_at) VALUES(?,?,?,?,?)`)
		.run(id, MODEL_VERSION, leagueSettingsHash, JSON.stringify(inputs), new Date().toISOString());
	return { id, modelVersion: MODEL_VERSION };
}

function projectionConfidence(player: any) {
	const count = Number(player.projectionSourceCount ?? 0);
	const disagreement = Number(player.projectionDisagreement ?? 0);
	return Math.max(0.15, Math.min(0.95, 0.35 + count * 0.12 - disagreement / 250 + (player.espnVerified ? 0.08 : 0)));
}

function deriveRosterByeContext(db: any, draft: any, userTeamId: string | null) {
	const userTeam = (draft.teams ?? []).find((team: any) => String(team.id) === String(userTeamId));
	const byes: Record<string, number> = {};
	const positionByes: Record<string, Record<string, number>> = {};
	const lookup = db.prepare('SELECT position,bye_week byeWeek FROM players WHERE id=?');
	for (const pick of userTeam?.picks ?? []) {
		if (!pick.catalogId) continue;
		const player = lookup.get(pick.catalogId) as { position?: string | null; byeWeek?: number | null } | undefined;
		const bye = Number(player?.byeWeek);
		const position = player?.position ?? pick.position;
		if (!Number.isInteger(bye) || bye <= 0 || !position) continue;
		byes[String(bye)] = (byes[String(bye)] ?? 0) + 1;
		positionByes[position] ??= {};
		positionByes[position][String(bye)] = (positionByes[position][String(bye)] ?? 0) + 1;
	}
	return { rosterByeCounts: byes, rosterPositionByeCounts: positionByes };
}

function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function safeUrl(value: unknown) { try { return typeof value === 'string' ? new URL(value) : null; } catch { return null; } }
