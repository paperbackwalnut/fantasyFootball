import { listLeagues } from '$lib/server/db/repositories';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async () => json({ leagues: listLeagues('SLEEPER') });
