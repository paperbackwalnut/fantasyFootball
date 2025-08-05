<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { LayoutData } from './$types';

	export let data: LayoutData;

	$: ({ supabase, session, user } = data);

	onMount(() => {
		const { data: authData } = supabase.auth.onAuthStateChange((event, _session) => {
			if (_session?.expires_at !== session?.expires_at) {
				invalidate('supabase:auth');
			}
		});

		return () => authData.subscription.unsubscribe();
	});
</script>

<div class="app">
	{#if session && user}
		<nav>
			<h1>Fantasy Draft Assistant</h1>
			<div class="user-info">
				<span>Welcome, {user.email}</span>
				<form action="/auth/signout" method="post">
					<button type="submit">Sign Out</button>
				</form>
			</div>
		</nav>
	{/if}

	<main>
		<slot />
	</main>
</div>

<style>
	nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: #f5f5f5;
		border-bottom: 1px solid #ddd;
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	main {
		padding: 2rem;
	}
</style>
