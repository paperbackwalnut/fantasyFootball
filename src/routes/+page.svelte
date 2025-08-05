<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	$: ({ supabase, session, user } = data);

	let status = 'Testing database...';

	onMount(async () => {
		if (user && supabase) {
			try {
				const { data: leagueData, error } = await supabase
					.from('leagues')
					.insert({
						platform: 'espn',
						platform_league_id: 'test_123',
						name: 'Test League',
						scoring_type: 'ppr',
						team_count: 12
					})
					.select();

				if (error) {
					status = `Error: ${error.message}`;
				} else if (leagueData && leagueData.length > 0) {
					status = `Success! Created league: ${leagueData[0].name}`;
				} else {
					status = 'Success! League created but no data returned';
				}
			} catch (e) {
				status = `Error: ${(e as Error).message}`;
			}
		} else if (!user) {
			status = 'Please sign in to test database';
		} else if (!supabase) {
			status = 'Supabase client not available';
		}
	});
</script>

<h1>Fantasy Football Draft Assistant</h1>
{#if user}
	<p>Database Status: {status}</p>
{:else}
	<p>Please sign in to use the app.</p>
{/if}
