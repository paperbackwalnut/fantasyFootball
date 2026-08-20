const selectors = [
  '[data-player-id]',
  '[data-playerid]',
  '[data-athlete-id]',
  '[data-testid*="pick" i]',
  '[class*="draftPick" i]',
  '[class*="draft-pick" i]'
];

let lastFingerprint = '';
let timer = null;

function collectDraftBoard() {
  const candidates = [];
  const seen = new Set();
  for (const element of document.querySelectorAll(selectors.join(','))) {
    const item = {
      tag: element.tagName,
      playerId: element.getAttribute('data-player-id') ?? element.getAttribute('data-playerid') ?? element.getAttribute('data-athlete-id'),
      testId: element.getAttribute('data-testid'),
      className: typeof element.className === 'string' ? element.className.slice(0, 300) : null,
      text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
    };
    const key = JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(item);
    }
    if (candidates.length >= 500) break;
  }

  const fingerprint = JSON.stringify(candidates);
  if (!candidates.length || fingerprint === lastFingerprint) return;
  lastFingerprint = fingerprint;
  chrome.runtime.sendMessage({
    type: 'DOM_SNAPSHOT',
    snapshot: {
      url: location.href,
      title: document.title,
      candidateCount: candidates.length,
      candidates
    }
  }).catch(() => {});
}

function scheduleCollection() {
  clearTimeout(timer);
  timer = setTimeout(collectDraftBoard, 250);
}

new MutationObserver(scheduleCollection).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-player-id', 'data-playerid', 'data-athlete-id', 'data-testid', 'class']
});

scheduleCollection();
setInterval(collectDraftBoard, 5000);

// Full-state reconciliation is authoritative; the generic observations above remain
// useful diagnostics while ESPN changes its markup.
const historyTabNames = new Set(['Pick History', 'Auction Summary', 'Draft Summary']);
let reconcileBusy = false;
let reconcileFingerprint = '';
let reconcileTimer = null;
let lastReconcileSentAt = 0;
let lastObservedAvailablePlayers = [];

function sendContentHeartbeat() {
  void chrome.runtime.sendMessage({ type: 'CONTENT_HEARTBEAT', url: location.href }).catch(() => {});
}

sendContentHeartbeat();
setInterval(sendContentHeartbeat, 3000);

const tidy = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);

function espnPlayerId(el) {
  const direct = el?.getAttribute('data-player-id')
    ?? el?.getAttribute('data-playerid')
    ?? el?.getAttribute('data-athlete-id');
  if (direct) return direct;
  const src = el?.querySelector('img')?.getAttribute('src') ?? '';
  return src.match(/\/(\d+)\.(?:png|jpg)(?:\?|$)/i)?.[1] ?? null;
}

function player(el) {
  return {
    espnPlayerId: espnPlayerId(el),
    name: tidy(el?.querySelector('.playerinfo__playername, .player-column__athlete')),
    detail: tidy(el)
  };
}

function captureVisibleAvailablePlayers() {
  const found = new Map();
  for (const nameElement of document.querySelectorAll('.playerinfo__playername, .player-column__athlete')) {
    if (nameElement.closest('.pick-history-tables, .pick-message__container, .draft-column .roster')) continue;
    const row = findPlayerRow(nameElement);
    if (/\bundo\b/i.test(tidy(row)) || row.querySelector('.player-details')) continue;
    const cells = [...row.querySelectorAll('td, [role="cell"], .Table2__td')].map((cell) => tidy(cell));
    const table = row.closest('table, [role="table"], .Table2');
    const headers = [...(table?.querySelectorAll('th, [role="columnheader"], .Table2__th') ?? [])].map((cell) => tidy(cell).toUpperCase());
    const valueFor = (...labels) => {
      const index = headers.findIndex((header) => labels.some((label) => header === label || header.startsWith(`${label} `)));
      return index >= 0 ? cells[index] : null;
    };
    const numeric = (value) => {
      const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : null;
    };
    const item = {
      espnPlayerId: espnPlayerId(row), name: tidy(nameElement), detail: tidy(row),
      displayedRank: numeric(valueFor('RK', 'RANK') ?? cells[0]),
	  projectedPoints: numeric(valueFor('FPTS', 'PROJ', 'PROJECTED')),
	  captureColumns: cells.slice(0, 24)
    };
    if (item.name) found.set(item.espnPlayerId ? `id:${item.espnPlayerId}` : `name:${item.name.toLowerCase()}`, item);
  }
  if (found.size) lastObservedAvailablePlayers = [...found.values()];
}

function findPlayerRow(nameElement) {
  let current = nameElement;
  for (let depth = 0; current && depth < 8; depth++, current = current.parentElement) {
    const columns = current.querySelectorAll(':scope > td, :scope > [role="cell"], :scope > .Table2__td, :scope > div');
    if (columns.length >= 4 && tidy(current).includes(tidy(nameElement))) return current;
  }
  return nameElement.closest('[data-player-id], [data-playerid], [data-athlete-id], .player-row, tr, [role="row"], .Table2__tr') ?? nameElement;
}

