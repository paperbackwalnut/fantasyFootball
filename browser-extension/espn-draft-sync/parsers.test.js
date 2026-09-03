import test from "node:test";
import assert from "node:assert/strict";
import { compactEspnPlayerPool, findDraftSnapshots, parseEspnText, parseJsonPayload } from "./parsers.js";

test("parses selected messages as non-authoritative hints", () => {
  assert.deepEqual(parseEspnText("SELECTED 7 12345 2"), { kind: "pick_hint", command: "SELECTED", teamId: "7", playerId: "12345", slotId: "2" });
});
test("recognizes overallPickNumber", () => {
  assert.deepEqual(findDraftSnapshots({ draftDetail: { picks: [{ playerId: 10, teamId: 2, overallPickNumber: 17, roundId: 2, roundPickNumber: 5 }] } })[0].picks[0], { playerId: "10", teamId: "2", pickNumber: 17, roundId: 2, roundPickNumber: 5 });
});
test("finds snapshots inside array responses", () => {
  const parsed = parseJsonPayload(JSON.stringify([{ draftDetail: { picks: [{ playerId: "99", teamId: 1 }] } }]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].rawPickCount, 1);
});
test("does not manufacture a snapshot from teams-only data", () => assert.deepEqual(findDraftSnapshots({ teams: [{ id: 1 }] }), []));
test("compacts ESPN draftInit player intelligence", () => {
  const players = compactEspnPlayerPool({ players: [{ player: {
    id: 4047365, fullName: 'Josh Jacobs', defaultPositionId: 2, proTeamId: 9, active: true,
    injured: true, injuryStatus: 'QUESTIONABLE', lastNewsDate: 1786735677000,
    ownership: { averageDraftPosition: 32.58 }, draftRanksByRankType: { PPR: { rank: 30 } },
    stats: [{ externalId: '2026', statSourceId: 1, appliedTotal: 259.158 }]
  } }] }, 2026);
  assert.deepEqual(players[0], {
    espnPlayerId: '4047365', name: 'Josh Jacobs', positionId: 2, proTeamId: 9, active: true,
    injured: true, injuryStatus: 'QUESTIONABLE', lastNewsAt: '2026-08-14T19:27:57.000Z',
    rank: 30, adp: 32.58, projectedPoints: 259.158
  });
});
