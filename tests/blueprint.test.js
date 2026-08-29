import test from "node:test";
import assert from "node:assert/strict";
import { createEncounterBlueprint, validateEncounterBlueprint } from "../scripts/model/encounter-blueprint.js";

function sample() {
  return createEncounterBlueprint({
    id: "storm-shrine",
    name: "Der Schrein im Sturm",
    party: { level: 10, size: 4 },
    groups: [{ id: "guards" }],
    tactics: { profiles: [{ id: "hold-line" }] },
    participants: [{ id: "guardian", source: { type: "document", uuid: "Compendium.test.Actor.x" }, quantity: 2, groupId: "guards", tacticsProfileId: "hold-line" }],
    actions: [{ id: "phase-two" }],
    triggers: [{ id: "half-hp", actions: ["phase-two"] }]
  });
}

test("blueprint factory normalizes schema and participant quantities", () => {
  const blueprint = sample();
  assert.equal(blueprint.schemaVersion, 1);
  assert.equal(blueprint.party.level, 10);
  assert.equal(blueprint.participants[0].quantity, 2);
  assert.equal(validateEncounterBlueprint(blueprint).valid, true);
});

test("blueprint validation reports duplicate ids", () => {
  const blueprint = sample();
  blueprint.actions.push({ id: "phase-two" });
  const report = validateEncounterBlueprint(blueprint);
  assert.equal(report.valid, false);
  assert(report.errors.some((entry) => entry.code === "DUPLICATE_ID"));
});

test("unknown group and action references are warnings rather than schema failures", () => {
  const blueprint = sample();
  blueprint.participants[0].groupId = "missing";
  blueprint.triggers[0].actions.push("missing-action");
  const report = validateEncounterBlueprint(blueprint);
  assert.equal(report.valid, true);
  assert(report.warnings.some((entry) => entry.code === "UNKNOWN_GROUP"));
  assert(report.warnings.some((entry) => entry.code === "UNKNOWN_ACTION"));
});
