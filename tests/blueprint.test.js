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

test("unknown group remains a warning while dead trigger action references block saving", () => {
  const blueprint = sample();
  blueprint.participants[0].groupId = "missing";
  blueprint.triggers[0].actions.push("missing-action");
  const report = validateEncounterBlueprint(blueprint);
  assert.equal(report.valid, false);
  assert(report.warnings.some((entry) => entry.code === "UNKNOWN_GROUP"));
  assert(report.warnings.some((entry) => entry.code === "UNKNOWN_ACTION"));
  assert(report.errors.some((entry) => entry.code === "FLOW_TRIGGER_ACTION"));
});


test("participant composition preserves level zero and nullable levels", () => {
  const zero = createEncounterBlueprint({ participants: [{ id: "p0", name: "Zero", level: 0, source: { type: "document", uuid: "Actor.zero" } }] });
  assert.equal(zero.participants[0].level, 0);
  const unknown = createEncounterBlueprint({ participants: [{ id: "p1", name: "Unknown", level: null, source: { type: "document", uuid: "Actor.unknown" } }] });
  assert.equal(unknown.participants[0].level, null);
  assert.equal(unknown.threat.budget, null);
});

test("participant round-trip preserves level, role, and tactical group", () => {
  const original = createEncounterBlueprint({
    groups: [{ id: "guards", name: "Guards" }],
    participants: [{
      id: "captain",
      name: "Captain",
      level: 11,
      role: "leader",
      groupId: "guards",
      source: { type: "creatureForge", blueprint: { identity: { level: 11 } }, request: { identity: { level: 11 } } }
    }]
  });
  const restored = createEncounterBlueprint(JSON.parse(JSON.stringify(original)));
  assert.equal(restored.participants[0].level, 11);
  assert.equal(restored.participants[0].role, "leader");
  assert.equal(restored.participants[0].groupId, "guards");
});


test("participant Token display settings survive Blueprint round-trip", () => {
  const original = createEncounterBlueprint({
    participants: [{
      id: "visible-guard",
      name: "Visible Guard",
      source: { type: "document", uuid: "Actor.guard" },
      tokenDisplay: { displayName: "ALWAYS", displayBars: "HOVER", hpBarAttribute: "attributes.hp" }
    }]
  });
  const restored = createEncounterBlueprint(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored.participants[0].tokenDisplay, {
    displayName: "ALWAYS",
    displayBars: "HOVER",
    hpBarAttribute: "attributes.hp"
  });
  assert.equal(validateEncounterBlueprint(restored).valid, true);
});

test("unknown participant Token display modes normalize to Actor inheritance", () => {
  const blueprint = createEncounterBlueprint({
    participants: [{
      id: "guard",
      source: { type: "document", uuid: "Actor.guard" },
      tokenDisplay: { displayName: "SECRET_MODE", displayBars: "ALWAYS" }
    }]
  });
  assert.equal(blueprint.participants[0].tokenDisplay.displayName, null);
  assert.equal(blueprint.participants[0].tokenDisplay.displayBars, "ALWAYS");
});

test("Blueprint archive metadata survives normalization and can be cleared again", () => {
  const archivedAt = "2026-09-02T07:30:00.000Z";
  const archived = createEncounterBlueprint({ id: "archived", name: "Archived", metadata: { archivedAt } });
  assert.equal(archived.metadata.archivedAt, archivedAt);
  const restored = createEncounterBlueprint({ ...archived, metadata: { ...archived.metadata, archivedAt: null } });
  assert.equal(restored.metadata.archivedAt, null);
});
