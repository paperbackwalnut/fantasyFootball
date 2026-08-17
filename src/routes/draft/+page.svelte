<script lang="ts">
	import { onMount } from 'svelte';

	type Pick = {
		pickNumber: number; round: number; teamId: string | null; teamName: string; playerId: string | null;
		playerName: string; position: string | null; nflTeam: string | null; matchConfidence: string;
	};
	type Team = { id: string; name: string; picks: Pick[] };
	type AvailablePlayer = { id: string; catalogId: string | null; name: string; nflTeam: string | null };
	type DraftState = {
		updatedAt: string; currentPick: number | null; completed: boolean; userIsOnTheClock: boolean;
		sync: { source: string; status: string; pickCount: number; resolvedCount: number; unresolvedCount: number };
		picks: Pick[]; teams: Team[]; availablePlayers: AvailablePlayer[];
		context: { leagueId: string | null; seasonYear: number; userTeamId: string | null; userTeamName: string | null; teamCount: number; draftSlot: number | null; completed: boolean; nextUserPick: number | null; picksUntilNextTurn: number | null; scoring: { format: string; receptionPoints: number | null }; settingsSource: string; rosterCounts: Record<string, number>; needsLeagueImport: boolean; userTeamDetected: boolean };
		intelligence: { catalog: { total: number; active: number; positioned: number; withBye: number }; valueSources: Array<{ source: string; count: number; updatedAt: string }>; news: { count: number; updatedAt: string | null } };
	};
	type Receiver = { observationCount: number; lastObservationAt: string | null; lastBatchAt: string | null };

	let draft = $state<DraftState | null>(null);
	let receiver = $state<Receiver | null>(null);
	let error = $state('');
	let loading = $state(true);
	let search = $state('');
	let selectedTeam = $state('');
	let lastSuccessfulPoll = $state<Date | null>(null);
	let now = $state(new Date());

	const recentPicks = $derived(draft?.picks.slice(-12).reverse() ?? []);
	const unresolved = $derived(draft?.picks.filter((pick) => !pick.playerId) ?? []);
	const selectedRoster = $derived(draft?.teams.find((team) => team.id === selectedTeam) ?? null);
	const filteredAvailable = $derived(
		(draft?.availablePlayers ?? [])
			.filter((player) => !search || `${player.name} ${player.nflTeam ?? ''}`.toLowerCase().includes(search.toLowerCase()))
			.slice(0, 100)
	);
	const lastUpdate = $derived(receiver?.lastObservationAt ? new Date(receiver.lastObservationAt) : null);
	const secondsOld = $derived(lastUpdate ? Math.max(0, Math.floor((now.getTime() - lastUpdate.getTime()) / 1000)) : null);
	const syncStatus = $derived(error ? 'offline' : secondsOld === null ? 'waiting' : secondsOld < 15 ? 'live' : 'stale');
	const inferredComplete = $derived(Boolean(draft?.completed || (draft?.currentPick && draft.teams.length > 0 && draft.currentPick === draft.picks.length + 1 && draft.picks.length >= draft.teams.length * 17 && draft.picks.length % draft.teams.length === 0)));

	async function refresh() {
		try {
			const response = await fetch('/api/sync/espn/state', { cache: 'no-store' });
			if (!response.ok) throw new Error(`Receiver returned ${response.status}`);
			const payload = await response.json();
			draft = payload.state;
			receiver = payload.receiver;
			if (!selectedTeam && draft?.teams.length) selectedTeam = draft.teams[0].id;
			error = '';
			lastSuccessfulPoll = new Date();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not reach the local receiver';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void refresh();
		const poll = setInterval(() => void refresh(), 1500);
		const clock = setInterval(() => { now = new Date(); }, 1000);
		return () => { clearInterval(poll); clearInterval(clock); };
	});

	function statusLabel() {
		if (syncStatus === 'live') return 'Live';
		if (syncStatus === 'stale') return 'Waiting for ESPN';
		if (syncStatus === 'offline') return 'Receiver offline';
		return 'Waiting for first draft snapshot';
	}
</script>

<svelte:head><title>Live Draft · DraftSync Local</title></svelte:head>

