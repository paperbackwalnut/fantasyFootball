import { compactEspnPlayerPool, parseEspnText, parseJsonPayload } from "./parsers.js";

const DEFAULT_SETTINGS = {
  endpoint: "http://127.0.0.1:5196/api/sync/espn/events",
  token: "",
  retainLimit: 2000
};

let attachedTabId = null;
let sequence = 0;
let flushTimer = null;
let lastContentHeartbeatAt = null;
let lastCommandPollAt = null;
let lastCommandPollError = null;
const pending = [];
const requestUrls = new Map();
const stateReady = chrome.storage.local.get(["attachedTabId"]).then((stored) => {
  attachedTabId = Number.isInteger(stored.attachedTabId) ? stored.attachedTabId : null;
});
const deliveryReady = stateReady.then(async () => {
  const stored = await chrome.storage.local.get(["pendingDelivery"]);
  if (Array.isArray(stored.pendingDelivery)) pending.push(...stored.pendingDelivery.slice(-1000));
  if (pending.length) scheduleFlush(1000);
});

const persistPending = () => chrome.storage.local.set({ pendingDelivery: pending.slice(-5000) });

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get("settings");
  if (!existing.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const actions = {
    CONNECT: () => connect(message.tabId),
    DISCONNECT: () => disconnect(),
    GET_STATUS: () => getStatus(),
    CONTENT_HEARTBEAT: async () => {
      lastContentHeartbeatAt = new Date().toISOString();
      await chrome.storage.local.set({ lastContentHeartbeatAt });
      return { ok: true };
    },
    FETCH_PLAYER_POOL: () => fetchPlayerPool(message.leagueId, message.seasonYear),
    SAVE_SETTINGS: () => saveSettings(message.settings),
    DOM_SNAPSHOT: async () => {
      const snapshot = message.snapshot ?? {};
      await record("dom_snapshot", { ...snapshot, url: sanitizeUrl(snapshot.url) });
      return { ok: true };
    },
    CHECK_DRAFT_COMMAND: () => checkDraftCommand(),
    REPORT_DRAFT_COMMAND: () => reportDraftCommand(message.result),
    CLEAR_CAPTURE: async () => {
      pending.splice(0, pending.length);
      await chrome.storage.local.set({ observations: [], observationCount: 0, pendingDelivery: [], delivery: null });
      return { ok: true };
    },
    FLUSH: async () => { await flush(); return getStatus(); }
  };
  if (!actions[message?.type]) return false;
  actions[message.type]().then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  void stateReady.then(() => {
    if (source.tabId === attachedTabId) return handleProtocolEvent(source, method, params);
  });
});

chrome.debugger.onDetach.addListener((source, reason) => {
  void stateReady.then(async () => {
    if (source.tabId !== attachedTabId) return;
    attachedTabId = null;
    await chrome.storage.local.set({ attachedTabId: null, detachReason: reason });
  });
});

async function connect(tabId) {
  await stateReady;
  if (!Number.isInteger(tabId)) return { ok: false, error: "No active tab" };
  const tab = await chrome.tabs.get(tabId);
  if (!/^https:\/\/fantasy\.espn\.com\//.test(tab.url ?? "")) {
    return { ok: false, error: "Open an ESPN fantasy draft tab first" };
  }
  if (attachedTabId && attachedTabId !== tabId) await disconnect();

  const targets = await chrome.debugger.getTargets();
  const alreadyAttached = targets.some((target) => target.tabId === tabId && target.attached);
  if (!alreadyAttached) {
    try {
      await chrome.debugger.attach({ tabId }, "1.3");
    } catch (error) {
      return { ok: false, error: `Could not attach: ${String(error)}` };
    }
  }

  attachedTabId = tabId;
  await chrome.storage.local.set({ attachedTabId: tabId, detachReason: null });
  await enableNetwork({ tabId });
  try {
    await chrome.debugger.sendCommand({ tabId }, "Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true
    });
  } catch (error) {
    await record("recorder_warning", { message: "Child-target attachment unavailable", error: String(error) });
  }
  await record("recorder_connected", { tabId, url: sanitizeUrl(tab.url) });
  return { ok: true, tabId, reloadRecommended: true };
}

