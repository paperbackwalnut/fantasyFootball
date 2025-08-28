<!-- src/routes/draft/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	export let data;
	const { supabase } = data;

	let sessionId = '';
	let recentSessions: Array<{
		sessionId: string;
		isMock: boolean;
		pickCount: number;
		lastActivity: string;
		firstActivity: string;
	}> = [];
	let loading = false;

	// Load recent draft sessions
	async function loadRecentSessions() {
		try {
			const response = await fetch('/api/draft/sessions');
			if (!response.ok) throw new Error('Failed to fetch sessions');

			const data = await response.json();
			recentSessions = data.sessions || [];
		} catch (e) {
			console.error('Failed to load recent sessions:', e);
		}
	}

	function goToDraftBoard() {
		if (!sessionId.trim()) return;
		goto(`/draft/live/${sessionId.trim()}`);
	}

	function goToSession(id: string) {
		goto(`/draft/live/${id}`);
	}

	onMount(() => {
		loadRecentSessions();
	});
</script>

<svelte:head>
	<title>Draft Boards</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<div class="mx-auto max-w-2xl">
		<h1 class="mb-8 text-3xl font-bold text-gray-900">Draft Boards</h1>

		<!-- New Session -->
		<div class="mb-8 rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-4 text-xl font-semibold">Start Watching a Draft</h2>
			<p class="mb-4 text-gray-600">
				Enter your ESPN league ID or mock draft session ID to view live picks.
			</p>

			<div class="flex gap-3">
				<input
					type="text"
					bind:value={sessionId}
					placeholder="Enter league/session ID..."
					class="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
					on:keydown={(e) => e.key === 'Enter' && goToDraftBoard()}
				/>
				<button
					on:click={goToDraftBoard}
					disabled={!sessionId.trim() || loading}
					class="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Watch Draft
				</button>
			</div>

			<div class="mt-4 text-sm text-gray-500">
				<p><strong>Examples:</strong></p>
				<ul class="mt-1 list-inside list-disc space-y-1">
					<li><code>480762</code> - Real league ID</li>
					<li><code>mock-draft-12345</code> - Mock draft session</li>
				</ul>
			</div>
		</div>

		<!-- Recent Sessions -->
		{#if recentSessions.length > 0}
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<h2 class="mb-4 text-xl font-semibold">Recent Draft Sessions</h2>
				<div class="space-y-2">
					{#each recentSessions as session}
						<button
							on:click={() => goToSession(session.sessionId)}
							class="w-full rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
						>
							<div class="flex items-center justify-between">
								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<p class="font-mono text-sm font-medium text-gray-900">{session.sessionId}</p>
										<span
											class="rounded-full px-2 py-1 text-xs {session.isMock
												? 'bg-yellow-100 text-yellow-800'
												: 'bg-green-100 text-green-800'}"
										>
											{session.isMock ? 'Mock' : 'Real'}
										</span>
									</div>
									<div class="flex items-center gap-4 text-sm text-gray-500">
										<span>{session.pickCount} picks</span>
										<span>{new Date(session.lastActivity).toLocaleString()}</span>
									</div>
								</div>
								<svg
									class="h-5 w-5 text-gray-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 5l7 7-7 7"
									></path>
								</svg>
							</div>
						</button>
					{/each}
				</div>

				<!-- Debug info -->
				<details class="mt-4">
					<summary class="cursor-pointer text-sm text-gray-500">Debug Info</summary>
					<pre class="mt-2 overflow-auto rounded bg-gray-100 p-2 text-xs">{JSON.stringify(
							recentSessions,
							null,
							2
						)}</pre>
				</details>
			</div>
		{:else}
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<h2 class="mb-4 text-xl font-semibold">Recent Draft Sessions</h2>
				<p class="text-gray-500">
					No recent draft sessions found. Start a draft with your extension to see sessions here!
				</p>
			</div>
		{/if}

		<!-- Instructions -->
		<div class="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-6">
			<h3 class="mb-3 text-lg font-medium text-blue-900">How to Use</h3>
			<div class="space-y-2 text-sm text-blue-800">
				<p><strong>1.</strong> Install your browser extension on ESPN Fantasy</p>
				<p><strong>2.</strong> Navigate to any draft (real or mock) on ESPN</p>
				<p><strong>3.</strong> The extension will automatically detect picks and send them here</p>
				<p><strong>4.</strong> Use the session ID from your extension to view the live board</p>
			</div>

			<div class="mt-4 rounded-lg bg-blue-100 p-3">
				<p class="text-sm text-blue-800">
					<strong>Debug:</strong> In the browser console, use
					<code>window.draftSyncDebug.openDraftBoard()</code> to auto-open the draft board for the current
					session.
				</p>
			</div>
		</div>
	</div>
</div>

<style>
	.container {
		max-width: 1200px;
	}
</style>
