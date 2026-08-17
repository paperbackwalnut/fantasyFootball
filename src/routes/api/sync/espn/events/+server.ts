import { timingSafeEqual } from 'node:crypto';
import { appendObservations, readSyncStatus, type SyncObservation } from '$lib/server/espn-sync/store';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_BATCH_SIZE = 500;

export const OPTIONS: RequestHandler = async () => new Response(null, { status: 204, headers: corsHeaders() });

export const GET: RequestHandler = async () => {
	return json({ configured: Boolean(env.ESPN_SYNC_TOKEN), ...(await readSyncStatus()) }, { headers: corsHeaders() });
};

export const POST: RequestHandler = async ({ request }) => {
	if (!env.ESPN_SYNC_TOKEN) throw error(503, 'ESPN sync receiver is not configured');
	if (!matchesToken(request.headers.get('x-espn-sync-token'), env.ESPN_SYNC_TOKEN)) throw error(401, 'Invalid pairing token');
	const length = Number(request.headers.get('content-length') ?? 0);
	if (length > MAX_BODY_BYTES) throw error(413, 'Capture batch is too large');

	const raw = await request.text();
	if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw error(413, 'Capture batch is too large');
	let body: unknown;
	try { body = JSON.parse(raw); } catch { throw error(400, 'Invalid JSON'); }
	const candidates = (body as { observations?: unknown })?.observations;
	if (!Array.isArray(candidates) || candidates.length === 0) throw error(400, 'No observations supplied');
	if (candidates.length > MAX_BATCH_SIZE) throw error(413, `Maximum batch size is ${MAX_BATCH_SIZE}`);

	const observations = candidates.map(validateObservation);
	await appendObservations(observations);
	return json({ ok: true, accepted: observations.length }, { headers: corsHeaders() });
};

function validateObservation(value: unknown, index: number): SyncObservation {
	if (!value || typeof value !== 'object') throw error(400, `Observation ${index} is invalid`);
	const candidate = value as Partial<SyncObservation>;
	if (candidate.schemaVersion !== 1 || typeof candidate.id !== 'string' || typeof candidate.capturedAt !== 'string' || typeof candidate.type !== 'string') {
		throw error(400, `Observation ${index} has an invalid envelope`);
	}
	if (Number.isNaN(Date.parse(candidate.capturedAt))) throw error(400, `Observation ${index} has an invalid timestamp`);
	return { schemaVersion: 1, id: candidate.id.slice(0, 200), capturedAt: candidate.capturedAt, type: candidate.type.slice(0, 100), data: candidate.data ?? null };
}

function matchesToken(received: string | null, expected: string) {
	if (!received) return false;
	const left = Buffer.from(received);
	const right = Buffer.from(expected);
	return left.length === right.length && timingSafeEqual(left, right);
}

function corsHeaders() {
	return {
		'access-control-allow-origin': '*',
		'access-control-allow-methods': 'GET,POST,OPTIONS',
		'access-control-allow-headers': 'content-type,x-espn-sync-token',
		'access-control-allow-private-network': 'true',
		'cache-control': 'no-store'
	};
}
