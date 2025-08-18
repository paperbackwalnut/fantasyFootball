<!-- src/routes/leagues/+page.svelte - Unified leagues management -->
<script lang="ts">
	import { onMount } from 'svelte';

	interface League {
		id: string;
		name: string;
		platform: string;
		platform_league_id: string;
		team_count: number;
		season_year: number;
		draft_completed: boolean;
		updated_at: string;
		seasons?: League[];
	}

	let leagues: League[] = [];
	let groupedLeagues: Record<string, League[]> = {};
	let loading = true;
	let showImportModal = false;
	let importType: 'espn' | 'sleeper' = 'espn';

	// Import form data - flattened for binding
	let espnLeagueId = '';
	let espnS2 = '';
	let espnSwid = '';
	let espnSeasons = [2024, 2023, 2022];
	let sleeperUsername = '';
	let sleeperSeasons = [2024, 2023, 2022];
	let season = '';
	$: selectedSeasons = importType === 'espn' ? espnSeasons : sleeperSeasons;
	let importing = false;
	let importError = '';

	onMount(() => {
		loadLeagues();
	});

	async function loadLeagues() {
		try {
			const [espnResponse, sleeperResponse] = await Promise.all([
				fetch('/api/espn/leagues'),
				fetch('/api/sleeper/leagues')
			]);

			const espnData = espnResponse.ok ? await espnResponse.json() : { leagues: [] };
			const sleeperData = sleeperResponse.ok ? await sleeperResponse.json() : { leagues: [] };
			leagues = [...(espnData.leagues ?? []), ...(sleeperData.leagues ?? [])];

			// Group by platform_league_id to show multiple seasons together
			groupedLeagues = leagues.reduce(
				(acc, league) => {
					const key = `${league.platform}-${league.platform_league_id}`;
					if (!acc[key]) {
						acc[key] = [];
					}
					acc[key].push(league);
					return acc;
				},
				{} as Record<string, League[]>
			);

			// Sort each group by season year
			Object.keys(groupedLeagues).forEach((key) => {
				groupedLeagues[key].sort((a, b) => b.season_year - a.season_year);
			});
		} catch (e) {
			console.error('Failed to load leagues:', e);
		} finally {
			loading = false;
		}
	}

	function openImportModal(platform: 'espn' | 'sleeper') {
		importType = platform;
		showImportModal = true;
		importError = '';

		// Reset form data when opening
		espnLeagueId = '';
		espnS2 = '';
		espnSwid = '';
		espnSeasons = [2024, 2023, 2022];
		sleeperUsername = '';
		sleeperSeasons = [2024, 2023, 2022];
	}

	async function handleImport() {
		importing = true;
		importError = '';

		try {
			const endpoint =
				importType === 'espn' ? '/api/espn/import-history' : '/api/sleeper/import-history';
			const body =
				importType === 'espn'
					? { leagueId: espnLeagueId, espn_s2: espnS2, swid: espnSwid, seasons: espnSeasons }
					: { username: sleeperUsername, seasons: sleeperSeasons };

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Import failed');
			}

			showImportModal = false;
			await loadLeagues(); // Refresh the list
		} catch (e) {
			importError = e instanceof Error ? e.message : 'Import failed';
		} finally {
			importing = false;
		}
	}

	function closeModal() {
		showImportModal = false;
		importError = '';
		// Reset form data
		espnLeagueId = '';
		espnS2 = '';
		espnSwid = '';
		espnSeasons = [2024, 2023, 2022];
		sleeperUsername = '';
		sleeperSeasons = [2024, 2023, 2022];
	}

	function getSeasonsSummary(seasons: League[]) {
		return seasons.map((s) => s.season_year).join(', ');
	}

	function getTotalPicks(seasons: League[]) {
		// This would need to be calculated from draft picks - placeholder for now
		return seasons.length * 12 * 16; // Estimate
	}
</script>

