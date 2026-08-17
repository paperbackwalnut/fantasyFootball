/** @param {string} name @param {string | undefined} position */
export function normalizeMflName(name, position) {
	if (position === 'Def') return name.includes(',') ? name.split(',').reverse().join(' ').trim() : name;
	const [last, ...rest] = name.split(',');
	return rest.length ? `${rest.join(',').trim()} ${last.trim()}` : name.trim();
}
