import { createBackup, listBackups, restoreBackup } from '$lib/server/db/backup';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json({ backups: await listBackups() });
export const POST: RequestHandler = async () => json({ backup: await createBackup() }, { status: 201 });
export const PUT: RequestHandler = async ({ request }) => {
	const { name } = await request.json();
	return json({ restore: await restoreBackup(String(name ?? '')) });
};
