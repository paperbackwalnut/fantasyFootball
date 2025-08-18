<!-- +layout.svelte -->
<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '../app.css';

	let { data, children } = $props();
	let { session, supabase, user } = $derived(data);

	onMount(() => {
		const { data: authData } = supabase.auth.onAuthStateChange((_, newSession) => {
			if (newSession?.expires_at !== session?.expires_at) invalidate('supabase:auth');
		});
		return () => authData.subscription.unsubscribe();
	});

	async function logout() {
		await supabase.auth.signOut();
		invalidate('supabase:auth');
	}

	const isActive = (href: string) => page.url.pathname.startsWith(href);
</script>

{#if !user && page.url.pathname !== '/login'}
	<!-- Guest screen -->
	<div class="flex min-h-screen items-center justify-center bg-gray-50">
		<div class="w-full max-w-md">
			<h1 class="mb-8 text-center text-2xl font-bold">DraftSync</h1>
			<div class="rounded-lg bg-white p-8 shadow">
				<h2 class="mb-4 text-xl font-semibold">Please Login</h2>
				<a
					href="/login"
					class="block w-full rounded bg-blue-600 px-4 py-2 text-center text-white hover:bg-blue-700"
				>
					Go to Login
				</a>
			</div>
		</div>
	</div>
{:else}
	<!-- App shell -->
	<div class="flex min-h-screen flex-col bg-gray-50">
		{#if user}
			<nav class="bg-white shadow-sm">
				<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div class="flex h-16 items-center justify-between">
						<a href="/" class="text-xl font-bold">DraftSync</a>

						<ul class="flex items-center gap-6">
							<li>
								<a
									href="/leagues"
									class="transition-colors hover:text-gray-900"
									class:text-gray-700={!isActive('/leagues')}
									class:text-blue-600={isActive('/leagues')}>Leagues</a
								>
							</li>
							<li>
								<a
									href="/import"
									class="transition-colors hover:text-gray-900"
									class:text-gray-700={!isActive('/import')}
									class:text-blue-600={isActive('/import')}>Import</a
								>
							</li>
							<li>
								<a
									href="/draft"
									class="transition-colors hover:text-gray-900"
									class:text-gray-700={!isActive('/draft')}
									class:text-blue-600={isActive('/draft')}>Live Draft</a
								>
							</li>
							<li class="hidden text-sm text-gray-500 sm:block">
								Welcome, {user.email}
							</li>

							<li>
								<button onclick={logout} class="text-sm text-red-600 hover:text-red-700"
									>Logout</button
								>
							</li>
						</ul>
					</div>
				</div>
			</nav>
		{/if}

		<main class="flex-1">
			<!-- Page container -->
			<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
				{@render children()}
			</div>
		</main>
	</div>
{/if}