async function enableNetwork(debuggee) {
  await chrome.debugger.sendCommand(debuggee, "Network.enable", {
    maxTotalBufferSize: 100000000,
    maxResourceBufferSize: 10000000,
    maxPostDataSize: 1000000
  });
}

async function disconnect() {
  await stateReady;
  if (attachedTabId == null) return { ok: true };
  const tabId = attachedTabId;
  await record("recorder_disconnecting", { tabId });
  await flush();
  try { await chrome.debugger.detach({ tabId }); } catch {}
  attachedTabId = null;
  requestUrls.clear();
  await chrome.storage.local.set({ attachedTabId: null });
  return { ok: true };
}

async function handleProtocolEvent(source, method, params) {
  const sessionId = source.sessionId ?? null;
  if (method === "Target.attachedToTarget") {
    try { await enableNetwork({ tabId: source.tabId, sessionId: params.sessionId }); }
    catch (error) { await record("recorder_warning", { message: "Could not capture child target", error: String(error) }); }
    return;
  }
  if (method === "Network.webSocketCreated") {
    requestUrls.set(requestKey(sessionId, params.requestId), params.url);
    if (isDraftSocketUrl(params.url)) {
      await record("websocket_created", { sessionId, requestId: params.requestId, url: sanitizeUrl(params.url) });
    }
    return;
  }
  if (method === "Network.webSocketFrameReceived" || method === "Network.webSocketFrameSent") {
    const rawPayload = params.response?.payloadData ?? "";
    const opcode = params.response?.opcode;
    const rawUrl = requestUrls.get(requestKey(sessionId, params.requestId)) ?? null;
    if (!isDraftSocketUrl(rawUrl) && !(rawUrl == null && isDraftProtocolPayload(rawPayload))) return;
    const payload = redactDraftPayload(rawPayload);
    await record(method.endsWith("Received") ? "websocket_received" : "websocket_sent", {
      sessionId,
      requestId: params.requestId,
      url: sanitizeUrl(rawUrl),
      opcode,
      encoding: opcode === 1 ? "utf8" : "base64",
      payload,
      parsed: opcode === 1 ? [parseEspnText(rawPayload), ...parseJsonPayload(rawPayload)].filter(Boolean) : []
    });
    return;
  }
  if (method === "Network.responseReceived") {
    const url = params.response?.url ?? "";
    requestUrls.set(requestKey(sessionId, params.requestId), url);
    if ((params.type === "XHR" || params.type === "Fetch") && isRelevantEspnUrl(url)) {
      await record("http_response", { sessionId, requestId: params.requestId, url: sanitizeUrl(url), status: params.response?.status, mimeType: params.response?.mimeType });
    }
    return;
  }
  if (method === "Network.loadingFinished") {
    const url = requestUrls.get(requestKey(sessionId, params.requestId)) ?? "";
    if (!isRelevantEspnUrl(url)) return;
    try {
      const debuggee = sessionId ? { tabId: source.tabId, sessionId } : { tabId: source.tabId };
      const body = await chrome.debugger.sendCommand(debuggee, "Network.getResponseBody", { requestId: params.requestId });
      const safeBody = body.base64Encoded ? null : sanitizeJsonBody(body.body);
      await record("http_body", {
        sessionId, requestId: params.requestId, url: sanitizeUrl(url),
        encoding: body.base64Encoded ? "omitted-base64" : "utf8",
        body: safeBody,
        parsed: body.base64Encoded ? [] : parseJsonPayload(body.body)
      });
    } catch (error) {
      await record("http_body_unavailable", { sessionId, requestId: params.requestId, url: sanitizeUrl(url), error: String(error) });
    }
  }
}

