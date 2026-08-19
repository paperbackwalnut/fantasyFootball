<script lang="ts">
	import { page } from '$app/state';
	import '../app.css';
	let { children } = $props();
	const isActive = (href: string) => page.url.pathname.startsWith(href);
</script>

<div class="flex min-h-screen flex-col bg-gray-50">
	<nav class="bg-white shadow-sm">
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<div class="flex h-16 items-center justify-between">
				<a href="/" class="text-xl font-bold">DraftSync Local</a>
				<ul class="flex items-center gap-6">
					<li><a href="/leagues" class:text-blue-600={isActive('/leagues')}>Leagues</a></li>
					<li><a href="/import" class:text-blue-600={isActive('/import')}>Import</a></li>
					<li><a href="/draft" class:text-blue-600={page.url.pathname === '/draft'}>Live Draft</a></li>
					<li><a href="/draft/history" class:text-blue-600={isActive('/draft/history')}>Draft History</a></li>
				</ul>
			</div>
		</div>
	</nav>
	<main class="flex-1"><div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{@render children()}</div></main>
</div>
