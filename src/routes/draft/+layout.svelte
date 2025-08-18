<script lang="ts">
	import { page } from '$app/stores';

	let { data, children } = $props();

	// Add any draft-specific layout logic here
</script>

<div class="min-h-screen bg-gray-50">
	{@render children()}
</div>
