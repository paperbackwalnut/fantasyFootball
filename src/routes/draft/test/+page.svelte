<!-- src/routes/draft/test/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';

	export let data;
	const { supabase } = data;

	let sessionId = 'test-draft-' + Date.now();
	let sending = false;
	let message = '';

	const mockPlayers = [
		{ name: 'Christian McCaffrey', position: 'RB', team: 'SF' },
		{ name: 'Tyreek Hill', position: 'WR', team: 'MIA' },
		{ name: 'Josh Allen', position: 'QB', team: 'BUF' },
		{ name: 'Travis Kelce', position: 'TE', team: 'KC' },
		{ name: 'Derrick Henry', position: 'RB', team: 'BAL' },
		{ name: 'Cooper Kupp', position: 'WR', team: 'LAR' },
		{ name: 'Patrick Mahomes', position: 'QB', team: 'KC' },
		{ name: 'Mark Andrews', position: 'TE', team: 'BAL' },
		{ name: 'Alvin Kamara', position: 'RB', team: 'NO' },
		{ name: 'Davante Adams', position: 'WR', team: 'LV' }
	];

	let currentPick = 1;

	async function sendTestPick() {
		if (sending) return;

		sending = true;
		message = '';

		try {
			const player = mockPlayers[(currentPick - 1) % mockPlayers.length];
			const teamId = ((currentPick - 1) % 12) + 1; // 12 teams
			const playerId = `test_player_${currentPick}_${Date.now()}`;

			const response = await fetch('/api/espn/extension/picks', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					platform: 'espn',
					isMock: true,
					leagueId: sessionId,
					teamId: teamId.toString(),
					playerId,
					slotId: '20',
					type: 'PICK'
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${await response.text()}`);
			}

			const result = await response.json();
			message = `✅ Pick #${currentPick}: ${player.name} (${player.position}) to Team ${teamId}`;
			currentPick++;

			console.log('Test pick sent:', result);
		} catch (error) {
			message = `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
			console.error('Failed to send test pick:', error);
		} finally {
			sending = false;
		}
	}

	async function sendMultiplePicks() {
		for (let i = 0; i < 5; i++) {
			await sendTestPick();
			// Small delay between picks
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	function openDraftBoard() {
		window.open(`/draft/live/${sessionId}`, '_blank');
	}

	function resetSession() {
		sessionId = 'test-draft-' + Date.now();
		currentPick = 1;
		message = 'Session reset';
	}
</script>

<svelte:head>
	<title>Test Draft Picks</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<div class="mx-auto max-w-2xl">
		<h1 class="mb-8 text-3xl font-bold text-gray-900">Test Draft Picks</h1>

		<div class="mb-6 rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-4 text-xl font-semibold">Test Session</h2>

			<div class="space-y-4">
				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700"> Session ID </label>
					<input
						type="text"
						bind:value={sessionId}
						class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
						readonly
					/>
				</div>

				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700"> Next Pick Number </label>
					<p class="text-2xl font-bold text-blue-600">#{currentPick}</p>
				</div>
			</div>
		</div>

		<div class="mb-6 rounded-lg border border-gray-200 bg-white p-6">
			<h2 class="mb-4 text-xl font-semibold">Actions</h2>

			<div class="space-y-4">
				<div class="flex gap-3">
					<button
						on:click={sendTestPick}
						disabled={sending}
						class="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{sending ? 'Sending...' : 'Send Test Pick'}
					</button>

					<button
						on:click={sendMultiplePicks}
						disabled={sending}
						class="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
					>
						Send 5 Picks
					</button>
				</div>

				<div class="flex gap-3">
					<button
						on:click={openDraftBoard}
						class="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
					>
						Open Draft Board
					</button>

					<button
						on:click={resetSession}
						class="rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
					>
						Reset Session
					</button>
				</div>
			</div>
		</div>

		{#if message}
			<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
				<p class="font-mono text-sm">{message}</p>
			</div>
		{/if}

		<div class="mt-8 rounded-lg border border-yellow-200 bg-yellow-50 p-6">
			<h3 class="mb-3 text-lg font-medium text-yellow-900">How to Test</h3>
			<div class="space-y-2 text-sm text-yellow-800">
				<p><strong>1.</strong> Use "Send Test Pick" to simulate individual picks</p>
				<p><strong>2.</strong> Use "Send 5 Picks" to quickly populate a draft</p>
				<p><strong>3.</strong> Click "Open Draft Board" to see the live results</p>
				<p><strong>4.</strong> The draft board will update in real-time as you send picks</p>
			</div>
		</div>
	</div>
</div>

<style>
	.container {
		max-width: 1200px;
	}
</style>
