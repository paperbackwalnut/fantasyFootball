<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	let { data }: { data: PageData } = $props();
	let refreshing = $state(false);
	let refreshMessage = $state('');
	let selectedPlayer = $state<any>(null);
	let reviewingLineup = $state(false);
	const isSleeper = $derived(data.league.platform === 'SLEEPER');
	const platformLineupUrl = $derived(isSleeper
		? `https://sleeper.com/leagues/${encodeURIComponent(data.league.externalId)}/team`
		: `https://fantasy.espn.com/football/team?leagueId=${encodeURIComponent(data.league.externalId)}&teamId=${encodeURIComponent(String(data.user?.espn_team_id ?? ''))}`);
	const lineupPlayers = $derived(data.startSit.confidence === 'Hold' ? (data.user?.currentStarters ?? []) : (data.user?.starters ?? []));
	const nextKickoff = $derived(data.kickoffSchedule?.nextGame?.kickoffAt ? new Date(data.kickoffSchedule.nextGame.kickoffAt) : null);
	async function refreshLeague() {
		if (isSleeper) return;
		refreshing = true; refreshMessage = '';
		try {
			const response = await fetch(`/api/espn/leagues/${data.league.id}/refresh`, { method: 'POST' });
			const result = await response.json();
			if (!response.ok) throw new Error(result.message ?? 'ESPN refresh failed');
			refreshMessage = `${result.rosterPlayers} roster players refreshed`;
			await invalidateAll();
		} catch (cause) { refreshMessage = cause instanceof Error ? cause.message : 'ESPN refresh failed'; }
		finally { refreshing = false; }
	}
</script>

<svelte:head><title>{data.league.name} analysis</title></svelte:head>

