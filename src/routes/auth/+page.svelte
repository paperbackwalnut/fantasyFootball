<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	export let data: PageData;

	$: ({ supabase } = data);

	let email = '';
	let password = '';
	let loading = false;
	let isSignUp = false;
	let message = '';

	async function handleAuth() {
		loading = true;
		message = '';

		try {
			if (isSignUp) {
				const { error } = await supabase.auth.signUp({
					email,
					password
				});
				if (error) throw error;
				message = 'Check your email for the confirmation link!';
			} else {
				const { error } = await supabase.auth.signInWithPassword({
					email,
					password
				});
				if (error) throw error;
				goto('/');
			}
		} catch (error) {
			message = (error as Error).message;
		} finally {
			loading = false;
		}
	}
</script>

<!-- HTML stays the same -->
<div class="auth-container">
	<h1>Fantasy Football Draft Assistant</h1>

	<form on:submit|preventDefault={handleAuth}>
		<h2>{isSignUp ? 'Sign Up' : 'Sign In'}</h2>

		<input type="email" bind:value={email} placeholder="Email" required />

		<input type="password" bind:value={password} placeholder="Password" required />

		<button type="submit" disabled={loading}>
			{loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
		</button>
	</form>

	<p>
		{isSignUp ? 'Already have an account?' : "Don't have an account?"}
		<button type="button" class="link-button" on:click={() => (isSignUp = !isSignUp)}>
			{isSignUp ? 'Sign In' : 'Sign Up'}
		</button>
	</p>

	{#if message}
		<p class="message">{message}</p>
	{/if}
</div>

<style>
	.auth-container {
		max-width: 400px;
		margin: 100px auto;
		padding: 2rem;
	}

	input,
	button {
		width: 100%;
		padding: 0.75rem;
		margin: 0.5rem 0;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	.link-button {
		background: none;
		border: none;
		color: blue;
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
		width: auto;
	}

	.message {
		margin-top: 1rem;
		padding: 0.5rem;
		background: #f0f0f0;
		border-radius: 4px;
	}
</style>
