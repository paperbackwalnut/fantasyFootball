const ESPN_COMMANDS = new Set(["CLOCK", "SELECTING", "SELECTED", "SOLD", "INIT", "AUTOSUGGEST", "AUTODRAFT", "PING", "PONG"]);

export function parseEspnText(payload) {
  if (typeof payload !== "string") return null;
  const parts = payload.trim().split(/\s+/);
  const command = parts[0];
  if (!ESPN_COMMANDS.has(command)) return null;
  switch (command) {
    case "SELECTED":
      return parts.length < 4 ? null : { kind: "pick_hint", command, teamId: parts[1], playerId: parts[2], slotId: parts[3] };
    case "SOLD":
      return parts.length < 5 ? null : { kind: "auction_pick_hint", command, teamId: parts[1], playerId: parts[2], slotId: parts[3], amount: Number(parts[4]) };
    case "CLOCK":
      return parts.length < 4 ? null : { kind: "clock", command, teamId: parts[1], millisecondsLeft: Number(parts[2]), pickNumber: Number(parts[3]) };
    case "SELECTING":
      return parts.length < 3 ? null : { kind: "selecting", command, teamId: parts[1], millisecondsLeft: Number(parts[2]) };
    case "AUTODRAFT":
      return { kind: "autodraft", command, teamId: parts[1], enabled: parts[2] === "true" };
    case "AUTOSUGGEST":
      return { kind: "autosuggest", command, playerId: parts[1] ?? null };
    case "INIT":
      return { kind: "init", command, encodedPayload: parts.slice(1).join(" ") };
    case "PING":
    case "PONG":
      return { kind: command.toLowerCase(), command, timestamp: Number(parts[1]) };
  }
}

const asArray = (value) => Array.isArray(value) ? value : value ? [value] : [];

export function findDraftSnapshots(value) {
  const snapshots = [];
  const seenPickArrays = new Set();
  const queue = asArray(value);
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const draft = current.draftDetail ?? current.draft ?? current.draftSummary;
    const picks = draft?.picks ?? current.picks;
    if (Array.isArray(picks) && !seenPickArrays.has(picks)) {
      seenPickArrays.add(picks);
      snapshots.push({ kind: "draft_snapshot", picks: picks.map(normalizeSnapshotPick).filter(Boolean), rawPickCount: picks.length });
    }
    for (const child of Object.values(current)) if (child && typeof child === "object") queue.push(...asArray(child));
  }
  return snapshots;
}

function normalizeSnapshotPick(pick, index) {
  if (!pick || typeof pick !== "object") return null;
  const playerId = pick.playerId ?? pick.sitePlayerId ?? pick.player?.id;
  if (playerId == null) return null;
  return {
    playerId: String(playerId),
    teamId: String(pick.fantasyTeamId ?? pick.teamId ?? ""),
    pickNumber: Number(pick.overallPickNumber ?? pick.overallSelectionNumber ?? pick.overallPick ?? pick.pickNumber ?? index + 1),
    roundId: pick.roundId == null ? null : Number(pick.roundId),
    roundPickNumber: pick.roundPickNumber == null ? null : Number(pick.roundPickNumber)
  };
}

export function parseJsonPayload(payload) {
  if (typeof payload !== "string") return [];
  try { return findDraftSnapshots(JSON.parse(payload)); } catch { return []; }
}
