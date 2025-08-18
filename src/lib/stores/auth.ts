// src/lib/stores/auth.ts
import { writable } from 'svelte/store';
import type { User } from '$lib/types/authTypes';

export const user = writable<User | null>(null);
export const loading = writable(true);

export async function checkAuth() {
	try {
		const response = await fetch('/api/auth/me');
		if (response.ok) {
			const userData = await response.json();
			user.set(userData);
		} else {
			user.set(null);
		}
	} catch (e) {
		console.error('Error fetching user data:', e);
		user.set(null);
	} finally {
		loading.set(false);
	}
}

export async function logout() {
	await fetch('/api/auth/logout', { method: 'POST' });
	user.set(null);
}
