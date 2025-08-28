<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import type { SupabaseClient } from '@supabase/supabase-js';

	export let data;

	const { supabase }: { supabase: SupabaseClient } = data;
	const sessionId = $page.params.sessionId;

	interface DraftPick {
		id: string;
		pick_number: number;
		team_id: number;
		espn_player_id: string;
		player_name: string;
		player_position: string;
		player_nfl_team: string | null;
		is_mock: boolean;
		created_at: string;
		pick_data?: {
			slotId?: string;
			timestamp?: string;
		};
	}

	let picks: DraftPick[] = [];
	let loading = true;
	let error = '';
	let subscription: any = null;
	let connectionStatus = 'connecting';

	// Load initial picks
	async function loadPicks() {
		try {
			connectionStatus = 'loading';
			const { data: picksData, error: picksError } = await supabase
				.from('live_draft_picks')
				.select('*')
				.eq('session_id', sessionId)
				.order('pick_number', { ascending: true });

			if (picksError) throw picksError;
			picks = picksData || [];
			connectionStatus = 'connected';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load picks';
			connectionStatus = 'error';
		} finally {
			loading = false;
		}
	}

	// Subscribe to real-time updates
	function subscribeToUpdates() {
		console.log('[Draft Board] Subscribing to real-time updates for:', sessionId);

		subscription = supabase
			.channel(`draft-${sessionId}`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'live_draft_picks',
					filter: `session_id=eq.${sessionId}`
				},
				(payload) => {
					console.log('[Draft Board] New pick received:', payload.new);
					const newPick = payload.new as DraftPick;

					// Add new pick and sort by pick number
					picks = [...picks, newPick].sort((a, b) => a.pick_number - b.pick_number);

					// Show notification
					showPickNotification(newPick);
					connectionStatus = 'connected';
				}
			)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'live_draft_picks',
					filter: `session_id=eq.${sessionId}`
				},
				(payload) => {
					console.log('[Draft Board] Pick updated:', payload.new);
					const updatedPick = payload.new as DraftPick;

					// Update existing pick
					picks = picks
						.map((p) => (p.id === updatedPick.id ? updatedPick : p))
						.sort((a, b) => a.pick_number - b.pick_number);
				}
			)
			.subscribe((status) => {
				console.log('[Draft Board] Subscription status:', status);
				connectionStatus = status === 'SUBSCRIBED' ? 'connected' : 'connecting';
			});
	}

	function showPickNotification(pick: DraftPick) {
		// Create notification element
		const notification = document.createElement('div');
		notification.style.cssText = `
			position: fixed;
			top: 20px;
			left: 50%;
			transform: translateX(-50%);
			background: #10b981;
			color: white;
			padding: 12px 20px;
			border-radius: 8px;
			font-weight: 500;
			box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
			z-index: 1000;
			opacity: 0;
			transform: translateX(-50%) translateY(-20px);
			transition: all 0.3s ease;
		`;
		notification.textContent = `🎯 Pick #${pick.pick_number}: ${pick.player_name} → Team ${pick.team_id}`;
		document.body.appendChild(notification);

		// Animate in
		setTimeout(() => {
			notification.style.opacity = '1';
			notification.style.transform = 'translateX(-50%) translateY(0)';
		}, 100);

		// Remove after 4 seconds
		setTimeout(() => {
			notification.style.opacity = '0';
			notification.style.transform = 'translateX(-50%) translateY(-20px)';
			setTimeout(() => notification.remove(), 300);
		}, 4000);
	}

	function getConnectionStatusColor() {
		switch (connectionStatus) {
			case 'connected':
				return 'text-green-600';
			case 'connecting':
				return 'text-yellow-600';
			case 'loading':
				return 'text-blue-600';
			case 'error':
				return 'text-red-600';
			default:
				return 'text-gray-600';
		}
	}

	function getConnectionStatusText() {
		switch (connectionStatus) {
			case 'connected':
				return '● Connected';
			case 'connecting':
				return '○ Connecting...';
			case 'loading':
				return '⟳ Loading...';
			case 'error':
				return '✕ Error';
			default:
				return '○ Unknown';
		}
	}

	onMount(() => {
		loadPicks();
		subscribeToUpdates();
	});

	onDestroy(() => {
		if (subscription) {
			subscription.unsubscribe();
		}
	});

	// Get round number from pick number (assuming 12 teams for now)
	function getRound(pickNumber: number): number {
		return Math.ceil(pickNumber / 12);
	}

	function getPickInRound(pickNumber: number): number {
		return ((pickNumber - 1) % 12) + 1;
	}

	function formatTime(timestamp: string): string {
		return new Date(timestamp).toLocaleTimeString();
	}
