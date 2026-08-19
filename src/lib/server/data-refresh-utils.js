import { extname, parse } from 'node:path';

/** @param {string} filename */
export function projectionFilename(filename) {
	if (extname(filename).toLowerCase() !== '.csv') throw new Error('Watched projection files must be CSV');
	const parts = parse(filename).name.split('--').map((part) => part.trim()).filter(Boolean);
	const maybeYear = Number(parts.at(-2));
	const seasonYear = Number.isInteger(maybeYear) && maybeYear >= 2020 && maybeYear <= 2100 ? maybeYear : new Date().getFullYear();
	const scoringFormat = seasonYear === maybeYear ? (parts.at(-1) || 'PPR').toUpperCase() : 'PPR';
	const sourceParts = seasonYear === maybeYear ? parts.slice(0, -2) : parts;
	const source = sourceParts.join(' ').replace(/[^a-z0-9 ._()-]/gi, '').trim() || 'watched-import';
	return { source, seasonYear, scoringFormat };
}
