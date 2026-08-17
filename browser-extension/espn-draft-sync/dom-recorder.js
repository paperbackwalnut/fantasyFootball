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
  return {
    url: location.href,
    title: document.title,
    source: 'espn-pick-history',
    currentPick: Number(otc.match(/Pick\s+(\d+)/i)?.[1]) || null,
    onTheClock: otc,
    userIsOnTheClock: /you are on the clock/i.test(pickArea),
    completed: /draft is complete/i.test(pickArea)
      || /draft is complete/i.test(tidy(document.querySelector('h1.sharing__draft-complete'))),
    teams,
    historyPicks,
    activityPicks
  };
}

async function reconcile() {
  if (reconcileBusy) return;
  reconcileBusy = true;
  let originalTab = null;
  try {
    const active = document.querySelector('.tabs__list__item--active button');
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
    if ((snapshot.historyPicks.length || snapshot.activityPicks.length)
        && (fingerprint !== reconcileFingerprint || heartbeatDue)) {
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
  const result = await executeDraftCommand(command);
  await chrome.runtime.sendMessage({ type: 'REPORT_DRAFT_COMMAND', result: { commandId: command.id, ...result } }).catch(() => {});
}

async function executeDraftCommand(command) {
  if (command.type !== 'draft-player') return { ok: false, message: 'Unsupported command' };
  if (!/you are on the clock/i.test(tidy(document.querySelector('.pickArea h3')))) return { ok: false, message: 'ESPN does not show you on the clock' };
  const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let names = [...document.querySelectorAll('.playerinfo__playername, .player-column__athlete')];
  let matches = names.filter((element) => normalize(tidy(element)) === normalize(command.playerName));
	if (!matches.length) {
		const search = [...document.querySelectorAll('input')].find((input) => /search/i.test(input.placeholder ?? '') || /search/i.test(input.getAttribute('aria-label') ?? ''));
		if (search) {
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(search, command.playerName);
			search.dispatchEvent(new Event('input', { bubbles: true }));
			search.dispatchEvent(new Event('change', { bubbles: true }));
			await new Promise((resolve) => setTimeout(resolve, 500));
			names = [...document.querySelectorAll('.playerinfo__playername, .player-column__athlete')];
			matches = names.filter((element) => normalize(tidy(element)) === normalize(command.playerName));
		}
	}
  if (command.playerId) {
    const byId = names.filter((element) => espnPlayerId(element.closest('[data-player-id], [data-playerid], [data-athlete-id], tr, [role="row"]') ?? element) === String(command.playerId));
    if (byId.length === 1) matches = byId;
  }
  if (matches.length !== 1) return { ok: false, message: matches.length ? 'Player row was ambiguous' : 'Player is not visible in ESPN; search or filter the player list first' };
  const row = matches[0].closest('[data-player-id], [data-playerid], [data-athlete-id], .player-row, tr, [role="row"], .Table2__tr') ?? matches[0];
  row.scrollIntoView({ block: 'center' });
  row.click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const buttons = [...document.querySelectorAll('button')].filter((button) => !button.disabled && /^(draft|draft player)$/i.test(tidy(button)));
  if (buttons.length !== 1) return { ok: false, message: buttons.length ? 'ESPN Draft button was ambiguous' : 'ESPN Draft button was not found after selecting the player' };
  buttons[0].click();
  return { ok: true, message: `Draft click sent for ${command.playerName}` };
}

setInterval(() => void checkDraftCommand(), 1000);
