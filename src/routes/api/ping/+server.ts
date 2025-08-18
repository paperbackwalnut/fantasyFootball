// src/routes/api/ping/+server.ts
import { json } from '@sveltejs/kit';

export const GET = () => {
	console.log('[ping] hit', new Date().toISOString(), 'SSR?', import.meta.env.SSR);
	return json({ ok: true, time: Date.now() });
};
