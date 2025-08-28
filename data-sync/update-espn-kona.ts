// data-sync/update-espn-merge.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ------------ types (minimal) ------------
type CoreAthlete = {
	id: number;
	displayName?: string;
	firstName?: string;
	lastName?: string;
	active?: boolean;
	team?: { abbreviation?: string; displayName?: string };
	jersey?: string;
	age?: number;
	college?: { name?: string };
};

type Height = { feet?: number; inches?: number };
type Injury = { status?: string; gameStatus?: string; longComment?: string; detail?: string };
type Ownership = {
	auctionValueAverage?: number;
	auctionValueAverageChange?: number;
	averageDraftPosition?: number;
	averageDraftPositionPercentChange?: number;
	percentOwned?: number;
	percentStarted?: number;
	percentChange?: number;
	date?: number;
};
type SeasonOutlook = { outlookText?: string; blurb?: string } | null;

type Kona = {
	id: number;
	fullName?: string;
	firstName?: string;
	lastName?: string;
	defaultPositionId?: number;
	proTeamId?: number;
	status?: string;
	injuryStatus?: string;
	injuries?: Injury[];
	jersey?: number;
	age?: number;
	height?: Height;
	weight?: number;
	college?: string;
	byeWeek?: number;
	depthChartOrder?: number;
	depthChartPositionId?: number;
	ownership?: Ownership;
	seasonOutlook?: SeasonOutlook;
	active?: boolean;
};

// ------------ consts ------------
const POS: Record<number, string> = {
	1: 'QB',
	2: 'RB',
	3: 'WR',
	4: 'TE',
	5: 'K',
	16: 'D/ST',
	17: 'HC'
};

const H = {
	'User-Agent':
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127 Safari/537.36',
	Accept: 'application/json, text/plain, */*',
	'Accept-Language': 'en-US,en;q=0.9',
	Referer: 'https://fantasy.espn.com/',
	Origin: 'https://fantasy.espn.com'
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toInches = (h?: Height) => (h?.feet ?? 0) * 12 + (h?.inches ?? 0);
const fromEpochMs = (ms?: number) => (ms ? new Date(ms).toISOString() : null);

// ------------ core seed ------------
async function fetchCoreActive(): Promise<CoreAthlete[]> {
	const url =
		'https://sports.core.api.espn.com/v3/sports/football/nfl/athletes' +
		'?limit=20000&active=true&region=us&lang=en&enable=team';
	const res = await fetch(url, { headers: { 'User-Agent': H['User-Agent'] } });
	if (!res.ok) throw new Error(`core HTTP ${res.status}`);
	const json = await res.json();
	const items = Array.isArray(json?.items) ? (json.items as CoreAthlete[]) : [];
	return items;
}
// async function upsertCore(rows: CoreAthlete[]) {
// 	const mapped = rows.map((a) => ({
// 		espn_player_id: String(a.id),
// 		espn_id: String(a.id),
// 		espn_name: a.displayName ?? null,
// 		name: a.displayName ?? null,
// 		first_name: a.firstName ?? null,
// 		last_name: a.lastName ?? null,
// 		team_abbr: a.team?.abbreviation ?? null, // team (full) is generated server-side
// 		jersey: a.jersey ? Number(a.jersey) : null,
// 		age: a.age ?? null,
// 		college: a.college?.name ?? null,
// 		active: a.active ?? null,
// 		updated_at: new Date().toISOString()
// 	}));
// 	for (let i = 0; i < mapped.length; i += 500) {
// 		const { error } = await supabase.from('players').upsert(mapped.slice(i, i + 500), {
// 			onConflict: 'espn_player_id'
// 		});
// 		if (error) throw error;
// 		console.log(`Core upsert: ${Math.min(i + 500, mapped.length)}/${mapped.length}`);
// 	}
// }

// ------------ fantasy enrich (per-ID, throttled) ------------
async function fetchFantasy(id: number, attempt = 1): Promise<Kona | null> {
	const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2025/players/${id}?scoringPeriodId=0&view=kona_player_info`;
	const res = await fetch(url, { headers: H });
	if (res.status === 404) return null;
	if (res.status === 403 || res.status === 429 || res.status >= 500) {
		if (attempt <= 6) {
			const delay = Math.min(20000, 600 * 2 ** attempt) + Math.floor(Math.random() * 500);
			await sleep(delay);
			return fetchFantasy(id, attempt + 1);
		}
		console.warn(`fantasy ${id} failed ${res.status}`);
		return null;
	}
	if (!res.ok) {
		console.warn(`fantasy ${id} HTTP ${res.status}`);
		return null;
	}
	return (await res.json()) as Kona;
}

function mapFantasy(p: Kona) {
	const o = p.ownership ?? {};
	const inj = p.injuries?.[0];
	return {
		espn_player_id: String(p.id),
		espn_id: String(p.id),
		espn_name: p.fullName ?? null,
		name: p.fullName ?? null,
		first_name: p.firstName ?? null,
		last_name: p.lastName ?? null,

		default_position_id: p.defaultPositionId ?? null,
		position: p.defaultPositionId ? (POS[p.defaultPositionId] ?? null) : null,
		pro_team_id: p.proTeamId ?? null,

		status: p.status ?? null,
		injury_status: p.injuryStatus ?? inj?.status ?? null,
		injury_game_status: inj?.gameStatus ?? null,
		injury_status_message: inj?.longComment ?? inj?.detail ?? null,

		jersey: p.jersey ?? null,
		age: p.age ?? null,
		height: toInches(p.height) || null,
		weight: p.weight ?? null,
		college: p.college ?? null,
		bye_week: p.byeWeek ?? null,

		depth_chart_order: p.depthChartOrder ?? null,
		depth_chart_position_id: p.depthChartPositionId ?? null,

		espn_adp: o.averageDraftPosition ?? null,
		espn_adp_pct_change: o.averageDraftPositionPercentChange ?? null,
		espn_auction_value_avg: o.auctionValueAverage ?? null,
		espn_auction_value_change: o.auctionValueAverageChange ?? null,
		espn_percent_owned: o.percentOwned ?? null,
		espn_percent_started: o.percentStarted ?? null,
		espn_percent_change: o.percentChange ?? null,
		espn_ownership_date: fromEpochMs(o.date),

		active: p.active ?? null,
		updated_at: new Date().toISOString()
	};
}

async function enrichFantasy(ids: number[], concurrency = 8) {
	let idx = 0;
	const buffer: unknown[] = [];
	async function flush() {
		if (!buffer.length) return;
		const slice = buffer.splice(0, buffer.length);
		const { error } = await supabase
			.from('players')
			.upsert(slice, { onConflict: 'espn_player_id' });
		if (error) throw error;
		console.log(`Enrich upserted ${slice.length} rows (running total grows in DB)`);
	}
	async function worker() {
		while (true) {
			const i = idx++;
			if (i >= ids.length) break;
			const id = ids[i];
			const p = await fetchFantasy(id);
			if (p) {
				buffer.push(mapFantasy(p));
				if (buffer.length >= 300) await flush();
			}
			await sleep(120 + Math.floor(Math.random() * 200)); // jitter
		}
	}
	await Promise.all(Array.from({ length: concurrency }, worker));
	await flush();
}

// ------------ main ------------
async function main() {
	console.log('Fetching core active…');
	const coreAll = await fetchCoreActive();
	const ids = coreAll.map((a) => a.id).filter(Boolean);
	console.log(`Enriching fantasy for ${ids.length} players (concurrency 8)…`);
	await enrichFantasy(ids, 8);
	console.log('Done.');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
