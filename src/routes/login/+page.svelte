<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

// src/routes/login/+page.svelte - Updated login form
<div class="mx-auto mt-16 max-w-md rounded-lg bg-white p-6 shadow">
	<h1 class="mb-6 text-2xl font-bold">Login</h1>

	<form method="POST" action="?/login" use:enhance>
		<div class="mb-4">
			<label for="email" class="mb-1 block text-sm font-medium">Email</label>
			<input
				id="email"
				name="email"
				type="email"
				class="w-full rounded-md border border-gray-300 px-3 py-2"
				required
			/>
		</div>

		<div class="mb-4">
			<label for="password" class="mb-1 block text-sm font-medium">Password</label>
			<input
				id="password"
				name="password"
				type="password"
				class="w-full rounded-md border border-gray-300 px-3 py-2"
				required
			/>
		</div>

		{#if form?.error}
			<div class="mb-4 text-sm text-red-600">{form.error}</div>
		{/if}

		<button
			type="submit"
			class="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
		>
			Login
		</button>
	</form>
</div>