function fullDraftState() {
  const historyPicks = [];
  document.querySelectorAll('.pick-history-tables .player-details').forEach((details) => {
    const playerCell = details.closest('.public_fixedDataTableCell_main');
    const pickCell = playerCell?.previousElementSibling;
    const teamCell = playerCell?.nextElementSibling;
    historyPicks.push({
      pick: tidy(pickCell?.querySelector('.public_fixedDataTableCell_cellContent')),
      team: tidy(teamCell?.querySelector('.fw-bold'))
        || tidy(teamCell?.querySelector('.public_fixedDataTableCell_cellContent')),
      ...player(details)
    });
  });

  const activityPicks = [...document.querySelectorAll('.pick-message__container')]
    .map((container) => ({
      ...player(container),
      team: tidy(container.querySelector('.pick-info span')).replace(/^\s*-\s*/, ''),
      pickInfo: tidy(container.querySelector('.pick-info'))
    }))
    .filter((pick) => pick.name || pick.espnPlayerId);

  const teamSelect = document.querySelector('.draft-column .roster .dropdown__select');
  const teams = [...(teamSelect?.options ?? [])].map((option) => ({
    id: option.value || null,
    name: tidy(option)
  }));
  const otc = tidy(document.querySelector('.current-pick-module-container .on-the-clock'));
  const pickArea = tidy(document.querySelector('.pickArea h3'));
  const pickAreaText = tidy(document.querySelector('.pickArea'));
  const openingText = (document.body?.innerText ?? '').slice(0, 4000);
  const roomLabel = openingText.split(/\r?\n/).map((line) => line.trim()).find((line) => /(?:practice|mock)?\s*draft\s+for/i.test(line)) ?? null;
  const draftKind = /practice draft|mock draft/i.test(`${roomLabel ?? ''} ${openingText.slice(0, 800)} ${location.pathname}`) ? 'MOCK' : roomLabel ? 'LEAGUE' : 'UNKNOWN';
  const draftSlotHint = Number(pickAreaText.match(/Your first pick:\s*Round\s*1,\s*Pick\s*(\d+)/i)?.[1]) || null;
  const preDraft = /draft is about to start/i.test(pickAreaText);
  return {
    url: location.href,
    title: document.title,
    source: 'espn-pick-history',
    currentPick: Number(otc.match(/Pick\s+(\d+)/i)?.[1]) || (preDraft ? 1 : null),
    draftSlotHint,
    preDraft,
    draftKind,
    roomLabel,
    onTheClock: otc,
    userIsOnTheClock: /you(?: are|'re|’re) on the clock/i.test(pickArea),
    completed: /draft is complete/i.test(pickArea)
      || /draft is complete/i.test(tidy(document.querySelector('h1.sharing__draft-complete'))),
    teams,
    historyPicks,
    espnObservedAvailable: lastObservedAvailablePlayers,
    activityPicks
  };
}

async function reconcile() {
  if (reconcileBusy) return;
  reconcileBusy = true;
  let originalTab = null;
  try {
    const active = document.querySelector('.tabs__list__item--active button');
    if (tidy(active) === 'Players') captureVisibleAvailablePlayers();
    if (!historyTabNames.has(tidy(active)) && !document.querySelector('.pick-history')) {
      const history = document.querySelector('.tabs__list__item:nth-child(2) button');
      if (history) {
        originalTab = active;
        history.click();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    const snapshot = fullDraftState();
    const fingerprint = JSON.stringify(snapshot);
	const heartbeatDue = Date.now() - lastReconcileSentAt >= 10000;
	if (fingerprint !== reconcileFingerprint || heartbeatDue) {
      reconcileFingerprint = fingerprint;
      await chrome.runtime.sendMessage({ type: 'DOM_SNAPSHOT', snapshot }).catch(() => {});
      lastReconcileSentAt = Date.now();
    }
  } finally {
    originalTab?.click();
    reconcileBusy = false;
  }
}

function scheduleReconcile(delay = 350) {
  clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => void reconcile(), delay);
}

new MutationObserver(() => scheduleReconcile()).observe(document.documentElement, {
  childList: true, characterData: true, subtree: true
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleReconcile(0);
});
window.addEventListener('online', () => scheduleReconcile(0));
window.addEventListener('pageshow', () => scheduleReconcile(0));
scheduleReconcile(1000);
setInterval(() => void reconcile(), 3000);

let lastDraftCommand = null;
async function checkDraftCommand() {
  const response = await chrome.runtime.sendMessage({ type: 'CHECK_DRAFT_COMMAND' }).catch(() => null);
  const command = response?.command;
  if (!command || command.id === lastDraftCommand) return;
  lastDraftCommand = command.id;
	showDraftToast(`Drafting ${command.playerName}…`, 'pending');
  const result = await executeDraftCommand(command);
	showDraftToast(result.message, result.ok ? 'success' : 'error');
  await chrome.runtime.sendMessage({ type: 'REPORT_DRAFT_COMMAND', result: { commandId: command.id, ...result } }).catch(() => {});
}

function showDraftToast(message, status) {
  let toast = document.getElementById('draftsync-command-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'draftsync-command-toast';
    Object.assign(toast.style, { position: 'fixed', right: '20px', bottom: '20px', zIndex: '2147483647', maxWidth: '380px', padding: '12px 16px', borderRadius: '10px', color: '#fff', font: '600 14px system-ui', boxShadow: '0 8px 30px rgba(0,0,0,.3)' });
    document.documentElement.appendChild(toast);
  }
  toast.textContent = `DraftSync: ${message}`;
  toast.style.background = status === 'success' ? '#15803d' : status === 'error' ? '#b91c1c' : '#3730a3';
  toast.style.display = 'block';
  clearTimeout(showDraftToast.timer);
  showDraftToast.timer = setTimeout(() => { toast.style.display = 'none'; }, status === 'pending' ? 6000 : 10000);
}

async function executeDraftCommand(command) {
  if (command.type !== 'draft-player') return { ok: false, message: 'Unsupported command' };
  const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let names = visibleDraftPlayerNames();
  let matches = matchCommandPlayers(names, command, normalize);
	if (!matches.length) {
		const search = [...document.querySelectorAll('input')].find((input) => /search/i.test(input.placeholder ?? '') || /search/i.test(input.getAttribute('aria-label') ?? ''));
		if (search) {
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(search, command.playerName);
			search.dispatchEvent(new Event('input', { bubbles: true }));
			search.dispatchEvent(new Event('change', { bubbles: true }));
			for (let attempt = 0; attempt < 8 && !matches.length; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 250));
				names = visibleDraftPlayerNames();
				matches = matchCommandPlayers(names, command, normalize);
			}
		}
	}
  if (command.playerId) {
    const byId = names.filter((element) => espnPlayerId(element.closest('[data-player-id], [data-playerid], [data-athlete-id], tr, [role="row"]') ?? element) === String(command.playerId));
    if (byId.length === 1) matches = byId;
  }
  if (matches.length !== 1) return { ok: false, message: matches.length ? 'Player row was ambiguous' : 'Player is not visible in ESPN; search or filter the player list first' };
  const row = matches[0].closest('[data-player-id], [data-playerid], [data-athlete-id], .player-row, tr, [role="row"], .Table2__tr') ?? matches[0];
  const beforePick = tidy(document.querySelector('[data-testid="current-pick"], .current-pick-module-container'));
  row.scrollIntoView({ block: 'center' });
  const rowAction = [...row.querySelectorAll('button')].find((button) => !button.disabled && (button.matches('.Button--draft') || /^(draft|draft player)$/i.test(tidy(button))));
  if (rowAction) {
    rowAction.click();
    return confirmDraftAccepted(command.playerName, beforePick);
  }
  row.click();
  await new Promise((resolve) => setTimeout(resolve, 400));
  const buttons = [...document.querySelectorAll('button')].filter((button) => !button.disabled && /^(draft|draft player)$/i.test(tidy(button)));
  if (buttons.length !== 1) return { ok: false, message: buttons.length ? 'ESPN Draft button was ambiguous' : 'ESPN Draft button was not found after selecting the player' };
  buttons[0].click();
  return confirmDraftAccepted(command.playerName, beforePick);
}