<main class="dark-shell min-h-screen px-4 py-8 sm:px-8">
	<div class="mx-auto max-w-7xl">
		<header class="border-b border-slate-300 pb-7">
			<div class="flex flex-wrap items-start justify-between gap-5">
				<div>
					<div class="mb-3 flex items-center gap-3"><span class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider text-white" class:bg-[#14a76c]={isSleeper} class:bg-[#1d4ed8]={!isSleeper}><span class="h-2 w-2 rounded-full bg-white"></span>{isSleeper ? 'Sleeper' : 'ESPN'}</span><span class="text-sm font-semibold text-slate-500">Week {data.scoringPeriod} · {data.league.seasonYear}</span></div>
					<h1 class="text-4xl font-black tracking-tight">{data.league.name}</h1><p class="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{data.methodology}</p>
				</div>
				<div class="flex items-center gap-3">{#if !isSleeper}<button type="button" onclick={refreshLeague} disabled={refreshing} class="rounded-lg bg-blue-700 px-4 py-2.5 font-bold text-white hover:bg-blue-800 disabled:opacity-50">{refreshing ? 'Refreshing…' : 'Refresh ESPN data'}</button>{/if}<a href="/leagues" class="font-bold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-950">All leagues</a></div>
			</div>
			{#if refreshMessage}<p class="mt-4 border-l-4 border-blue-600 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">{refreshMessage}</p>{/if}
		</header>

		{#if isSleeper}<div class="mt-6 border-l-4 border-amber-500 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950"><strong>Sleeper lineup data is live.</strong> {data.projectionCoverage.projected} of {data.projectionCoverage.total} roster players have weekly projections. Offensive stat lines are rescored for this league; defenses use ESPN's weekly scoring proxy. Missing players use consensus rank as a fallback.</div>{/if}
		{#if nextKickoff}<div class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900 px-5 py-3 text-sm"><span><strong>Next NFL kickoff:</strong> {nextKickoff.toLocaleString()} · {data.kickoffSchedule.nextGame.teams.join(' vs ')}</span><span class="text-slate-400">Automatic checks: 24h · 3h · 90m · 30m · 10m</span></div>{/if}

		{#if data.user}<section class="grid gap-8 border-b border-slate-300 py-8 lg:grid-cols-[230px_1fr]">
			<div><p class="text-xs font-black uppercase tracking-widest text-slate-500">Your power rank</p><p class="mt-1 text-6xl font-black">#{data.user.powerRank}<span class="ml-2 text-lg font-semibold text-slate-400">/ {data.league.teamCount}</span></p>{#if data.user.weeklyTotal > 0}<p class="mt-2 font-semibold text-slate-600">{data.user.weeklyTotal} projected points</p>{/if}</div>
			<div><h2 class="text-sm font-black uppercase tracking-widest text-slate-500">Position profile</h2><div class="mt-4 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">{#each data.positionComparison as item}<div><div class="flex items-baseline justify-between border-b border-slate-300 pb-2"><span class="font-black">{item.position}</span><span class="text-2xl font-black" class:text-emerald-700={item.delta >= 0} class:text-rose-700={item.delta < 0}>{item.delta >= 0 ? '+' : ''}{item.delta}</span></div><p class="mt-1 text-xs text-slate-500">versus league average</p></div>{/each}</div></div>
		</section>{/if}

		<section class="border-b border-slate-300 py-8">
			<div class="mb-5 flex flex-wrap items-end justify-between gap-2"><div><p class="text-xs font-black uppercase tracking-widest text-slate-500">Lineup check</p><h2 class="mt-1 text-3xl font-black">Week {data.scoringPeriod} start/sit</h2></div><p class="max-w-xl text-right text-sm text-slate-500">{isSleeper ? 'Your exact Sleeper slots: submitted lineup versus the best eligible roster combination.' : 'ESPN weekly projections under your league scoring.'}</p></div>
			{#if data.user && (data.startSit.start.length || data.startSit.sit.length)}<button type="button" onclick={() => reviewingLineup = true} class="mb-5 rounded-lg bg-emerald-500 px-4 py-2.5 font-bold text-slate-950 hover:bg-emerald-400">Review lineup changes</button>{/if}
			{#if data.startSit.start.length || data.startSit.sit.length}<div class="grid overflow-hidden rounded-xl border border-slate-300 bg-white md:grid-cols-2"><div class="border-b border-slate-200 p-6 md:border-r md:border-b-0"><p class="text-xs font-black uppercase tracking-widest text-emerald-700">Start these players</p>{#each data.startSit.start as player}<div class="mt-4"><p class="text-xl font-black">{player.name}</p><p class="text-sm text-slate-500">{player.position}{player.weeklyProjected != null ? ` · ${player.weeklyProjected} projected points` : ''}{player.opponent ? ` · ${player.opponent}` : ''}</p></div>{/each}</div><div class="p-6"><p class="text-xs font-black uppercase tracking-widest text-rose-700">Move to bench</p>{#each data.startSit.sit as player}<div class="mt-4"><p class="text-xl font-black">{player.name}</p><p class="text-sm text-slate-500">{player.position}{player.weeklyProjected != null ? ` · ${player.weeklyProjected} projected points` : ''}{player.opponent ? ` · ${player.opponent}` : ''}</p></div>{/each}</div></div><p class="mt-3 text-sm font-semibold text-slate-500">Confidence: {data.startSit.confidence}{data.startSit.edge != null ? ` · ${data.startSit.edge} projected-point edge` : ' · incomplete projection comparison'}</p>{:else if data.startSit.closeCall}<div class="border-l-4 border-amber-500 bg-amber-50 px-5 py-4 text-amber-950"><p class="text-lg font-black">Hold your submitted lineup</p>{#if data.startSit.closeCall.locked}<p class="mt-1 text-sm">A player in this comparison has already locked. No lineup change can be made.</p>{:else}<p class="mt-1 text-sm">{data.startSit.closeCall.start.name} projects {data.startSit.closeCall.edge} points higher, but weekly consensus prefers {data.startSit.closeCall.sit.name}. That is too conflicted and too small an edge to recommend a switch.</p>{/if}</div>{:else}<div class="border-l-4 border-emerald-600 bg-emerald-50 px-5 py-4"><p class="text-lg font-black text-emerald-950">Your submitted {isSleeper ? 'Sleeper' : 'ESPN'} lineup matches the optimizer.</p><p class="mt-1 text-sm text-emerald-900">No lineup changes are recommended right now.</p></div>{/if}
			<div class="mt-6 overflow-x-auto"><table class="w-full text-left"><thead class="border-b-2 border-slate-900 text-xs uppercase tracking-wider text-slate-500"><tr><th class="py-3">Position</th><th class="py-3">Player</th><th class="py-3">Team</th><th class="py-3">Projection</th><th class="py-3">Status</th></tr></thead><tbody>{#each lineupPlayers as player}<tr class="border-b border-slate-200"><td class="py-3 font-black">{player.position}</td><td class="py-3 font-bold">{player.name}</td><td class="py-3 text-slate-500">{player.nflTeam ?? '—'}</td><td class="py-3 text-slate-500">{player.weeklyProjected != null ? `${player.weeklyProjected} pts` : '—'}</td><td class="py-3"><span class:font-bold={player.lineupLocked || (player.injuryStatus && !['NA', 'ACTIVE'].includes(String(player.injuryStatus).toUpperCase()))} class:text-amber-700={player.injuryStatus && !['NA', 'ACTIVE'].includes(String(player.injuryStatus).toUpperCase())}>{player.lineupLocked ? 'Locked' : player.injuryStatus && player.injuryStatus !== 'ACTIVE' ? player.injuryStatus : 'Available'}</span></td></tr>{/each}</tbody></table></div>
		</section>

		<section class="border-b border-slate-300 py-8">
			<div class="mb-5 flex items-end justify-between gap-4"><div><p class="text-xs font-black uppercase tracking-widest text-slate-500">Player explorer</p><h2 class="mt-1 text-3xl font-black">Your roster</h2></div><p class="text-sm text-slate-500">Select a player for details</p></div>
			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{#each data.user?.players ?? [] as player}<button type="button" onclick={() => selectedPlayer = player} class="player-button flex items-center justify-between rounded-lg border border-slate-300 bg-white px-4 py-3 text-left"><span><strong class="block">{player.name}</strong><span class="text-sm text-slate-500">{player.position} · {player.nflTeam ?? 'FA'}</span></span><span class="text-right"><strong class="block text-sm">{player.weeklyProjected != null ? `${player.weeklyProjected} pts` : 'No projection'}</strong><span class="text-lg text-slate-500">›</span></span></button>{/each}</div>
		</section>

		<section class="border-b border-slate-300 py-8">
			<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
				<div><p class="text-xs font-black uppercase tracking-widest text-slate-500">Available in your league</p><h2 class="mt-1 text-3xl font-black">Week {data.scoringPeriod} waiver targets</h2></div>
				<p class="max-w-xl text-right text-sm text-slate-500">Add candidates only—not dynasty drop advice. Ranked by weekly value, your needs, health, matchup, and consensus.</p>
			</div>
			{#if data.waiverAdvice.length}
				<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
					{#each data.waiverAdvice as player, index}
						<button type="button" onclick={() => selectedPlayer = player} class="player-button rounded-xl border border-slate-300 bg-white p-5 text-left">
							<div class="flex items-start justify-between gap-3"><span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 font-black text-slate-950">{index + 1}</span><span class="rounded-full border border-slate-300 px-2 py-1 text-xs font-bold text-slate-600">{player.priority}</span></div>
							<h3 class="mt-4 text-lg font-black">{player.name}</h3>
							<p class="mt-1 text-sm text-slate-500">{player.position} · {player.nflTeam}{player.opponent ? ` · ${player.opponent}` : ''}</p>
							<div class="mt-4 flex items-baseline justify-between"><strong>{player.weeklyProjected} pts</strong><span class="text-sm text-slate-500">{player.weeklyPositionRank ? `${player.position}${player.weeklyPositionRank}` : `ECR ${player.weeklyRank ?? '—'}`}</span></div>
							{#if player.injuryStatus && !['ACTIVE', 'NA'].includes(String(player.injuryStatus).toUpperCase())}<p class="mt-3 text-sm font-bold text-amber-600">{player.injuryStatus}</p>{/if}
						</button>
					{/each}
				</div>
			{:else}<p class="text-slate-500">No trustworthy available-player recommendations were found.</p>{/if}
		</section>

		<section class="border-b border-slate-300 py-8"><p class="text-xs font-black uppercase tracking-widest text-slate-500">League comparison</p><h2 class="mt-1 text-3xl font-black">Power rankings</h2><div class="mt-5 overflow-x-auto"><table class="w-full text-left"><thead class="border-b-2 border-slate-900 text-xs uppercase tracking-wider text-slate-500"><tr><th class="py-3">Rank</th><th class="py-3">Team</th><th class="py-3">Model</th><th class="py-3">Projected core</th></tr></thead><tbody>{#each data.powerRankings as team}<tr class="border-b border-slate-200" class:bg-emerald-50={team.is_user && isSleeper} class:bg-blue-50={team.is_user && !isSleeper}><td class="py-3 text-xl font-black">#{team.powerRank}</td><td class="py-3"><span class="font-bold">{team.team_name}</span>{#if team.is_user}<span class="ml-2 text-xs font-black uppercase text-slate-500">You</span>{/if}</td><td class="py-3 font-semibold">{team.weeklyTotal > 0 ? `${team.weeklyTotal} pts` : 'Rank model'}</td><td class="py-3 text-sm text-slate-600">{team.starters.slice(0, 5).map((player) => player.name).join(' · ')}</td></tr>{/each}</tbody></table></div></section>

		<section class="py-8"><p class="text-xs font-black uppercase tracking-widest text-slate-500">Roster market</p><h2 class="mt-1 text-3xl font-black">Trade-fit watchlist</h2><p class="mt-2 text-sm text-slate-500">Potential roster fits only—not clickable offers and not a fairness recommendation.</p>{#if data.tradeTargets.length}<div class="mt-5 grid gap-x-10 gap-y-5 md:grid-cols-2">{#each data.tradeTargets as player}<article class="border-t border-slate-300 pt-4"><div class="flex items-baseline justify-between gap-3"><h3 class="text-lg font-black">{player.name}</h3><span class="text-sm font-bold text-slate-500">{player.position} · {player.nflTeam}</span></div><p class="mt-1 text-sm text-slate-600">{player.fromTeam} · ECR {player.rank ?? '—'}</p><p class="mt-2 text-xs leading-5 text-slate-500">{player.reason}</p></article>{/each}</div>{:else}<p class="mt-5 text-slate-600">No clear surplus-for-need matches yet.</p>{/if}</section>
	</div>
	{#if selectedPlayer}<div class="fixed inset-0 z-50 flex items-end justify-end bg-black/70 p-4 sm:p-8" role="presentation" onclick={(event) => event.currentTarget === event.target && (selectedPlayer = null)}><aside class="detail-panel max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 p-6" aria-label={`${selectedPlayer.name} details`}><div class="flex items-start justify-between gap-4"><div><p class="text-xs font-black uppercase tracking-widest text-emerald-400">Player details</p><h2 class="mt-1 text-2xl font-black">{selectedPlayer.name}</h2><p class="mt-1 text-slate-400">{selectedPlayer.position} · {selectedPlayer.nflTeam ?? 'Free agent'}{selectedPlayer.opponent ? ` · ${selectedPlayer.opponent}` : ''}</p></div><button type="button" onclick={() => selectedPlayer = null} class="rounded-lg border border-slate-600 px-3 py-2 font-bold text-slate-200">Close</button></div><dl class="mt-8 grid grid-cols-2 gap-x-6 gap-y-5"><div><dt>Week {data.scoringPeriod}</dt><dd>{selectedPlayer.weeklyProjected != null ? `${selectedPlayer.weeklyProjected} pts` : 'No projection'}</dd></div><div><dt>Projection source</dt><dd>{selectedPlayer.projectionSource ?? (isSleeper ? 'Consensus fallback' : 'ESPN')}</dd></div><div><dt>Weekly ECR</dt><dd>{selectedPlayer.weeklyRank ?? '—'}{selectedPlayer.weeklyGrade ? ` · ${selectedPlayer.weeklyGrade}` : ''}</dd></div><div><dt>Weekly position rank</dt><dd>{selectedPlayer.weeklyPositionRank ?? '—'}</dd></div><div><dt>Season consensus</dt><dd>{selectedPlayer.rank ?? '—'}</dd></div><div><dt>Ranking spread</dt><dd>{selectedPlayer.rankUncertainty != null ? `±${selectedPlayer.rankUncertainty}` : '—'}</dd></div><div><dt>Injury status</dt><dd>{selectedPlayer.injuryStatus && selectedPlayer.injuryStatus !== 'ACTIVE' ? selectedPlayer.injuryStatus : 'Available'}</dd></div><div><dt>Bye week</dt><dd>{selectedPlayer.byeWeek ?? '—'}</dd></div><div><dt>Current lineup</dt><dd>{selectedPlayer.lineupSlotId === 20 ? 'Bench' : selectedPlayer.lineupSlotId === 21 ? 'Reserve/IR' : 'Starter'}</dd></div><div><dt>Season projection</dt><dd>{selectedPlayer.seasonProjected != null ? `${selectedPlayer.seasonProjected} pts` : '—'}</dd></div></dl>{#if selectedPlayer.weeklyNote}<div class="mt-7 border-t border-slate-700 pt-5"><p class="text-xs font-black uppercase tracking-widest text-slate-400">Weekly outlook</p><p class="mt-2 text-sm leading-6 text-slate-300">{selectedPlayer.weeklyNote}</p></div>{/if}</aside></div>{/if}
	{#if reviewingLineup}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="presentation">
			<section class="detail-panel max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 p-6" aria-label="Review lineup changes">
				<div class="flex items-start justify-between gap-4"><div><p class="text-xs font-black uppercase tracking-widest text-emerald-400">Week {data.scoringPeriod} · {isSleeper ? 'Sleeper' : 'ESPN'}</p><h2 class="mt-1 text-2xl font-black">Review lineup changes</h2></div><button type="button" onclick={() => reviewingLineup = false} class="rounded-lg border border-slate-600 px-3 py-2 font-bold">Close</button></div>
				<p class="mt-4 text-sm text-slate-300">This is a review checklist. No lineup will be changed automatically. Confirm the current roster and player locks on {isSleeper ? 'Sleeper' : 'ESPN'} before moving anyone.</p>
				<div class="mt-6 grid gap-4 sm:grid-cols-2"><div><h3 class="font-black text-emerald-400">Move into lineup</h3>{#each data.startSit.start as player}<p class="mt-2">{player.name} · {player.position}</p>{/each}</div><div><h3 class="font-black text-rose-400">Move to bench</h3>{#each data.startSit.sit as player}<p class="mt-2">{player.name} · {player.position}</p>{/each}</div></div>
				<div class="mt-7 flex flex-wrap gap-3"><a href={platformLineupUrl} target="_blank" rel="noopener noreferrer" class="rounded-lg bg-emerald-500 px-4 py-2.5 font-bold text-slate-950">Open {isSleeper ? 'Sleeper' : 'ESPN'} lineup ↗</a><button type="button" onclick={() => reviewingLineup = false} class="rounded-lg border border-slate-600 px-4 py-2.5 font-bold">Done reviewing</button></div>
			</section>
		</div>
	{/if}
</main>

<style>
	.dark-shell { background: #070b12; color: #edf2f8; }
	.dark-shell :global(.bg-white) { background: #111824; }
	.dark-shell :global(.text-slate-950) { color: #f8fafc; }
	.dark-shell :global(.text-slate-600) { color: #aab7c7; }
	.dark-shell :global(.text-slate-500), .dark-shell :global(.text-slate-400) { color: #8492a6; }
	.dark-shell :global(.border-slate-300), .dark-shell :global(.border-slate-200), .dark-shell :global(.border-slate-900) { border-color: #2b3646; }
	.dark-shell :global(.bg-emerald-50) { background: #0d2a23; }
	.dark-shell :global(.bg-blue-50) { background: #10233f; }
	.dark-shell :global(.bg-amber-50) { background: #2b210d; }
	.dark-shell :global(.text-amber-950), .dark-shell :global(.text-amber-900) { color: #f8dda0; }
	.dark-shell :global(.text-emerald-950), .dark-shell :global(.text-emerald-900) { color: #b7f7dc; }
	.dark-shell :global(h1) { font-size: 2rem; line-height: 1.15; }
	.dark-shell :global(h2) { font-size: 1.5rem; line-height: 1.25; }
	.dark-shell :global(.text-xs) { font-size: .78rem; }
	.dark-shell :global(.text-sm) { font-size: .925rem; }
	.player-button { cursor: pointer; transition: border-color .15s, background .15s, transform .15s; }
	.player-button:hover { background: #182334; border-color: #33d69f; transform: translateY(-1px); }
	.player-button:focus-visible { outline: 3px solid #33d69f; outline-offset: 2px; }
	.detail-panel { background: #101722; box-shadow: 0 24px 80px rgba(0,0,0,.55); }
	dt { color: #8492a6; font-size: .75rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
	dd { margin-top: .3rem; font-size: 1rem; font-weight: 750; color: #f8fafc; }
</style>