<div class="min-h-screen bg-gray-50">
	<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="mb-8">
			<div class="sm:flex sm:items-center sm:justify-between">
				<div>
					<h1 class="text-3xl font-bold text-gray-900">My Fantasy Leagues</h1>
					<p class="mt-2 text-gray-600">Manage your fantasy league data and draft analysis</p>
				</div>
				<div class="mt-4 sm:mt-0">
					<div class="flex space-x-3">
						<button
							on:click={() => openImportModal('espn')}
							class="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-red-700"
						>
							<svg class="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
								<path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
								<path
									fill-rule="evenodd"
									d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
									clip-rule="evenodd"
								/>
							</svg>
							Import ESPN
						</button>
						<button
							on:click={() => openImportModal('sleeper')}
							class="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-green-700"
						>
							<svg class="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
								<path
									d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
								/>
							</svg>
							Import Sleeper
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Loading State -->
		{#if loading}
			<div class="flex h-64 items-center justify-center">
				<div class="text-center">
					<div class="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
					<p class="mt-4 text-gray-600">Loading your leagues...</p>
				</div>
			</div>
		{:else if Object.keys(groupedLeagues).length === 0}
			<!-- Empty State -->
			<div class="text-center">
				<svg
					class="mx-auto h-12 w-12 text-gray-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
					/>
				</svg>
				<h3 class="mt-2 text-sm font-medium text-gray-900">No leagues imported yet</h3>
				<p class="mt-1 text-sm text-gray-500">
					Get started by importing your ESPN or Sleeper leagues.
				</p>
				<div class="mt-6 flex justify-center space-x-3">
					<button
						on:click={() => openImportModal('espn')}
						class="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-red-700"
					>
						Import ESPN Leagues
					</button>
					<button
						on:click={() => openImportModal('sleeper')}
						class="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-green-700"
					>
						Import Sleeper Leagues
					</button>
				</div>
			</div>
		{:else}
			<!-- Leagues Grid -->
			<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each Object.entries(groupedLeagues) as [key, seasons]}
					{@const mainLeague = seasons[0]}
					{@const platform = mainLeague.platform}
					<div class="overflow-hidden rounded-lg bg-white shadow">
						<div class="p-6">
							<!-- Platform Badge -->
							<div class="flex items-center justify-between">
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
									class:bg-red-100={platform === 'ESPN'}
									class:text-red-800={platform === 'ESPN'}
									class:bg-green-100={platform === 'Sleeper'}
									class:text-green-800={platform === 'Sleeper'}
								>
									{platform}
								</span>
								<span class="text-sm text-gray-500"
									>{seasons.length} season{seasons.length > 1 ? 's' : ''}</span
								>
							</div>

							<!-- League Name -->
							<h3 class="mt-3 text-lg font-medium text-gray-900">{mainLeague.name}</h3>

							<!-- League Details -->
							<div class="mt-2 space-y-1 text-sm text-gray-600">
								<p>{mainLeague.team_count} teams</p>
								<p>Seasons: {getSeasonsSummary(seasons)}</p>
								<p class="text-xs">ID: {mainLeague.platform_league_id}</p>
							</div>

							<!-- Draft Status -->
							<div class="mt-4 space-y-2">
								{#each seasons as season}
									<div class="flex items-center justify-between text-sm">
										<span class="text-gray-600">{season.season_year}</span>
										<span
											class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
											class:bg-green-100={season.draft_completed}
											class:text-green-800={season.draft_completed}
											class:bg-yellow-100={!season.draft_completed}
											class:text-yellow-800={!season.draft_completed}
										>
											{season.draft_completed ? '✓ Draft Complete' : '⏳ Pending'}
										</span>
									</div>
								{/each}
							</div>
						</div>

						<!-- Actions -->
						<div class="bg-gray-50 px-6 py-3">
							<div class="flex justify-between text-sm">
								<a
									href="/analysis/{mainLeague.platform_league_id}"
									class="btn text-blue-600 hover:text-blue-900">View Analysis</a
								>
								<span class="text-gray-500"
									>Updated {new Date(mainLeague.updated_at).toLocaleDateString()}</span
								>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Stats Overview -->
			<div class="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
				<div class="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
					<dt class="truncate text-sm font-medium text-gray-500">Total Leagues</dt>
					<dd class="mt-1 text-3xl font-semibold text-gray-900">
						{Object.keys(groupedLeagues).length}
					</dd>
				</div>
				<div class="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
					<dt class="truncate text-sm font-medium text-gray-500">Total Seasons</dt>
					<dd class="mt-1 text-3xl font-semibold text-gray-900">{leagues.length}</dd>
				</div>
				<div class="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
					<dt class="truncate text-sm font-medium text-gray-500">Platforms</dt>
					<dd class="mt-1 text-3xl font-semibold text-gray-900">
						{new Set(leagues.map((l) => l.platform)).size}
					</dd>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Import Modal -->
{#if showImportModal}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div
			class="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0"
		>
			<div
				class="bg-opacity-75 fixed inset-0 bg-gray-500 transition-opacity"
				on:click={closeModal}
			></div>

			<div
				class="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle"
			>
				<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
					<div class="sm:flex sm:items-start">
						<div class="mt-3 w-full text-center sm:mt-0 sm:ml-4 sm:text-left">
							<h3 class="text-lg leading-6 font-medium text-gray-900">
								Import {importType === 'espn' ? 'ESPN' : 'Sleeper'} Leagues
							</h3>

							<div class="mt-4 space-y-4">
								{#if importType === 'espn'}
									<!-- ESPN Import Form -->
									<div>
										<label class="block text-sm font-medium text-gray-700">League ID</label>
										<input
											bind:value={espnLeagueId}
											placeholder="123456789"
											class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500"
										/>
									</div>
									<div>
										<label class="block text-sm font-medium text-gray-700">ESPN S2 Cookie</label>
										<textarea
											bind:value={espnS2}
											rows="2"
											class="mt-1 block w-full rounded-md border-gray-300 font-mono text-xs shadow-sm focus:border-red-500 focus:ring-red-500"
										></textarea>
									</div>
									<div>
										<label class="block text-sm font-medium text-gray-700">SWID Cookie</label>
										<input
											bind:value={espnSwid}
											class="mt-1 block w-full rounded-md border-gray-300 font-mono text-xs shadow-sm focus:border-red-500 focus:ring-red-500"
										/>
									</div>
								{:else}
									<!-- Sleeper Import Form -->
									<div>
										<label class="block text-sm font-medium text-gray-700">Sleeper Username</label>
										<input
											bind:value={sleeperUsername}
											placeholder="YourSleeperUsername"
											class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
										/>
									</div>
								{/if}

								<!-- Season Selection -->
								<div>
									<label class="block text-sm font-medium text-gray-700">Seasons</label>
									<div class="mt-2 grid grid-cols-4 gap-2">
										{#each [2024, 2023, 2022, 2021, 2020, 2019] as season}
											<label class="flex items-center">
												<input
													type="checkbox"
													bind:group={selectedSeasons}
													value={season}
													class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
												/>
												<span class="ml-1 text-sm">{season}</span>
											</label>
										{/each}
									</div>
								</div>

								{#if importError}
									<div class="rounded-md bg-red-50 p-4">
										<p class="text-sm text-red-800">{importError}</p>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>

				<div class="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
					<button
						on:click={handleImport}
						disabled={importing}
						class="inline-flex w-full justify-center rounded-md border border-transparent px-4 py-2 text-base font-medium text-white shadow-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-50 sm:ml-3 sm:w-auto sm:text-sm"
						class:bg-red-600={importType === 'espn'}
						class:hover:bg-red-700={importType === 'espn'}
						class:focus:ring-red-500={importType === 'espn'}
						class:bg-green-600={importType === 'sleeper'}
						class:hover:bg-green-700={importType === 'sleeper'}
						class:focus:ring-green-500={importType === 'sleeper'}
					>
						{importing ? 'Importing...' : 'Import'}
					</button>
					<button
						on:click={closeModal}
						class="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