function visibleDraftPlayerNames() {
  return [...document.querySelectorAll('.playerinfo__playername, .player-column__athlete')].filter((element) => {
    const row = findPlayerRow(element);
    return !element.closest('.pick-history-tables, .pick-message__container, .draft-column .roster') && !/\bundo\b/i.test(tidy(row)) && !row.querySelector('.player-details');
  });
}

function matchCommandPlayers(names, command, normalize) {
  let matches = names.filter((element) => normalize(tidy(element)) === normalize(command.playerName));
  if (!matches.length && command.position === 'DST' && command.nflTeam) {
    matches = names.filter((element) => {
      const row = findPlayerRow(element);
      const detail = tidy(row).toUpperCase().replace(/[^A-Z0-9]/g, '');
      return detail.includes(String(command.nflTeam).toUpperCase()) && /(?:DST|DEF)/.test(detail);
    });
  }
  return matches;
}

async function confirmDraftAccepted(playerName, beforePick) {
  const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const currentPick = tidy(document.querySelector('[data-testid="current-pick"], .current-pick-module-container'));
	const recent = [...document.querySelectorAll('.pick-message__container')].slice(-6).some((element) => normalize(tidy(element)).includes(normalize(playerName)));
	const stillAvailable = visibleDraftPlayerNames().some((element) => normalize(tidy(element)) === normalize(playerName));
    if (recent || !stillAvailable || (beforePick && currentPick && currentPick !== beforePick)) return { ok: true, message: `ESPN confirmed ${playerName}` };
  }
  return { ok: false, message: `ESPN did not confirm ${playerName}; the click may not have registered` };
}

setInterval(() => void checkDraftCommand(), 1000);
void checkDraftCommand();
