<!-- src/routes/draft/+page.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	interface League {
		id: string;
		name: string;
		platform: string;
		platform_league_id: string;
		team_count: number;
		season_year: number;
		draft_completed: boolean;
		draft_started: boolean;
		updated_at: string;
	}

	interface DraftPick {
		pick_number: number;
		round_number: number;
		pick_in_round: number;
		player_name: string;
		player_position: string;
		player_nfl_team: string | null;
		team_name: string;
		owner_name: string;
		pick_context: 'early' | 'average' | 'late';
		position_rank: number;
		avg_position_pick: number;
		timestamp: string;
	}

	interface Team {
		id: number;
		name: string;
		owner_name: string;
		draft_position: number;
		roster_id?: number;
	}

	interface AnalyticsData {
		positionBreakdown: Record<string, number>;
		pickContextStats: Record<string, number>;
		roundAnalysis: Array<{
			round: number;
			picks: number;
			avgPositionValue: number;
		}>;
		ownerTendencies: Record<
			string,
			{
				earlyRB: number;
				earlyWR: number;
				avgRBRound: number;
				avgWRRound: number;
			}
		>;
	}

	// State
	let leagues: League[] = [];
	let selectedLeague: League | null = null;
	let draftPicks: DraftPick[] = [];
	let teams: Team[] = [];
	let analyticsData: AnalyticsData | null = null;
	let loading = false;
	let error = '';
	let isLive = false;
	let pollInterval: NodeJS.Timeout | null = null;
	let lastPickCount = 0;

	// UI State
	let showAnalytics = true;
	let selectedRound = 0; // 0 = all rounds
	let selectedPosition = 'ALL';
	let sortBy: 'pick' | 'position' | 'team' | 'value' = 'pick';

	const positions = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'];

	onMount(() => {
		loadLeagues();
		// Check URL params for auto-selection
		const leagueId = $page.url.searchParams.get('league');
		if (leagueId) {
			// Will select league after loading
		}
	});

	onDestroy(() => {
		if (pollInterval) {
			clearInterval(pollInterval);
		}
	});

	async function loadLeagues() {
		loading = true;
		try {
			const [espnResponse, sleeperResponse] = await Promise.all([
				fetch('/api/espn/leagues'),
				fetch('/api/sleeper/leagues')
			]);

			const espnData = espnResponse.ok ? await espnResponse.json() : { leagues: [] };
			const sleeperData = sleeperResponse.ok ? await sleeperResponse.json() : { leagues: [] };

			leagues = [...(espnData.leagues ?? []), ...(sleeperData.leagues ?? [])]
				.filter((league) => league.draft_started) // Only show leagues with active/completed drafts
				.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

			// Auto-select from URL params
			const leagueId = $page.url.searchParams.get('league');
			if (leagueId && leagues.length > 0) {
				const found = leagues.find((l) => l.id === leagueId);
				if (found) {
					await selectLeague(found);
				}
			}
		} catch (e) {
			error = 'Failed to load leagues';
			console.error('Error loading leagues:', e);
		} finally {
			loading = false;
		}
	}

	async function selectLeague(league: League) {
		selectedLeague = league;
		error = '';

		// Update URL
		const url = new URL(window.location.href);
		url.searchParams.set('league', league.id);
		window.history.replaceState({}, '', url);

		await Promise.all([loadDraftData(), loadTeams(), loadAnalytics()]);

		// Start live polling if draft is active
		if (league.draft_started && !league.draft_completed) {
			startLivePolling();
		}
	}

	async function loadDraftData() {
		if (!selectedLeague) return;

		loading = true;
		try {
			const endpoint =
				selectedLeague.platform === 'ESPN'
					? `/api/espn/draft-picks/${selectedLeague.id}`
					: `/api/sleeper/draft-picks/${selectedLeague.id}`;

			const response = await fetch(endpoint);
			if (!response.ok) throw new Error('Failed to fetch draft picks');

			const data = await response.json();
			draftPicks = data.picks || [];
			lastPickCount = draftPicks.length;
		} catch (e) {
			error = 'Failed to load draft data';
			console.error('Error loading draft data:', e);
		} finally {
			loading = false;
		}
	}

	async function loadTeams() {
		if (!selectedLeague) return;

		try {
			const endpoint =
				selectedLeague.platform === 'ESPN'
					? `/api/espn/teams/${selectedLeague.id}`
					: `/api/sleeper/teams/${selectedLeague.id}`;

			const response = await fetch(endpoint);
			if (!response.ok) throw new Error('Failed to fetch teams');

			const data = await response.json();
			teams = data.teams || [];
		} catch (e) {
			console.error('Error loading teams:', e);
		}
	}

	async function loadAnalytics() {
		if (!selectedLeague) return;

		try {
			const response = await fetch(`/api/draft-analysis/live-insights/${selectedLeague.id}`);
			if (!response.ok) throw new Error('Failed to fetch analytics');

			analyticsData = await response.json();
		} catch (e) {
			console.error('Error loading analytics:', e);
		}
	}

	function startLivePolling() {
		if (pollInterval) clearInterval(pollInterval);

		isLive = true;
		pollInterval = setInterval(async () => {
			await loadDraftData();

			// Check for new picks
			if (draftPicks.length > lastPickCount) {
				lastPickCount = draftPicks.length;
				// Refresh analytics with new data
				await loadAnalytics();
			}

			// Stop polling if draft is complete
			if (selectedLeague && draftPicks.length >= selectedLeague.team_count * 16) {
				stopLivePolling();
			}
		}, 5000); // Poll every 5 seconds
	}

	function stopLivePolling() {
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
		isLive = false;
	}

	// Computed values
	$: filteredPicks = draftPicks
		.filter((pick) => {
			if (selectedRound > 0 && pick.round_number !== selectedRound) return false;
			if (selectedPosition !== 'ALL' && pick.player_position !== selectedPosition) return false;
			return true;
		})
		.sort((a, b) => {
			switch (sortBy) {
				case 'pick':
					return a.pick_number - b.pick_number;
				case 'position':
					return a.player_position.localeCompare(b.player_position);
				case 'team':
					return a.team_name.localeCompare(b.team_name);
				case 'value':
					return a.avg_position_pick - a.pick_number - (b.avg_position_pick - b.pick_number);
				default:
					return a.pick_number - b.pick_number;
			}
		});

	$: currentRound = draftPicks.length > 0 ? Math.max(...draftPicks.map((p) => p.round_number)) : 1;
	$: maxRounds = selectedLeague
		? Math.ceil((selectedLeague.team_count * 16) / selectedLeague.team_count)
		: 16;
	$: draftProgress = selectedLeague
		? (draftPicks.length / (selectedLeague.team_count * 16)) * 100
		: 0;

	function getPickValueClass(pick: DraftPick): string {
		const value = pick.avg_position_pick - pick.pick_number;
		if (value > 12) return 'text-green-600 font-semibold'; // Great value
		if (value > 6) return 'text-green-500'; // Good value
		if (value < -12) return 'text-red-600 font-semibold'; // Reached
		if (value < -6) return 'text-red-500'; // Slight reach
		return 'text-gray-600'; // Fair value
	}

	function getPositionColor(position: string): string {
		const colors: Record<string, string> = {
			QB: 'bg-red-100 text-red-800',
			RB: 'bg-blue-100 text-blue-800',
			WR: 'bg-green-100 text-green-800',
			TE: 'bg-yellow-100 text-yellow-800',
			K: 'bg-purple-100 text-purple-800',
			DST: 'bg-gray-100 text-gray-800'
		};
		return colors[position] || 'bg-gray-100 text-gray-800';
	}
