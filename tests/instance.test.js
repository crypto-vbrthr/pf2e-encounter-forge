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
