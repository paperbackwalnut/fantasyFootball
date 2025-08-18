<!-- src/routes/import/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';

	type Platform = 'ESPN' | 'Sleeper';
	let importType: Platform = 'ESPN';

	// ESPN
	let espnLeagueId = '';
	let swid = '';
	let espn_s2 = '';

	// Sleeper
	let sleeperUsername = '';

	// seasons
	const thisYear = new Date().getFullYear();
	const seasonOptions = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3, thisYear - 4];
	let selectedSeasons: number[] = [thisYear, thisYear - 1, thisYear - 2];

	let loading = false;
	let errorMsg = '';
	let successMsg = '';
	let lastResult: any = null;

	function toggleSeason(y: number) {
		selectedSeasons = selectedSeasons.includes(y)
			? selectedSeasons.filter((s) => s !== y)
			: [...selectedSeasons, y].sort((a, b) => b - a);
	}

	async function submitImport() {
		errorMsg = '';
		successMsg = '';
		lastResult = null;

		if (importType === 'ESPN') {
			if (!espnLeagueId || !swid || !espn_s2) {
				errorMsg = 'Fill League ID, SWID, and espn_s2.';
				return;
			}
		} else {
			if (!sleeperUsername) {
				errorMsg = 'Fill Sleeper username.';
				return;
			}
		}
		if (!selectedSeasons.length) {
			errorMsg = 'Pick at least one season.';
			return;
		}

		loading = true;
		try {
			const body: any = {
				platform: importType,
				seasons: selectedSeasons
			};
			if (importType === 'ESPN') {
				body.leagueId = espnLeagueId;
				body.auth = { swid, espn_s2 };
			} else {
				body.username = sleeperUsername; // <-- key change
			}

			const res = await fetch('/api/import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || `Import failed (${res.status})`);
			}
			const data = await res.json();
			lastResult = data;

			const okCount = data.results.filter((r: any) => r.ok).length;
			const failCount = data.results.length - okCount;
			successMsg = `Imported ${okCount}/${data.results.length} season(s)${failCount ? `, ${failCount} failed` : ''}.`;

			setTimeout(() => goto('/leagues'), 1500);
		} catch (e: any) {
			errorMsg = e?.message ?? 'Something went wrong.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="mx-auto max-w-2xl space-y-6 p-6">
	<h1 class="text-3xl font-bold">Import League</h1>

	<div class="inline-flex overflow-hidden rounded-md shadow-sm ring-1 ring-gray-300">
		<button
			type="button"
			class="px-4 py-2 text-sm"
			class:bg-blue-600={importType === 'ESPN'}
			class:text-white={importType === 'ESPN'}
			on:click={() => (importType = 'ESPN')}>ESPN</button
		>
		<button
			type="button"
			class="px-4 py-2 text-sm"
			class:bg-blue-600={importType === 'Sleeper'}
			class:text-white={importType === 'Sleeper'}
			on:click={() => (importType = 'Sleeper')}>Sleeper</button
		>
	</div>

	<form class="space-y-5" on:submit|preventDefault={submitImport}>
		{#if importType === 'ESPN'}
			<div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
				<h3 class="mb-2 font-semibold">ESPN cookies</h3>
				<ol class="list-inside list-decimal space-y-1 text-sm">
					<li>Log in at fantasy.espn.com</li>
					<li>DevTools → Application → Cookies → fantasy.espn.com</li>
					<li>Copy <code>espn_s2</code> and <code>SWID</code></li>
				</ol>
			</div>

			<label class="block">
				<span class="mb-1 block text-sm font-medium">ESPN League ID</span>
				<input
					class="w-full rounded border px-3 py-2"
					bind:value={espnLeagueId}
					placeholder="480762"
				/>
			</label>

			<label class="block">
				<span class="mb-1 block text-sm font-medium">SWID</span>
				<input
					class="w-full rounded border px-3 py-2 font-mono text-xs"
					bind:value={swid}
					placeholder="&lbrace;73B9...&rbrace;"
				/>
			</label>

			<label class="block">
				<span class="mb-1 block text-sm font-medium">espn_s2</span>
				<textarea
					class="w-full rounded border px-3 py-2 font-mono text-xs"
					rows="3"
					bind:value={espn_s2}
				></textarea>
			</label>
		{:else}
			<label class="block">
				<span class="mb-1 block text-sm font-medium">Sleeper Username</span>
				<input
					class="w-full rounded border px-3 py-2"
					bind:value={sleeperUsername}
					placeholder="your_username"
				/>
			</label>
		{/if}

		<div>
			<div class="mb-1 text-sm font-medium">Seasons</div>
			<div class="flex flex-wrap gap-3">
				{#each seasonOptions as y}
					<label class="inline-flex items-center gap-2">
						<input
							type="checkbox"
							checked={selectedSeasons.includes(y)}
							on:change={() => toggleSeason(y)}
						/>
						<span class="text-sm">{y}</span>
					</label>
				{/each}
			</div>
		</div>

		{#if errorMsg}<div class="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700">
				{errorMsg}
			</div>{/if}
		{#if successMsg}<div
				class="rounded border border-green-200 bg-green-50 px-4 py-3 text-green-700"
			>
				{successMsg}
			</div>{/if}

		<button
			type="submit"
			disabled={loading}
			class="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
		>
			{loading ? 'Importing…' : `Import ${importType} League`}
		</button>
	</form>

	{#if lastResult}
		<div class="rounded-lg border p-4">
			<h3 class="mb-2 font-semibold">Result</h3>
			<ul class="space-y-1 text-sm">
				{#each lastResult.results as r}
					<li>
						<strong>{r.season}:</strong>
						{#if r.ok}
							ok (teams {r.teams ?? '-'}, picks {r.picks ?? '-'})
						{:else}
							fail — {r.error}
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