const requestKey = (sessionId, requestId) => `${sessionId ?? "root"}:${requestId}`;
const isRelevantEspnUrl = (url) => /lm-api-reads\.fantasy\.espn\.com\/apis\/v3\/games\/ffl/i.test(url ?? "");

const isDraftSocketUrl = (url) => /\/\/fantasydraft\.espn\.com\//i.test(url ?? "");

function isDraftProtocolPayload(payload) {
  return /^(?:STATE|SELECTING|SELECTED|AUTOSUGGEST|INIT|TOKEN|CLOCK|DRAFT_LIST|AUTODRAFT|PING|PONG|SELECT)(?:\s|$)/.test(payload ?? "");
}

function redactDraftPayload(payload) {
  if (typeof payload !== "string") return payload;
  if (payload.startsWith("TOKEN ")) return "TOKEN <redacted>";
  if (payload.startsWith("SELECTED ")) {
    const parts = payload.trim().split(/\s+/);
    return parts.length > 4 ? `${parts.slice(0, 4).join(" ")} <member-redacted>` : payload;
  }
  return payload;
}

function sanitizeUrl(value) {
  if (!value) return value ?? null;
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|auth|cookie|member|swid|espn_s2/i.test(key) || key === "4" || key === "5") {
        url.searchParams.set(key, "<redacted>");
      }
    }
    return url.toString();
  } catch {
    return String(value).replace(/(?:token|authorization)=([^&\s]+)/gi, "$1=<redacted>");
  }
}

function sanitizeJsonBody(body) {
  try {
    const visit = (value, key = "") => {
      if (/token|authorization|cookie|memberId|swid|espn_s2/i.test(key)) return "<redacted>";
      if (Array.isArray(value)) return value.map((item) => visit(item));
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, visit(child, childKey)]));
      }
      if (typeof value === "string" && /eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}/.test(value)) return "<redacted-jwt>";
      return value;
    };
    return JSON.stringify(visit(JSON.parse(body)));
  } catch {
    return null;
  }
}
async function record(type, data) {
  const observation = { schemaVersion: 1, id: `${Date.now()}-${++sequence}`, capturedAt: new Date().toISOString(), type, data };
  pending.push(observation);
  await persistPending();
  const stored = await chrome.storage.local.get(["observations", "settings"]);
  const limit = Number(stored.settings?.retainLimit ?? DEFAULT_SETTINGS.retainLimit);
  const observations = [...(stored.observations ?? []), observation].slice(-Math.max(100, limit));
  await chrome.storage.local.set({ observations, observationCount: observations.length, lastObservationAt: observation.capturedAt });
  scheduleFlush();
}

function scheduleFlush(delay = 250) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, delay);
}

async function flush() {
  await deliveryReady;
  if (!pending.length) return;
  const batch = pending.splice(0, 500);
  const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
  if (!settings.endpoint || !settings.token) {
    pending.unshift(...batch);
    await setDelivery(false, "Configure the local endpoint and pairing token");
    return;
  }
  try {
    const response = await fetch(settings.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-espn-sync-token": settings.token },
      body: JSON.stringify({ observations: batch })
    });
    if (!response.ok) throw new Error(`Local receiver returned ${response.status}`);
    await persistPending();
    await chrome.storage.local.set({ delivery: { ok: true, count: batch.length, at: new Date().toISOString() } });
    if (pending.length) scheduleFlush(500);
  } catch (error) {
    pending.unshift(...batch);
    if (pending.length > 5000) pending.splice(0, pending.length - 5000);
    await persistPending();
    await setDelivery(false, String(error));
  }
}

