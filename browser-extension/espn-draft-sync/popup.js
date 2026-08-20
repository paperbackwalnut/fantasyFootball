const ids = ["build", "status", "connect", "disconnect", "endpoint", "token", "retainLimit", "save", "flush", "export", "clear", "details"];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const send = (type, extra = {}) => Promise.race([
  chrome.runtime.sendMessage({ type, ...extra }),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Extension background process did not respond')), 5000))
]);

async function refresh() {
  elements.build.textContent = `Build ${chrome.runtime.getManifest().version} · recommendation audit`;
  const status = await send("GET_STATUS");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isEspnDraft = /^https:\/\/fantasy\.espn\.com\/football\/(?:draft|mockdraft)/i.test(tab?.url ?? "");
  elements.endpoint.value = status.settings.endpoint;
  elements.token.value = status.settings.token;
  elements.retainLimit.value = status.settings.retainLimit;
  const attached = Number.isInteger(status.attachedTabId);
  if (isEspnDraft) {
    elements.status.textContent = attached
      ? "Automatic draft sync active. Network diagnostics also enabled."
      : "Automatic draft sync active.";
  } else {
    elements.status.textContent = "Open an ESPN draft or mock draft to start syncing automatically.";
  }
  elements.status.className = `status ${isEspnDraft ? "connected" : ""}`;
  elements.connect.disabled = attached;
  elements.disconnect.disabled = !attached;
  const heartbeatFresh = status.lastContentHeartbeatAt && Date.now() - new Date(status.lastContentHeartbeatAt).getTime() < 8000;
  if (isEspnDraft && !heartbeatFresh) {
    elements.status.textContent = "ESPN tab found, but its draft listener is not running. Refresh the ESPN tab once.";
    elements.status.className = "status error";
  }
  elements.details.textContent = JSON.stringify({ automaticSync: isEspnDraft, pageListener: heartbeatFresh ? 'online' : 'offline', networkDiagnostics: attached, observations: status.observationCount, lastObservationAt: status.lastObservationAt, commandPollAt: status.lastCommandPollAt, commandPollError: status.lastCommandPollError, delivery: status.delivery, detachReason: status.detachReason }, null, 2);
}

elements.connect.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const result = await send("CONNECT", { tabId: tab?.id });
  if (!result.ok) {
    elements.status.textContent = result.error;
    elements.status.className = "status error";
  } else await refresh();
});
elements.disconnect.addEventListener("click", async () => { await send("DISCONNECT"); await refresh(); });
elements.save.addEventListener("click", async () => {
  await send("SAVE_SETTINGS", { settings: { endpoint: elements.endpoint.value, token: elements.token.value, retainLimit: Number(elements.retainLimit.value) } });
  await send("FLUSH");
  await refresh();
});
elements.flush.addEventListener("click", async () => {
  elements.flush.disabled = true;
  elements.status.textContent = "Sending queued observations…";
  await send("FLUSH");
  await refresh();
  elements.flush.disabled = false;
});
elements.clear.addEventListener("click", async () => { await send("CLEAR_CAPTURE"); await refresh(); });
elements.export.addEventListener("click", async () => {
  const { observations = [] } = await chrome.storage.local.get("observations");
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), observations }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `espn-draft-capture-${Date.now()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

try {
  await refresh();
} catch (error) {
  elements.status.textContent = String(error?.message ?? error);
  elements.status.className = "status error";
  elements.details.textContent = "Open chrome://extensions, find ESPN Draft Sync Recorder, and check Errors if this persists.";
}
