<!-- src/routes/leagues/analysis/[leagueId]/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<h1>Analysis for League {data.leagueId}</h1>
<pre class="text-xs">{JSON.stringify(data.ownerTendencies, null, 2)}</pre>
