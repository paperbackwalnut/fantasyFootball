export interface ESPNPickMessage {
	type: 'ESPN_PICK';
	data: {
		siteTeamId: string;
		sitePlayerId: string;
		slotId: string;
	};
}

export interface ESPNSoldMessage {
	type: 'ESPN_SOLD';
	data: {
		siteTeamId: string;
		sitePlayerId: string;
		slotId: string;
		amount: string;
	};
}

export interface ESPNInitMessage {
	type: 'ESPN_INIT';
	data: string;
}

export type ESPNMessage = ESPNPickMessage | ESPNSoldMessage | ESPNInitMessage;

let currentLeagueId: string | null = null;
let onPickCallback: ((pick: ESPNPickMessage) => void) | null = null;
let onSoldCallback: ((sold: ESPNSoldMessage) => void) | null = null;

export function startListening(leagueId: string) {
	currentLeagueId = leagueId;

	// Remove existing listener if any
	window.removeEventListener('message', handleMessage);

	// Add new listener
	window.addEventListener('message', handleMessage);

	console.log('[DraftSync] Started listening for league:', leagueId);
}

export function stopListening() {
	window.removeEventListener('message', handleMessage);
	currentLeagueId = null;
	onPickCallback = null;
	onSoldCallback = null;

	console.log('[DraftSync] Stopped listening');
}

export function onPick(callback: (pick: ESPNPickMessage) => void) {
	onPickCallback = callback;
}

export function onSold(callback: (sold: ESPNSoldMessage) => void) {
	onSoldCallback = callback;
}

async function handleMessage(event: MessageEvent) {
	// Only process messages from our extension
	if (!event.data?.type?.startsWith('ESPN_')) return;
	if (!currentLeagueId) return;

	console.log('[DraftSync] Received:', event.data);

	switch (event.data.type) {
		case 'ESPN_PICK':
			await handlePick(event.data);
			break;
		case 'ESPN_SOLD':
			await handleSold(event.data);
			break;
		case 'ESPN_INIT':
			handleInit(event.data);
			break;
	}
}

async function handlePick(message: ESPNPickMessage) {
	console.log('[DraftSync] Pick detected:', message.data);

	try {
		const response = await fetch('/api/espn/extension/picks', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				leagueId: currentLeagueId,
				teamId: message.data.siteTeamId,
				playerId: message.data.sitePlayerId,
				slotId: message.data.slotId,
				type: 'PICK'
			})
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const result = await response.json();
		console.log('[DraftSync] Pick processed:', result);

		// Call callback if set
		onPickCallback?.(message);
	} catch (error) {
		console.error('[DraftSync] Failed to send pick:', error);
	}
}

async function handleSold(message: ESPNSoldMessage) {
	console.log('[DraftSync] Sold detected:', message.data);

	try {
		const response = await fetch('/api/espn/extension/picks', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				leagueId: currentLeagueId,
				teamId: message.data.siteTeamId,
				playerId: message.data.sitePlayerId,
				slotId: message.data.slotId,
				amount: message.data.amount,
				type: 'SOLD'
			})
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const result = await response.json();
		console.log('[DraftSync] Sold processed:', result);

		// Call callback if set
		onSoldCallback?.(message);
	} catch (error) {
		console.error('[DraftSync] Failed to send sold:', error);
	}
}

function handleInit(message: ESPNInitMessage) {
	console.log('[DraftSync] Draft initialized:', message.data);
	// Could be used to trigger draft start or reset pick counter
}
