<script lang="ts">
	import { onMount } from 'svelte';

	type Pick = {
		pickNumber: number; round: number; teamId: string | null; teamName: string; playerId: string | null;
		catalogId?: string | null; playerName: string; position: string | null; nflTeam: string | null; matchConfidence: string;
	};
	type Team = { id: string; name: string; picks: Pick[] };
	type AvailablePlayer = { id: string; catalogId: string | null; name: string; position?: string | null; nflTeam: string | null; byeWeek?: number | null; consensusRank?: number | null; positionRank?: number | null; espnDisplayedRank?: number | null; tier?: number | null; adp?: number | null; minPick?: number | null; maxPick?: number | null; projectedPoints?: number | null; pointVorp?: number | null; replacementPoints?: number | null; projectionSourceCount?: number | null; projectionDisagreement?: number | null; injuryStatus?: string | null };
	type Recommendation = AvailablePlayer & { recommendationRank: number; recommendationScore: number; availabilityRisk: number; expectedRosterValue?: number | null; rolloutDownside?: number | null; rolloutUpside?: number | null; likelyNextPlayer?: string | null; likelyNextRate?: number | null; reasons: string[]; scoreComponents: Record<string, number> };
	type MarketSignal = { position: string; active: boolean; lastSix: number; lastTen: number; consecutive: number; overallCount: number; demandMultiple: number; intensity: number };
	type DraftState = {
		updatedAt: string; currentPick: number | null; completed: boolean; preDraft?: boolean; userIsOnTheClock: boolean;
		sync: { source: string; status: string; pickCount: number; resolvedCount: number; unresolvedCount: number };
		picks: Pick[]; teams: Team[]; availablePlayers: AvailablePlayer[]; recommendations: Recommendation[]; market: { sampleSize: number; windowSize: number; summary: string; activeRuns: MarketSignal[]; signals: MarketSignal[] };
		commandBridge: { online: boolean; lastPollAt: string | null; pending: { id?: string; playerName?: string } | null; lastResult: { commandId?: string; ok?: boolean; message?: string; at?: string } | null };
		context: { leagueId: string | null; seasonYear: number; userTeamId: string | null; userTeamName: string | null; teamCount: number; draftSlot: number | null; currentPick: number; completed: boolean; nextUserPick: number | null; picksUntilNextTurn: number | null; scoring: { format: string; receptionPoints: number | null }; settingsSource: string; rosterCounts: Record<string, number>; needsLeagueImport: boolean; userTeamDetected: boolean };
		intelligence: { catalog: { total: number; active: number; positioned: number; withBye: number }; valueSources: Array<{ source: string; count: number; updatedAt: string }>; news: { count: number; updatedAt: string | null };
			health: Array<{ provider: string; status: string; error?: string | null; lastSuccessAt?: string | null; updatedAt: string }>; projectionImportDirectory: string };
		recommendationRun?: { id: string; modelVersion: string; cached: boolean } | null;
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
	let refreshingPlayers = $state(false);
	let playerRefreshMessage = $state('');
	let projectionFile = $state<File | null>(null);
	let projectionSource = $state('');
	let projectionMessage = $state('');
	let importingProjections = $state(false);
	let clearingDraft = $state(false);
	let copiedPlayer = $state('');
	let copyMessage = $state('');

	const recentPicks = $derived(draft?.picks.slice(-12).reverse() ?? []);
	const unresolved = $derived(draft?.picks.filter((pick) => !pick.playerId) ?? []);
	const selectedRoster = $derived(draft?.teams.find((team) => team.id === selectedTeam) ?? null);
	const filteredAvailable = $derived(
		(draft?.availablePlayers ?? [])
			.filter((player) => !search || `${player.name} ${player.position ?? ''} ${player.nflTeam ?? ''}`.toLowerCase().includes(search.toLowerCase()))
			.slice(0, 100)
	);
	const visibleRecommendations = $derived(draft?.recommendations ?? []);
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

	async function refreshPlayerData() {
		refreshingPlayers = true;
		playerRefreshMessage = '';
		try {
			const response = await fetch('/api/player-intelligence/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ teamCount: draft?.context.teamCount ?? 10 }) });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.message ?? `Refresh returned ${response.status}`);
			const results = payload.results ?? payload;
			playerRefreshMessage = `${results.sleeper.players?.toLocaleString?.() ?? '—'} players · ${results.rankings.imported ?? '—'} ranks · ${results.adp.imported ?? '—'} ADPs${results.watchedImports.imported?.length ? ` · ${results.watchedImports.imported.length} projection file(s)` : ''}`;
			await refresh();
		} catch (cause) {
			playerRefreshMessage = cause instanceof Error ? cause.message : 'Player refresh failed';
		} finally {
			refreshingPlayers = false;
		}
	}

	async function importProjections() {
		if (!projectionFile) return;
		importingProjections = true;
		projectionMessage = '';
		try {
			const form = new FormData();
			form.set('file', projectionFile);
			form.set('source', projectionSource || projectionFile.name.replace(/\.csv$/i, ''));
			form.set('seasonYear', String(draft?.context.seasonYear ?? new Date().getFullYear()));
			form.set('scoringFormat', 'PPR');
			const response = await fetch('/api/player-intelligence/projections', { method: 'POST', body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.message ?? 'Import failed');
			projectionMessage = `${payload.imported}/${payload.rows} projections matched${payload.unmatched ? ` · ${payload.unmatched} unmatched` : ''}`;
			await refresh();
		} catch (cause) {
			projectionMessage = cause instanceof Error ? cause.message : 'Projection import failed';
		} finally {
			importingProjections = false;
		}
	}

	async function clearDraft() {
		if (!confirm('Clear the saved ESPN live-draft snapshot? Rankings, ADP, leagues, and player data will be kept.')) return;
		clearingDraft = true;
		try {
			const response = await fetch('/api/sync/espn/state', { method: 'DELETE' });
			if (!response.ok) throw new Error(`Reset returned ${response.status}`);
			draft = null;
			error = '';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not clear the saved draft';
		} finally {
			clearingDraft = false;
		}
	}

	async function copyPlayerName(player: Recommendation) {
		try {
			await navigator.clipboard.writeText(player.name);
			copiedPlayer = player.catalogId ?? player.name;
			copyMessage = `Copied ${player.name}. Paste it into ESPN's player search.`;
			setTimeout(() => {
				if (copiedPlayer === (player.catalogId ?? player.name)) copiedPlayer = '';
			}, 2500);
		} catch (cause) {
			copyMessage = cause instanceof Error ? `Could not copy: ${cause.message}` : 'Could not copy the player name';
		}
	}

	onMount(() => {
		void refresh();
		const poll = setInterval(() => void refresh(), 600);
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
		<div class="flex flex-wrap items-center justify-end gap-3"><a href="/draft/history" class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm">Draft history</a><button type="button" onclick={clearDraft} disabled={clearingDraft || !draft} class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm disabled:opacity-40">{clearingDraft ? 'Clearing…' : draft?.completed ? 'Archive & clear board' : 'Clear live board'}</button><div class="flex items-center gap-3 rounded-full border bg-white px-4 py-2 shadow-sm">
			<span class="h-2.5 w-2.5 rounded-full" class:bg-green-500={syncStatus === 'live'} class:bg-amber-500={syncStatus === 'stale' || syncStatus === 'waiting'} class:bg-red-500={syncStatus === 'offline'}></span>
			<div><div class="text-sm font-semibold">{statusLabel()}</div><div class="text-xs text-gray-500">{secondsOld === null ? 'No observations yet' : `${secondsOld}s since update`}</div></div>
		</div></div>
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
				<div class="text-xs font-semibold uppercase text-gray-500">Draft status</div><div class="mt-2 text-lg font-bold">{draft.userIsOnTheClock ? 'You are on the clock' : inferredComplete ? 'Draft complete' : draft.preDraft ? 'Waiting to start' : 'Draft in progress'}</div>
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
				<div class="flex items-center justify-between gap-3"><div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Player intelligence</div><button type="button" onclick={refreshPlayerData} disabled={refreshingPlayers} class="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{refreshingPlayers ? 'Refreshing…' : 'Refresh data'}</button></div>
				<div class="mt-2 text-2xl font-bold">{draft.intelligence.catalog.active.toLocaleString()} <span class="text-sm font-normal text-gray-500">active identities</span></div>
				<div class="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div class="rounded-lg bg-gray-50 p-2"><strong class="block text-base">{draft.intelligence.catalog.positioned}</strong>positioned</div><div class="rounded-lg bg-gray-50 p-2"><strong class="block text-base">{draft.intelligence.catalog.withBye}</strong>bye weeks</div><div class="rounded-lg bg-gray-50 p-2"><strong class="block text-base">{draft.intelligence.valueSources.length}</strong>rank sources</div></div>
				<div class="mt-3 flex flex-wrap gap-1.5 text-[11px]">{#each draft.intelligence.health as source}<span class="rounded-full px-2 py-1" class:bg-green-100={source.status === 'healthy'} class:text-green-800={source.status === 'healthy'} class:bg-red-100={source.status === 'failed'} class:text-red-800={source.status === 'failed'} title={source.error ?? source.lastSuccessAt ?? source.updatedAt}>{source.provider}: {source.status}</span>{/each}</div>
				{#if playerRefreshMessage}<p class="mt-2 text-xs text-gray-600">{playerRefreshMessage}</p>{/if}
			</div>
		</section>

		<section class="rounded-xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
			<div class="flex flex-wrap items-start justify-between gap-3"><div><div class="text-xs font-semibold uppercase tracking-wide text-indigo-700">Independent pick advisor</div><h2 class="mt-1 text-xl font-bold text-indigo-950">Best options right now</h2><p class="mt-1 text-xs text-indigo-800">League-scored projections, replacement value, market survival, roster construction, and guarded two-turn rollouts.</p></div>{#if draft.context.nextUserPick}<div class="rounded-lg bg-white px-3 py-2 text-xs text-gray-600">Planning through pick <strong>{draft.context.nextUserPick}</strong>{#if draft.recommendationRun}<div class="mt-1 text-[10px] text-gray-400">{draft.recommendationRun.modelVersion}{draft.recommendationRun.cached ? ' · cached' : ' · new state'}</div>{/if}</div>{/if}</div>
			<div class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs"><strong class="text-indigo-900">Room trend:</strong><span class="text-gray-700">{draft.market?.summary ?? 'Collecting picks'}</span>{#each (draft.market?.signals ?? []).slice(0, 3) as signal}<span class="rounded-full px-2 py-1" class:bg-amber-100={signal.active} class:text-amber-900={signal.active} class:bg-gray-100={!signal.active}>{signal.position} {signal.lastTen}/10 · {signal.demandMultiple}× room rate</span>{/each}</div>
			<p class="mt-2 text-xs text-gray-600">Copy a recommendation, then paste it into ESPN's player search.</p>
			{#if copyMessage}<p class="mt-3 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">{copyMessage}</p>{/if}
			{#if visibleRecommendations.length}
				<div class="mt-4 grid gap-3 lg:grid-cols-3">
					{#each visibleRecommendations.slice(0, 6) as player}
						<div class="rounded-xl border border-indigo-100 bg-white p-4"><div class="flex items-start gap-3"><span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-sm font-bold text-white">{player.recommendationRank}</span><div class="min-w-0 flex-1"><div class="truncate font-bold">{player.name}</div><div class="text-xs text-gray-500">{player.position ?? '—'} · {player.nflTeam ?? 'FA'}{player.byeWeek ? ` · Bye ${player.byeWeek}` : ''} · ECR {player.consensusRank?.toFixed(1) ?? '—'} · ADP {player.adp?.toFixed(1) ?? '—'}{player.espnDisplayedRank ? ` · ESPN #${Math.round(player.espnDisplayedRank)}` : ''}</div>{#if player.pointVorp != null}<div class="mt-1 text-[11px] font-semibold text-indigo-700">{player.pointVorp.toFixed(1)} points above replacement · {player.projectionSourceCount ?? 0} source{player.projectionSourceCount === 1 ? '' : 's'}</div>{/if}</div></div><ul class="mt-3 space-y-1 text-xs text-gray-700">{#each player.reasons as reason}<li>• {reason}</li>{/each}</ul>{#if player.expectedRosterValue != null}<div class="mt-2 rounded bg-indigo-50 px-2 py-1 text-[11px] text-indigo-900">Two-turn value {player.expectedRosterValue} · range {player.rolloutDownside}–{player.rolloutUpside}{#if player.likelyNextPlayer} · likely next: {player.likelyNextPlayer}{/if}</div>{/if}<details class="mt-2 text-[11px] text-gray-500"><summary class="cursor-pointer">Score {player.recommendationScore.toFixed(1)} breakdown</summary><div class="mt-1 flex flex-wrap gap-x-2">{#each Object.entries(player.scoreComponents) as [label, value]}<span>{label} {value >= 0 ? '+' : ''}{value}</span>{/each}</div></details>{#if draft.context.nextUserPick && draft.context.nextUserPick > draft.context.currentPick}<div class="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100" title={`${player.availabilityRisk}% estimated chance gone`}><div class="h-full bg-amber-500" style={`width: ${player.availabilityRisk}%`}></div></div><div class="mt-1 text-[11px] text-gray-500">{player.availabilityRisk}% estimated chance gone by next turn</div>{/if}<button type="button" onclick={() => copyPlayerName(player)} class="mt-3 w-full rounded-lg bg-indigo-700 px-3 py-2 text-xs font-bold text-white">{copiedPlayer === (player.catalogId ?? player.name) ? 'Copied!' : `Copy ${player.name}`}</button></div>
					{/each}
				</div>
			{:else}<p class="mt-4 rounded-lg bg-white p-4 text-sm text-gray-600">Recommendations appear during an active draft after rankings are loaded.</p>{/if}
		</section>

		<section class="rounded-xl border bg-white p-5 shadow-sm">
			<div class="flex flex-wrap items-end gap-3">
				<div class="mr-auto"><div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Season projections</div><p class="mt-1 text-sm text-gray-600">Import here, or drop <code>source--2026--PPR.csv</code> into <code class="break-all">{draft.intelligence.projectionImportDirectory}</code>. Files are validated and archived automatically. <a class="text-blue-600 underline" href="/api/player-intelligence/projections?template=1">Download template</a></p></div>
				<input aria-label="Projection source" bind:value={projectionSource} placeholder="Source name" class="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
				<input aria-label="Projection CSV file" type="file" accept=".csv,text/csv" onchange={(event) => projectionFile = event.currentTarget.files?.[0] ?? null} class="max-w-xs text-sm" />
				<button type="button" onclick={importProjections} disabled={!projectionFile || importingProjections} class="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{importingProjections ? 'Importing…' : 'Import projections'}</button>
			</div>
			{#if projectionMessage}<p class="mt-2 text-xs text-gray-600">{projectionMessage}</p>{/if}
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
				<div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h2 class="font-bold">Ranked available players</h2><p class="text-xs text-gray-500">2026 PPR consensus and {draft.context.teamCount}-team recent ADP · showing 100</p></div><input aria-label="Search available players" bind:value={search} placeholder="Search name, position, or NFL team" class="rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
				<div class="max-h-96 overflow-auto divide-y">
					{#each filteredAvailable as player}<div class="grid grid-cols-[2.6rem_1fr_auto_auto_auto] items-center gap-3 px-5 py-2.5 text-sm"><span class="font-bold text-gray-400">{player.consensusRank ? `#${Math.round(player.consensusRank)}` : '—'}</span><div><div class="font-medium">{player.name}{#if player.injuryStatus}<span class="ml-2 text-xs font-semibold text-red-600">{player.injuryStatus}</span>{/if}</div><div class="text-xs text-gray-500">{player.position ?? '—'} · {player.nflTeam ?? 'FA'}{player.tier ? ` · Tier ${player.tier}` : ''}</div></div><div class="text-right"><div class="text-xs text-gray-400">Proj</div><div class="font-semibold">{player.projectedPoints?.toFixed(1) ?? '—'}</div></div><div class="text-right"><div class="text-xs text-gray-400">ADP</div><div class="font-semibold">{player.adp ? player.adp.toFixed(1) : '—'}</div></div><div class="w-20 text-right text-xs text-gray-500">{player.minPick && player.maxPick ? `${player.minPick}–${player.maxPick}` : 'no range'}</div></div>{/each}
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
