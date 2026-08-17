import { timingSafeEqual, randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { getDatabase } from '$lib/server/db/database';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const OPTIONS: RequestHandler = async () => new Response(null, { status: 204, headers: corsHeaders() });

export const GET: RequestHandler = async ({ request }) => {
	requireExtensionToken(request);
	const row = getDatabase().prepare("SELECT value_json,expires_at FROM provider_cache WHERE key='espn:draft-command:pending'").get() as any;
	if (!row || (row.expires_at && new Date(row.expires_at) <= new Date())) return json({ command: null }, { headers: corsHeaders() });
	return json({ command: JSON.parse(row.value_json) }, { headers: corsHeaders() });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({})) as any;
	const db = getDatabase();
	if (request.headers.get('x-espn-sync-token')) {
		requireExtensionToken(request);
		const pending = db.prepare("SELECT value_json FROM provider_cache WHERE key='espn:draft-command:pending'").get() as any;
		if (pending && JSON.parse(pending.value_json).id === body.commandId) db.prepare("DELETE FROM provider_cache WHERE key='espn:draft-command:pending'").run();
		db.prepare(`INSERT INTO provider_cache(key,value_json,updated_at) VALUES('espn:draft-command:last-result',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`)
			.run(JSON.stringify({ commandId: body.commandId, ok: Boolean(body.ok), message: String(body.message || ''), at: new Date().toISOString() }), new Date().toISOString());
		return json({ ok: true }, { headers: corsHeaders() });
	}
	requireLocalDashboard(request);
	const stateRow = db.prepare("SELECT state_json FROM live_draft_state WHERE platform='ESPN'").get() as any;
	const state = stateRow ? JSON.parse(stateRow.state_json) : null;
	if (!state?.userIsOnTheClock) throw error(409, 'ESPN does not currently show you on the clock');
	if (!body.playerName) throw error(400, 'Player name is required');
	const now = new Date();
	const command = { id: randomUUID(), type: 'draft-player', playerId: body.playerId ? String(body.playerId) : null, playerName: String(body.playerName).slice(0, 120), createdAt: now.toISOString() };
	db.prepare(`INSERT INTO provider_cache(key,value_json,expires_at,updated_at) VALUES('espn:draft-command:pending',?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
		.run(JSON.stringify(command), new Date(now.getTime() + 30_000).toISOString(), now.toISOString());
	return json({ ok: true, command });
};

function requireExtensionToken(request: Request) {
	if (!env.ESPN_SYNC_TOKEN) throw error(503, 'ESPN sync receiver is not configured');
	const received = request.headers.get('x-espn-sync-token');
	const left = Buffer.from(received || ''); const right = Buffer.from(env.ESPN_SYNC_TOKEN);
	if (left.length !== right.length || !timingSafeEqual(left, right)) throw error(401, 'Invalid pairing token');
}

function requireLocalDashboard(request: Request) {
	try {
		const origin = new URL(request.headers.get('origin') || '');
		if (origin.hostname === '127.0.0.1' || origin.hostname === 'localhost') return;
	} catch {}
	throw error(403, 'Draft commands are accepted only from the local dashboard');
}

function corsHeaders() { return { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,x-espn-sync-token', 'access-control-allow-private-network': 'true', 'cache-control': 'no-store' }; }
