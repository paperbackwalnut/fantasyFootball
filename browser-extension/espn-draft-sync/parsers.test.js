import test from "node:test";
import assert from "node:assert/strict";
import { findDraftSnapshots, parseEspnText, parseJsonPayload } from "./parsers.js";

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
