// src/lib/utils/draftUtils.ts - Utility functions for draft calculations
export interface DraftSettings {
	teamCount: number;
	roundCount: number;
	draftType: 'snake' | 'linear';
}

export function calculatePickNumber(
	round: number,
	position: number,
	settings: DraftSettings
): number {
	if (settings.draftType === 'snake') {
		const isEvenRound = round % 2 === 0;
		const actualPosition = isEvenRound ? settings.teamCount - position + 1 : position;
		return (round - 1) * settings.teamCount + actualPosition;
	}

	return (round - 1) * settings.teamCount + position;
}

export function getNextPickInfo(currentPicks: number, settings: DraftSettings) {
	const nextPick = currentPicks + 1;
	const round = Math.ceil(nextPick / settings.teamCount);
	const pickInRound = ((nextPick - 1) % settings.teamCount) + 1;

	return {
		pickNumber: nextPick,
		round,
		pickInRound,
		isSnakeBack: settings.draftType === 'snake' && round % 2 === 0
	};
}

export function calculateDraftProgress(currentPicks: number, settings: DraftSettings): number {
	const totalPicks = settings.teamCount * settings.roundCount;
	return Math.round((currentPicks / totalPicks) * 100);
}

export function getPositionColor(position: string): string {
	const colors: Record<string, string> = {
		QB: 'bg-red-500 text-white',
		RB: 'bg-blue-500 text-white',
		WR: 'bg-green-500 text-white',
		TE: 'bg-yellow-500 text-white',
		K: 'bg-purple-500 text-white',
		DST: 'bg-gray-500 text-white',
		FLEX: 'bg-indigo-500 text-white'
	};
	return colors[position] || 'bg-gray-400 text-white';
}

export function formatTimeAgo(timestamp: string): string {
	const now = new Date();
	const time = new Date(timestamp);
	const diffMs = now.getTime() - time.getTime();
	const diffMins = Math.floor(diffMs / 60000);

	if (diffMins < 1) return 'Just now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
	return `${Math.floor(diffMins / 1440)}d ago`;
}

export function calculatePickValue(
	pickNumber: number,
	averagePositionPick: number | null
): {
	value: number;
	label: string;
	color: string;
} {
	if (!averagePositionPick) {
		return { value: 0, label: 'Unknown', color: 'text-gray-500' };
	}

	const value = averagePositionPick - pickNumber;

	if (value > 12) {
		return { value, label: 'Steal', color: 'text-green-600 font-semibold' };
	} else if (value > 6) {
		return { value, label: 'Value', color: 'text-green-500' };
	} else if (value > -6) {
		return { value, label: 'Fair', color: 'text-gray-600' };
	} else if (value > -12) {
		return { value, label: 'Reach', color: 'text-red-500' };
	} else {
		return { value, label: 'Major Reach', color: 'text-red-600 font-semibold' };
	}
}