</script>

<svelte:head>
	<title>Live Draft View - DraftSync</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<div class="border-b bg-white shadow-sm">
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between py-4">
				<div class="flex items-center space-x-4">
					<h1 class="text-2xl font-bold text-gray-900">Live Draft</h1>
					{#if isLive}
						<div class="flex items-center space-x-2">
							<div class="h-2 w-2 animate-pulse rounded-full bg-red-500"></div>
							<span class="text-sm font-medium text-red-600">LIVE</span>
						</div>
					{/if}
				</div>

				<!-- League Selector -->
				<div class="flex items-center space-x-4">
					<select
						value={selectedLeague?.id || ''}
						on:change={(e) => {
							const target = e.target as HTMLSelectElement;
							if (target.value) {
								const league = leagues.find((l) => l.id === target.value);
								if (league) {
									selectLeague(league);
								}
							} else {
								selectedLeague = null;
							}
						}}
						class="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					>
						<option value="">Select a league...</option>
						{#each leagues as league}
							<option value={league.id}>
								{league.name} ({league.season_year}) - {league.platform}
							</option>
						{/each}
					</select>
				</div>
			</div>
		</div>
	</div>

	{#if selectedLeague}
		<!-- Draft Progress -->
		<div class="border-b bg-white px-4 py-4 sm:px-6 lg:px-8">
			<div class="mx-auto max-w-7xl">
				<div class="mb-2 flex items-center justify-between">
					<h2 class="text-lg font-medium text-gray-900">{selectedLeague.name}</h2>
					<div class="text-sm text-gray-600">
						Round {currentRound} • {draftPicks.length} / {selectedLeague.team_count * 16} picks
					</div>
				</div>
				<div class="h-2 w-full rounded-full bg-gray-200">
					<div
						class="h-2 rounded-full bg-blue-600 transition-all duration-300"
						style="width: {draftProgress}%"
					></div>
				</div>
			</div>
		</div>

		<!-- Main Content -->
		<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
				<!-- Draft Board - Main Content -->
				<div class="lg:col-span-3">
					<!-- Filters -->
					<div class="mb-6 rounded-lg bg-white p-4 shadow">
						<div class="flex flex-wrap items-center gap-4">
							<div>
								<label class="mb-1 block text-sm font-medium text-gray-700">Round</label>
								<select bind:value={selectedRound} class="rounded border-gray-300 text-sm">
									<option value={0}>All Rounds</option>
									{#each Array(maxRounds) as _, i}
										<option value={i + 1}>Round {i + 1}</option>
									{/each}
								</select>
							</div>

							<div>
								<label class="mb-1 block text-sm font-medium text-gray-700">Position</label>
								<select bind:value={selectedPosition} class="rounded border-gray-300 text-sm">
									{#each positions as pos}
										<option value={pos}>{pos}</option>
									{/each}
								</select>
							</div>

							<div>
								<label class="mb-1 block text-sm font-medium text-gray-700">Sort By</label>
								<select bind:value={sortBy} class="rounded border-gray-300 text-sm">
									<option value="pick">Pick Number</option>
									<option value="position">Position</option>
									<option value="team">Team</option>
									<option value="value">Draft Value</option>
								</select>
							</div>

							<div class="flex items-center">
								<input
									type="checkbox"
									id="analytics-toggle"
									bind:checked={showAnalytics}
									class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
								/>
								<label for="analytics-toggle" class="ml-2 text-sm text-gray-700">
									Show Analytics
								</label>
							</div>
						</div>
					</div>

					<!-- Draft Picks Table -->
					<div class="overflow-hidden rounded-lg bg-white shadow">
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
										>
											Pick
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
										>
											Player
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
										>
											Team
										</th>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
										>
											Position
										</th>
										{#if showAnalytics}
											<th
												class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>
												Value
											</th>
											<th
												class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>
												Context
											</th>
										{/if}
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 bg-white">
									{#each filteredPicks as pick (pick.pick_number)}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
												<div class="flex items-center">
													<span class="font-medium">{pick.pick_number}</span>
													<span class="ml-2 text-gray-500">
														({pick.round_number}.{pick.pick_in_round})
													</span>
												</div>
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="text-sm font-medium text-gray-900">{pick.player_name}</div>
												<div class="text-sm text-gray-500">{pick.player_nfl_team || 'FA'}</div>
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="text-sm text-gray-900">{pick.team_name}</div>
												<div class="text-sm text-gray-500">{pick.owner_name}</div>
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span
													class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getPositionColor(
														pick.player_position
													)}"
												>
													{pick.player_position}{pick.position_rank}
												</span>
											</td>
											{#if showAnalytics}
												<td class="px-6 py-4 text-sm whitespace-nowrap {getPickValueClass(pick)}">
													{#if pick.avg_position_pick}
														{pick.avg_position_pick - pick.pick_number > 0 ? '+' : ''}{(
															pick.avg_position_pick - pick.pick_number
														).toFixed(1)}
													{:else}
														-
													{/if}
												</td>
												<td class="px-6 py-4 whitespace-nowrap">
													<span
														class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
														{pick.pick_context === 'early'
															? 'bg-green-100 text-green-800'
															: pick.pick_context === 'late'
																? 'bg-red-100 text-red-800'
																: 'bg-gray-100 text-gray-800'}"
													>
														{pick.pick_context}
													</span>
												</td>
											{/if}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>

				<!-- Analytics Sidebar -->
				{#if showAnalytics}
					<div class="space-y-6 lg:col-span-1">
						<!-- Position Breakdown -->
						{#if analyticsData?.positionBreakdown}
							<div class="rounded-lg bg-white p-6 shadow">
								<h3 class="mb-4 text-lg font-medium text-gray-900">Position Breakdown</h3>
								<div class="space-y-3">
									{#each Object.entries(analyticsData.positionBreakdown) as [position, count]}
										<div class="flex items-center justify-between">
											<span class="text-sm text-gray-600">{position}</span>
											<span class="text-sm font-medium text-gray-900">{count}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Live Insights -->
						<div class="rounded-lg bg-white p-6 shadow">
							<h3 class="mb-4 text-lg font-medium text-gray-900">Live Insights</h3>
							<div class="space-y-4">
								<div class="rounded-lg bg-blue-50 p-3">
									<p class="text-sm text-blue-800">
										<strong>RB Run:</strong> 4 RBs taken in last 6 picks
									</p>
								</div>
								<div class="rounded-lg bg-yellow-50 p-3">
									<p class="text-sm text-yellow-800">
										<strong>Value Alert:</strong> Top WRs still available
									</p>
								</div>
								<div class="rounded-lg bg-green-50 p-3">
									<p class="text-sm text-green-800">
										<strong>Trend:</strong> QBs going later than ADP
									</p>
								</div>
							</div>
						</div>

						<!-- Team Draft Positions -->
						<div class="rounded-lg bg-white p-6 shadow">
							<h3 class="mb-4 text-lg font-medium text-gray-900">Draft Order</h3>
							<div class="space-y-2">
								{#each teams.sort((a, b) => a.draft_position - b.draft_position) as team}
									<div class="flex items-center justify-between text-sm">
										<span class="text-gray-600">{team.draft_position}.</span>
										<span class="truncate text-gray-900">{team.name}</span>
									</div>
								{/each}
							</div>
						</div>

						<!-- Upcoming Picks -->
						{#if !selectedLeague?.draft_completed}
							<div class="rounded-lg bg-white p-6 shadow">
								<h3 class="mb-4 text-lg font-medium text-gray-900">Next Picks</h3>
								<div class="space-y-2">
									{#each Array(5) as _, i}
										{@const nextPick = draftPicks.length + i + 1}
										{@const round = Math.ceil(nextPick / selectedLeague.team_count)}
										{@const pickInRound = ((nextPick - 1) % selectedLeague.team_count) + 1}
										<div class="flex items-center justify-between text-sm">
											<span class="text-gray-600">{nextPick}.</span>
											<span class="text-gray-900">Round {round}, Pick {pickInRound}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<!-- No League Selected -->
		<div class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
			<div class="text-center">
				<div class="mx-auto h-12 w-12 text-gray-400">
					<svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
						/>
					</svg>
				</div>
				<h3 class="mt-2 text-sm font-medium text-gray-900">No league selected</h3>
				<p class="mt-1 text-sm text-gray-500">
					Choose a league from the dropdown above to view live draft data
				</p>
				{#if leagues.length === 0 && !loading}
					<div class="mt-6">
						<a
							href="/import"
							class="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
						>
							Import a League
						</a>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

{#if error}
	<div
		class="fixed right-4 bottom-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
	>
		{error}
	</div>
{/if}
