import test from "node:test";
import assert from "node:assert/strict";
import { detectCurrentParty } from "../scripts/engine/party-analyzer.js";

function pc(id, level, extra = {}) {
  return { id, uuid: `Actor.${id}`, name: id, type: "character", level, ...extra };
}

test("party detection prefers the active PF2e Party actor", () => {
  const actors = {
    party: { name: "Heroes", members: [pc("a", 5), pc("b", 6), { id: "npc", type: "npc", level: 20 }] },
    contents: [pc("fallback", 10, { hasPlayerOwner: true })],
    [Symbol.iterator]() { return this.contents[Symbol.iterator](); }
  };
  const report = detectCurrentParty({ actors, users: [] });
  assert.equal(report.available, true);
  assert.equal(report.source, "activeParty");
  assert.equal(report.size, 2);
  assert.equal(report.averageLevel, 5.5);
  assert.equal(report.partyLevel, 6);
  assert.deepEqual(report.members.map((m) => m.level), [5, 6]);
});

test("party detection falls back to non-GM user character assignments", () => {
  const assigned = pc("assigned", 8);
  const users = [{ isGM: false, character: assigned }, { isGM: true, character: pc("gm", 20) }];
  const report = detectCurrentParty({ actors: { contents: [] }, users });
  assert.equal(report.source, "assignedUsers");
  assert.equal(report.size, 1);
  assert.equal(report.partyLevel, 8);
});

test("party detection falls back to player-owned world character actors and de-duplicates actors", () => {
  const a = pc("a", 3, { hasPlayerOwner: true });
  const b = pc("b", 4, { hasPlayerOwner: true });
  const actors = [a, a, b, { id: "npc", type: "npc", hasPlayerOwner: true, level: 20 }];
  const report = detectCurrentParty({ actors, users: [] });
  assert.equal(report.source, "playerOwnedActors");
  assert.equal(report.size, 2);
  assert.equal(report.averageLevel, 3.5);
  assert.equal(report.partyLevel, 4);
});

test("party detection reports unavailable when no PCs can be found", () => {
  const report = detectCurrentParty({ actors: [], users: [] });
  assert.equal(report.available, false);
  assert.equal(report.size, 0);
  assert.equal(report.partyLevel, null);
});
