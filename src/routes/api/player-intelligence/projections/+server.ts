import { json } from '@sveltejs/kit';
import { importProjectionCsv, projectionStatus, projectionTemplate } from '$lib/server/player-sources/projections';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	if (url.searchParams.has('template')) return new Response(projectionTemplate, { headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="projection-template.csv"' } });
	const seasonYear = Number(url.searchParams.get('seasonYear')) || new Date().getFullYear();
	return json({ projection: projectionStatus(seasonYear) }, { headers: { 'cache-control': 'no-store' } });
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const form = await request.formData(); const file = form.get('file');
		if (!(file instanceof File)) return json({ message: 'Choose a projection CSV file' }, { status: 400 });
		if (file.size > 5_000_000) return json({ message: 'Projection CSV must be smaller than 5 MB' }, { status: 413 });
		return json(importProjectionCsv(await file.text(), { source: String(form.get('source') || file.name.replace(/\.csv$/i, '')), seasonYear: Number(form.get('seasonYear')) || new Date().getFullYear(), scoringFormat: String(form.get('scoringFormat') || 'PPR') }));
	} catch (cause) { return json({ message: cause instanceof Error ? cause.message : 'Projection import failed' }, { status: 400 }); }
};
