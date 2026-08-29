import test from "node:test";
import assert from "node:assert/strict";
import { createEncounterBlueprint } from "../scripts/model/encounter-blueprint.js";
import { createEncounterInstance, validateEncounterInstance } from "../scripts/model/encounter-instance.js";

test("instance expands participant quantity into concrete runtime identities", () => {
  const blueprint = createEncounterBlueprint({
    id: "test",
    name: "Test",
    participants: [
      { id: "boss", source: { type: "document", uuid: "Actor.boss" }, quantity: 1 },
      { id: "guard", source: { type: "document", uuid: "Actor.guard" }, quantity: 3 }
    ],
    objectives: [{ id: "stop-ritual", target: 4 }],
    phases: [{ id: "phase-1" }]
  });
  const instance = createEncounterInstance(blueprint, { id: "run-1", actorFolderId: "folder-x" });
  assert.deepEqual(instance.participants.map((entry) => entry.id), ["boss", "guard-1", "guard-2", "guard-3"]);
  assert.equal(instance.currentPhaseId, "phase-1");
  assert.equal(instance.objectives["stop-ritual"].target, 4);
  assert.equal(instance.deployment.actorFolderId, "folder-x");
  assert.equal(validateEncounterInstance(instance).valid, true);
});


test("instance validation rejects unknown Actor materialization modes", () => {
  const blueprint = createEncounterBlueprint({ id: "mode", name: "Mode" });
  const instance = createEncounterInstance(blueprint);
  instance.deployment.actorMode = "mystery";
  assert.equal(validateEncounterInstance(instance).valid, false);
});


test("Encounter Instance propagates per-participant Token display policy", () => {
  const blueprint = createEncounterBlueprint({
    participants: [{
      id: "guard",
      source: { type: "document", uuid: "Actor.guard" },
      quantity: 2,
      tokenDisplay: { displayName: "ALWAYS", displayBars: "OWNER_HOVER", hpBarAttribute: "attributes.hp" }
    }]
  });
  const instance = createEncounterInstance(blueprint);
  assert.equal(instance.participants.length, 2);
  assert.ok(instance.participants.every((participant) => participant.tokenDisplay.displayName === "ALWAYS"));
  assert.ok(instance.participants.every((participant) => participant.tokenDisplay.displayBars === "OWNER_HOVER"));
  assert.ok(instance.participants.every((participant) => participant.tokenDisplay.hpBarAttribute === "attributes.hp"));
});


test("Encounter Instance keeps participant display identity for Director fallback", () => {
  const blueprint = createEncounterBlueprint({
    id: "display",
    name: "Display",
    participants: [{ id: "guard", name: "Rune Guard", img: "guard.webp", level: 7, source: { type: "document", uuid: "Actor.guard" }, quantity: 2 }]
  });
  const instance = createEncounterInstance(blueprint, { id: "display-instance" });
  assert.equal(instance.participants[0].display.name, "Rune Guard");
  assert.equal(instance.participants[0].display.img, "guard.webp");
  assert.equal(instance.participants[0].display.level, 7);
  assert.equal(instance.participants[1].display.name, "Rune Guard");

  const unknown = createEncounterInstance(createEncounterBlueprint({
    id: "unknown-display",
    name: "Unknown Display",
    participants: [{ id: "mystery", name: "Mystery", level: null, source: { type: "document", uuid: "Actor.mystery" } }]
  }));
  assert.equal(unknown.participants[0].display.level, null);
});