</script>

// src/routes/draft/live/[sessionId]/+page.svelte
<svelte:head>
	<title>Live Draft Board - {sessionId}</title>
</svelte:head>

<div class="container mx-auto px-4 py-6">
	<div class="mb-6">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="mb-2 text-3xl font-bold text-gray-900">Live Draft Board</h1>
				<p class="text-gray-600">Session: {sessionId}</p>
			</div>
			<div class="flex items-center gap-3">
				<span class="text-sm {getConnectionStatusColor()}">{getConnectionStatusText()}</span>
				<button
					on:click={loadPicks}
					class="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
					disabled={loading}
				>
					{loading ? 'Refreshing...' : 'Refresh'}
				</button>
			</div>
		</div>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
			<span class="ml-2 text-gray-600">Loading draft picks...</span>
		</div>
	{:else if error}
		<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
			<p class="text-red-800">Error: {error}</p>
		</div>
	{:else}
		<div class="grid gap-6">
			<!-- Draft Summary -->
			<div class="rounded-lg border border-gray-200 bg-white p-6">
				<h2 class="mb-4 text-xl font-semibold">Draft Summary</h2>
				<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
					<div>
						<p class="text-sm text-gray-500">Total Picks</p>
						<p class="text-2xl font-bold text-blue-600">{picks.length}</p>
					</div>
					<div>
						<p class="text-sm text-gray-500">Current Round</p>
						<p class="text-2xl font-bold text-green-600">
							{picks.length > 0 ? getRound(picks.length + 1) : 1}
						</p>
					</div>
					<div>
						<p class="text-sm text-gray-500">Next Pick</p>
						<p class="text-2xl font-bold text-purple-600">{picks.length + 1}</p>
					</div>
					<div>
						<p class="text-sm text-gray-500">Type</p>
						<p class="text-2xl font-bold text-orange-600">
							{sessionId.startsWith('mock-') ? 'MOCK' : 'REAL'}
						</p>
					</div>
				</div>
			</div>

			<!-- Picks List -->
			<div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
				<div class="border-b border-gray-200 bg-gray-50 px-6 py-4">
					<h2 class="text-xl font-semibold">Draft Picks</h2>
				</div>

				{#if picks.length === 0}
					<div class="p-6 text-center text-gray-500">
						<p>No picks yet. Waiting for draft to begin...</p>
						<div class="mt-4 animate-pulse">
							<div class="mx-auto h-2 w-32 rounded bg-gray-200"></div>
						</div>
					</div>
				{:else}
					<div class="divide-y divide-gray-200">
						{#each picks as pick (pick.id)}
							<div class="flex items-center justify-between px-6 py-4 hover:bg-gray-50">
								<div class="flex items-center space-x-4">
									<div class="flex-shrink-0">
										<div
											class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100"
										>
											<span class="text-sm font-medium text-blue-800">{pick.pick_number}</span>
										</div>
									</div>
									<div>
										<div class="flex items-center gap-2">
											<p class="text-sm font-medium text-gray-900">
												{pick.player_name}
											</p>
											<span class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
												{pick.player_position}
											</span>
											{#if pick.player_nfl_team}
												<span class="rounded bg-blue-100 px-2 py-1 text-xs text-blue-600">
													{pick.player_nfl_team}
												</span>
											{/if}
										</div>
										<p class="text-sm text-gray-500">
											Team {pick.team_id} • Round {getRound(pick.pick_number)}, Pick {getPickInRound(
												pick.pick_number
											)}
										</p>
									</div>
								</div>
								<div class="text-right">
									<p class="text-sm text-gray-500">{formatTime(pick.created_at)}</p>
									{#if pick.pick_data?.slotId}
										<p class="text-xs text-gray-400">Slot: {pick.pick_data.slotId}</p>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 1200px;
	}
</style>
