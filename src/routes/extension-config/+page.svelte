<script lang="ts">
	import { onMount } from 'svelte';

	let backendUrl = 'http://localhost:5173';
	let useMockApi = false;
	let testLeagueId = 'mock-draft-test';
	let extensionStatus = 'Unknown';
	let lastPick: any = null;

	onMount(() => {
		// Try to get current extension settings
		checkExtensionStatus();

		// Listen for extension messages
		window.addEventListener('message', handleExtensionMessage);

		return () => {
			window.removeEventListener('message', handleExtensionMessage);
		};
	});

	function checkExtensionStatus() {
		// Check if extension is loaded by looking for debug objects
		if (typeof window.draftSyncDebug !== 'undefined') {
			extensionStatus = 'Loaded';
		} else {
			extensionStatus = 'Not Loaded';
		}
	}

	function handleExtensionMessage(event: MessageEvent) {
		if (event.data?.type === 'ESPN_PICK') {
			lastPick = {
				...event.data.data,
				timestamp: new Date().toLocaleTimeString()
			};
		}
	}

	function updateExtensionConfig() {
		try {
			if (typeof window.draftSyncDebug !== 'undefined') {
				// Update backend URL
				(window as any).draftSyncDebug.setBackendUrl(backendUrl);

				// Set mock mode
				if (useMockApi) {
					(window as any).draftSyncState.mockMode = true;
					(window as any).draftSyncState.mockLeagueId = testLeagueId;
				} else {
					(window as any).draftSyncState.mockMode = false;
				}

				alert('Extension configuration updated!');
			} else {
				alert('Extension not found. Make sure the Chrome extension is loaded.');
			}
		} catch (e) {
			alert('Error updating extension: ' + e);
		}
	}

	function testExtensionConnection() {
		try {
			if (typeof window.draftSyncDebug !== 'undefined') {
				console.log('Extension state:', (window as any).draftSyncState);
				console.log('Extension debug:', (window as any).draftSyncDebug);
				alert('Extension is working! Check console for details.');
			} else {
				alert('Extension not found. Please load the Chrome extension first.');
			}
		} catch (e) {
			alert('Error testing extension: ' + e);
		}
	}

	function simulateExtensionPick() {
		// Simulate a pick for testing
		window.postMessage(
			{
				type: 'ESPN_PICK',
				data: {
					sitePlayerId: Math.random().toString(36).substr(2, 9),
					fantasyTeamId: Math.floor(Math.random() * 12) + 1,
					slotId: '20'
				}
			},
			'*'
		);
	}

	function openMockDraft() {
		window.open('/draft?test=true', '_blank');
	}
</script>

// src/routes/extension-config/+page.svelte
<svelte:head>
	<title>Extension Configuration - DraftSync</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<div class="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="mb-8">
			<h1 class="text-3xl font-bold text-gray-900">Extension Configuration</h1>
			<p class="mt-2 text-gray-600">Configure your Chrome extension for draft testing</p>
		</div>

		<div class="space-y-6">
			<!-- Extension Status -->
			<div class="rounded-lg bg-white p-6 shadow">
				<h2 class="mb-4 text-lg font-medium text-gray-900">Extension Status</h2>
				<div class="flex items-center space-x-4">
					<span class="text-sm text-gray-600">Status:</span>
					<span
						class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {extensionStatus ===
						'Loaded'
							? 'bg-green-100 text-green-800'
							: 'bg-red-100 text-red-800'}"
					>
						{extensionStatus}
					</span>
					<button on:click={checkExtensionStatus} class="text-sm text-blue-600 hover:text-blue-700">
						Refresh
					</button>
				</div>
			</div>

			<!-- Configuration -->
			<div class="rounded-lg bg-white p-6 shadow">
				<h2 class="mb-4 text-lg font-medium text-gray-900">Configuration</h2>

				<div class="space-y-4">
					<div>
						<label for="backend-url" class="mb-1 block text-sm font-medium text-gray-700">
							Backend URL
						</label>
						<input
							id="backend-url"
							type="text"
							bind:value={backendUrl}
							class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
							placeholder="http://localhost:5173"
						/>
						<p class="mt-1 text-sm text-gray-500">URL of your SvelteKit app</p>
					</div>

					<div class="flex items-center">
						<input
							id="mock-api"
							type="checkbox"
							bind:checked={useMockApi}
							class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<label for="mock-api" class="ml-2 text-sm text-gray-700">
							Use Mock API (for testing without real leagues)
						</label>
					</div>

					{#if useMockApi}
						<div>
							<label for="test-league-id" class="mb-1 block text-sm font-medium text-gray-700">
								Test League ID
							</label>
							<input
								id="test-league-id"
								type="text"
								bind:value={testLeagueId}
								class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
								placeholder="mock-draft-test"
							/>
							<p class="mt-1 text-sm text-gray-500">ID to use for mock draft testing</p>
						</div>
					{/if}
				</div>

				<div class="mt-6 flex space-x-4">
					<button
						on:click={updateExtensionConfig}
						class="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						Update Extension
					</button>

					<button
						on:click={testExtensionConnection}
						class="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
					>
						Test Connection
					</button>
				</div>
			</div>

			<!-- Testing Tools -->
			<div class="rounded-lg bg-white p-6 shadow">
				<h2 class="mb-4 text-lg font-medium text-gray-900">Testing Tools</h2>

				<div class="space-y-4">
					<div class="flex space-x-4">
						<button
							on:click={simulateExtensionPick}
							class="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>
							Simulate Pick
						</button>

						<button
							on:click={openMockDraft}
							class="inline-flex items-center rounded-md border border-transparent bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
						>
							Open Mock Draft
						</button>
					</div>

					{#if lastPick}
						<div class="mt-4 rounded-lg bg-gray-50 p-4">
							<h3 class="mb-2 text-sm font-medium text-gray-900">Last Pick Received:</h3>
							<pre class="text-xs text-gray-600">{JSON.stringify(lastPick, null, 2)}</pre>
						</div>
					{/if}
				</div>
			</div>

			<!-- Instructions -->
			<div class="rounded-lg bg-blue-50 p-6">
				<h2 class="mb-4 text-lg font-medium text-blue-900">Testing Instructions</h2>
				<ol class="list-inside list-decimal space-y-2 text-sm text-blue-800">
					<li>Load your Chrome extension on this page</li>
					<li>Configure the backend URL to match your SvelteKit app</li>
					<li>Enable "Use Mock API" for testing without real ESPN leagues</li>
					<li>Click "Update Extension" to apply settings</li>
					<li>Use "Simulate Pick" to test the integration</li>
					<li>Open the Mock Draft view to see real-time updates</li>
				</ol>

				<div class="mt-4 rounded border bg-white p-4">
					<h3 class="mb-2 font-medium text-blue-900">Mock Draft URLs:</h3>
					<div class="space-y-1 text-sm">
						<div><strong>Mock Draft View:</strong> <code>/draft?test=true</code></div>
						<div><strong>Extension Config:</strong> <code>/extension-config</code></div>
						<div>
							<strong>Mock API Endpoint:</strong> <code>/api/espn/extension/mock-picks</code>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
