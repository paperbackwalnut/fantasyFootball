/** @param {string} input */
export function parseCsv(input) {
	/** @type {string[][]} */
	const rows = [];
	let row = [];
	let field = '';
	let quoted = false;
	for (let index = 0; index < input.length; index++) {
		const char = input[index];
		if (quoted) {
			if (char === '"' && input[index + 1] === '"') { field += '"'; index++; }
			else if (char === '"') quoted = false;
			else field += char;
		} else if (char === '"') quoted = true;
		else if (char === ',') { row.push(field); field = ''; }
		else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
		else field += char;
	}
	if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
	const headers = rows.shift() ?? [];
	return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}