<div class="space-y-6">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="text-sm font-semibold uppercase tracking-wider text-blue-600">ESPN draft room</p>
			<h1 class="text-3xl font-bold text-gray-950">Live Draft Command Center</h1>
			<p class="mt-1 text-sm text-gray-500">SQLite-backed state from the automatic Chrome extension sync</p>
		</div>
		<div class="flex items-center gap-3 rounded-full border bg-white px-4 py-2 shadow-sm">
			<span class="h-2.5 w-2.5 rounded-full" class:bg-green-500={syncStatus === 'live'} class:bg-amber-500={syncStatus === 'stale' || syncStatus === 'waiting'} class:bg-red-500={syncStatus === 'offline'}></span>
			<div><div class="text-sm font-semibold">{statusLabel()}</div><div class="text-xs text-gray-500">{secondsOld === null ? 'No observations yet' : `${secondsOld}s since update`}</div></div>
		</div>
	</header>

	{#if error}
		<div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>Local receiver error:</strong> {error}</div>
	{:else if loading}
		<div class="rounded-xl border bg-white p-10 text-center text-gray-500">Loading local draft state…</div>
	{:else if !draft}
		<div class="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
			<h2 class="text-lg font-semibold text-amber-950">Waiting for an ESPN draft</h2>
			<p class="mt-2 text-sm text-amber-800">Open an ESPN draft with the extension enabled. The dashboard will update automatically.</p>
		</div>
	{:else}
		<section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
			<div class="rounded-xl border bg-white p-5 shadow-sm"><div class="text-xs font-semibold uppercase text-gray-500">Current pick</div><div class="mt-1 text-3xl font-bold">{draft.currentPick ?? '—'}</div></div>
			<div class="rounded-xl border bg-white p-5 shadow-sm"><div class="text-xs font-semibold uppercase text-gray-500">Selections</div><div class="mt-1 text-3xl font-bold">{draft.picks.length}</div></div>
			<div class="rounded-xl border bg-white p-5 shadow-sm"><div class="text-xs font-semibold uppercase text-gray-500">Teams</div><div class="mt-1 text-3xl font-bold">{draft.teams.length}</div></div>
			<div class="rounded-xl border bg-white p-5 shadow-sm"><div class="text-xs font-semibold uppercase text-gray-500">IDs resolved</div><div class="mt-1 text-3xl font-bold">{draft.sync.resolvedCount}<span class="text-base font-normal text-gray-400">/{draft.picks.length}</span></div></div>
			<div class="rounded-xl border p-5 shadow-sm" class:border-blue-300={draft.userIsOnTheClock} class:bg-blue-50={draft.userIsOnTheClock} class:bg-white={!draft.userIsOnTheClock}>
				<div class="text-xs font-semibold uppercase text-gray-500">Draft status</div><div class="mt-2 text-lg font-bold">{draft.userIsOnTheClock ? 'You are on the clock' : inferredComplete ? 'Draft complete' : 'Draft in progress'}</div>
			</div>
		</section>

		<section class="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
			<div class="rounded-xl border border-blue-200 bg-blue-50 p-5">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div><div class="text-xs font-semibold uppercase tracking-wide text-blue-700">Your draft context</div><div class="mt-1 text-xl font-bold text-blue-950">{draft.context.userTeamName ?? 'ESPN team not detected'}</div></div>
					<div class="rounded-lg bg-white/80 px-3 py-2 text-right"><div class="text-xs text-gray-500">{draft.context.completed ? 'Draft status' : 'Next turn'}</div><div class="font-bold">{draft.context.completed ? 'Complete' : draft.context.nextUserPick ? `Pick ${draft.context.nextUserPick}` : '—'}{!draft.context.completed && draft.context.picksUntilNextTurn !== null ? ` · ${draft.context.picksUntilNextTurn} away` : ''}</div></div>
				</div>
				<div class="mt-4 flex flex-wrap gap-2 text-xs">
					<span class="rounded-full bg-white px-3 py-1.5">Slot {draft.context.draftSlot ?? '—'} of {draft.context.teamCount}</span>
					<span class="rounded-full bg-white px-3 py-1.5">{draft.context.scoring.format === 'UNKNOWN' ? 'Scoring unknown' : draft.context.scoring.format.replace('_', ' ')}</span>
					{#each Object.entries(draft.context.rosterCounts) as [position, count]}<span class="rounded-full bg-white px-3 py-1.5">{position} {count}</span>{/each}
				</div>
				{#if draft.context.needsLeagueImport}<p class="mt-3 text-xs text-blue-800">Team and draft slot came from the live ESPN room. Import this league to replace safe roster defaults with its exact scoring and lineup settings.</p>{/if}
			</div>
			<div class="rounded-xl border bg-white p-5 shadow-sm">
				<div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Player intelligence</div>
				<div class="mt-2 text-2xl font-bold">{draft.intelligence.catalog.active.toLocaleString()} <span class="text-sm font-normal text-gray-500">active identities</span></div>
				<div class="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div class="rounded-lg bg-gray-50 p-2"><strong class="block text-base">{draft.intelligence.catalog.positioned}</strong>positioned</div><div class="rounded-lg bg-gray-50 p-2"><strong class="block text-base">{draft.intelligence.catalog.withBye}</strong>bye weeks</div><div class="rounded-lg bg-gray-50 p-2"><strong class="block text-base">{draft.intelligence.valueSources.length}</strong>rank sources</div></div>
			</div>
		</section>

		<div class="grid gap-6 xl:grid-cols-[1.05fr_1.4fr]">
			<section class="rounded-xl border bg-white shadow-sm">
				<div class="border-b px-5 py-4"><h2 class="font-bold">Recent selections</h2><p class="text-xs text-gray-500">Most recent first</p></div>
				<div class="divide-y">
					{#each recentPicks as pick}
						<div class="flex items-center gap-3 px-5 py-3">
							<div class="w-10 text-center text-sm font-bold text-gray-400">#{pick.pickNumber}</div>
							<div class="min-w-0 flex-1"><div class="truncate font-semibold">{pick.playerName}</div><div class="truncate text-xs text-gray-500">{pick.teamName}</div></div>
							<div class="text-right text-xs"><div class="font-semibold">{pick.position ?? '—'}</div><div class="text-gray-400">{pick.nflTeam ?? '—'}</div></div>
						</div>
					{/each}
				</div>
			</section>

			<section class="rounded-xl border bg-white shadow-sm">
				<div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
					<div><h2 class="font-bold">Team rosters</h2><p class="text-xs text-gray-500">{draft.teams.length} ESPN teams</p></div>
					<select aria-label="Select fantasy team" bind:value={selectedTeam} class="max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
						{#each draft.teams as team}<option value={team.id}>{team.name}</option>{/each}
					</select>
				</div>
				{#if selectedRoster}
					<div class="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
						{#each selectedRoster.picks as pick}
							<div class="flex items-center gap-3 rounded-lg border bg-gray-50 px-3 py-2"><span class="w-7 text-xs font-bold text-gray-400">{pick.round}</span><div class="min-w-0 flex-1"><div class="truncate text-sm font-semibold">{pick.playerName}</div><div class="text-xs text-gray-500">{pick.position ?? '—'} · {pick.nflTeam ?? '—'}</div></div></div>
						{/each}
					</div>
				{/if}
			</section>
		</div>

		<div class="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
			<section class="rounded-xl border bg-white shadow-sm">
				<div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h2 class="font-bold">Available player catalog</h2><p class="text-xs text-gray-500">Showing up to 100 matches</p></div><input aria-label="Search available players" bind:value={search} placeholder="Search name or NFL team" class="rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
				<div class="max-h-96 overflow-auto divide-y">
					{#each filteredAvailable as player}<div class="flex justify-between px-5 py-2.5 text-sm"><span class="font-medium">{player.name}</span><span class="text-gray-500">{player.nflTeam ?? 'FA'}</span></div>{/each}
				</div>
			</section>

			<section class="rounded-xl border bg-white shadow-sm">
				<div class="border-b px-5 py-4"><h2 class="font-bold">Identity review</h2><p class="text-xs text-gray-500">{unresolved.length} selections need a current catalog match</p></div>
				{#if unresolved.length}
					<div class="max-h-96 overflow-auto divide-y">{#each unresolved as pick}<div class="px-5 py-3"><div class="text-sm font-semibold">{pick.playerName}</div><div class="text-xs text-gray-500">Pick {pick.pickNumber} · {pick.position ?? 'Unknown position'} · {pick.nflTeam ?? 'Unknown team'}</div></div>{/each}</div>
				{:else}<div class="p-8 text-center text-sm text-green-700">Every drafted player is resolved.</div>{/if}
			</section>
		</div>

		<footer class="flex flex-wrap justify-between gap-2 text-xs text-gray-500"><span>{receiver?.observationCount ?? 0} observations stored locally</span><span>Last successful dashboard poll: {lastSuccessfulPoll?.toLocaleTimeString() ?? 'never'}</span></footer>
	{/if}
</div>
