import { getLeagueTeams } from '$lib/server/db/repositories';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ params }) => json({ teams: getLeagueTeams(params.leagueId) });