async function checkDraftCommand() {
  const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get('settings');
  if (!settings.endpoint || !settings.token) return { command: null };
  lastCommandPollAt = new Date().toISOString();
  try {
    const response = await fetch(commandEndpoint(settings.endpoint), {
      headers: { 'x-espn-sync-token': settings.token },
      signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) throw new Error(`Local command receiver returned ${response.status}`);
    lastCommandPollError = null;
    await chrome.storage.local.set({ lastCommandPollAt, lastCommandPollError });
    return response.json();
  } catch (error) {
    lastCommandPollError = String(error);
    await chrome.storage.local.set({ lastCommandPollAt, lastCommandPollError });
    return { command: null, error: lastCommandPollError };
  }
}

async function reportDraftCommand(result) {
  const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get('settings');
  if (!settings.endpoint || !settings.token || !result) return { ok: false };
  await fetch(commandEndpoint(settings.endpoint), { method: 'POST', headers: { 'content-type': 'application/json', 'x-espn-sync-token': settings.token }, body: JSON.stringify(result) });
  return { ok: true };
}

function commandEndpoint(endpoint) {
  return endpoint.replace(/\/events\/?(?:\?.*)?$/, '/commands');
}

async function setDelivery(ok, error) {
  await chrome.storage.local.set({ delivery: { ok, error, queued: pending.length, at: new Date().toISOString() } });
}

async function getStatus() {
  await stateReady;
  const stored = await chrome.storage.local.get(["settings", "observationCount", "delivery", "lastObservationAt", "detachReason", "lastContentHeartbeatAt", "lastCommandPollAt", "lastCommandPollError", "playerPoolSync"]);
  return {
    ok: true, attachedTabId,
    settings: { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) },
    observationCount: Number(stored.observationCount ?? 0),
    lastObservationAt: stored.lastObservationAt ?? null,
    delivery: stored.delivery ?? null,
    detachReason: stored.detachReason ?? null,
    lastContentHeartbeatAt: stored.lastContentHeartbeatAt ?? lastContentHeartbeatAt,
    lastCommandPollAt: stored.lastCommandPollAt ?? lastCommandPollAt,
    lastCommandPollError: stored.lastCommandPollError ?? lastCommandPollError,
    playerPoolSync: stored.playerPoolSync ?? null
  };
}

async function fetchPlayerPool(leagueId, seasonYear) {
  const league = String(leagueId ?? '').replace(/\D/g, '');
  const season = Number(seasonYear);
  if (!league || !Number.isInteger(season)) return { ok: false, error: 'Missing ESPN league or season' };
  const key = `${league}:${season}`;
  const stored = await chrome.storage.local.get('playerPoolSync');
  const previous = stored.playerPoolSync;
  if (previous?.key === key && previous?.ok && Date.now() - Date.parse(previous.at) < 10 * 60 * 1000) return previous;
  const filter = JSON.stringify({ players: { filterStatsForContainerIds: { value: [`00${season - 1}`, `10${season}`] } } });
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${league}`);
  url.searchParams.set('filter', filter);
  url.searchParams.append('view', 'draftInit');
  url.searchParams.append('view', 'mSettings');
  try {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(`ESPN player pool returned ${response.status}`);
    const players = compactEspnPlayerPool(await response.json(), season);
    if (players.length < 100) throw new Error(`ESPN player pool contained only ${players.length} players`);
    await record('espn_player_pool', { leagueId: league, seasonYear: season, players });
    const result = { ok: true, key, at: new Date().toISOString(), playerCount: players.length, error: null };
    await chrome.storage.local.set({ playerPoolSync: result });
    return result;
  } catch (error) {
    const result = { ok: false, key, at: new Date().toISOString(), playerCount: 0, error: String(error) };
    await chrome.storage.local.set({ playerPoolSync: result });
    return result;
  }
}

async function saveSettings(settings) {
  const clean = {
    endpoint: String(settings.endpoint ?? DEFAULT_SETTINGS.endpoint).trim(),
    token: String(settings.token ?? "").trim(),
    retainLimit: Math.min(10000, Math.max(100, Number(settings.retainLimit ?? 2000)))
  };
  await chrome.storage.local.set({ settings: clean });
  scheduleFlush(0);
  return { ok: true, settings: clean };
}
