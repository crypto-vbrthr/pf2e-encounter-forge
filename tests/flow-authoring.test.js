import test from "node:test";
import assert from "node:assert/strict";
import { createEncounterBlueprint, validateEncounterBlueprint } from "../scripts/model/encounter-blueprint.js";
import { analyzeEncounterFlow } from "../scripts/engine/encounter-flow.js";
import { createEncounterInstance } from "../scripts/model/encounter-instance.js";
import { EncounterRuntime } from "../scripts/runtime/encounter-runtime.js";
import { EventService } from "../scripts/runtime/event-service.js";
import { EncounterEventBus } from "../scripts/runtime/event-bus.js";

function repositories(blueprint, instance) {
  let stored = structuredClone(instance);
  return {
    instanceRepository: {
      get: (id) => id === instance.id ? { document: { uuid: `JournalEntry.${id}` }, data: structuredClone(stored) } : null,
      list: () => [{ document: { uuid: `JournalEntry.${instance.id}` }, data: structuredClone(stored) }],
      async save(value) { stored = structuredClone(value); return { document: { uuid: `JournalEntry.${instance.id}` }, data: structuredClone(stored) }; }
    },
    blueprintRepository: { get: () => ({ document: { uuid: "JournalEntry.blueprint" }, data: structuredClone(blueprint) }) },
    read: () => structuredClone(stored)
  };
}

const gameRef = {
  user: { id: "gm", isGM: true, active: true },
  users: { contents: [{ id: "gm", isGM: true, active: true }] }
};

test("flow analysis validates dead phase/objective/action references", () => {
  const blueprint = createEncounterBlueprint({
    phases: [{ id: "one", name: "One" }],
    objectives: [{ id: "ritual", name: "Ritual", target: 3 }],
    actions: [
      { id: "bad-phase", type: "phase.transition", phaseId: "missing" },
      { id: "bad-objective", type: "objective.progress", objectiveId: "missing", amount: 1 }
    ],
    triggers: [{ id: "bad-trigger", event: "combat.roundChanged", actions: ["missing-action"] }]
  });
  const flow = analyzeEncounterFlow(blueprint);
  assert.equal(flow.valid, false);
  assert(flow.errors.some((entry) => entry.code === "FLOW_PHASE_TARGET"));
  assert(flow.errors.some((entry) => entry.code === "FLOW_OBJECTIVE_TARGET"));
  assert(flow.errors.some((entry) => entry.code === "FLOW_TRIGGER_ACTION"));
  assert.equal(validateEncounterBlueprint(blueprint).valid, false);
});

test("flow analysis identifies unreachable phases and scoped transition cycles", () => {
  const blueprint = createEncounterBlueprint({
    phases: [
      { id: "opening", name: "Opening" },
      { id: "second", name: "Second" },
      { id: "unused", name: "Unused" }
    ],
    actions: [
      { id: "to-second", type: "phase.transition", phaseId: "second" },
      { id: "to-opening", type: "phase.transition", phaseId: "opening" }
    ],
    triggers: [
      { id: "a", event: "combat.roundChanged", activePhaseId: "opening", actions: ["to-second"] },
      { id: "b", event: "combat.roundChanged", activePhaseId: "second", actions: ["to-opening"] }
    ]
  });
  const flow = analyzeEncounterFlow(blueprint);
  assert(flow.warnings.some((entry) => entry.code === "FLOW_PHASE_UNREACHABLE" && entry.path.includes("unused")));
  assert(flow.warnings.some((entry) => entry.code === "FLOW_PHASE_CYCLE"));
});

test("phase-scoped triggers only fire while their authoring phase is current", async () => {
  const blueprint = createEncounterBlueprint({
    phases: [{ id: "opening", name: "Opening" }, { id: "second", name: "Second" }],
    actions: [{ id: "message", type: "director.message", message: "Now" }],
    triggers: [{ id: "second-only", name: "Second only", event: "combat.roundChanged", activePhaseId: "second", actions: ["message"] }]
  });
  const instance = createEncounterInstance(blueprint, { id: "i", blueprintUuid: "JournalEntry.blueprint" });
  const repos = repositories(blueprint, instance);
  const runtime = new EncounterRuntime({ ...repos, integrations: {}, gameRef, hooksRef: null });
  await runtime.activate("i");
  await runtime.bus.emit("encounter.event", { type: "combat.roundChanged", instanceId: "i", round: 1, turn: 0 });
  assert.equal(repos.read().decisions.length, 0);
  await runtime.setPhase("second");
  await runtime.bus.emit("encounter.event", { type: "combat.roundChanged", instanceId: "i", round: 2, turn: 0 });
  assert.equal(repos.read().decisions.length, 1);
});

test("HP change events expose current HP and percentage for authored conditions", async () => {
  const callbacks = new Map();
  const hooksRef = { on(name, fn) { callbacks.set(name, fn); return name; }, off() {} };
  const bus = new EncounterEventBus();
  const participant = { id: "boss", tokenUuid: "Scene.s.Token.t", actorUuid: "Actor.a" };
  const instance = { id: "i", deployment: {}, participants: [participant] };
  const actor = { system: { attributes: { hp: { value: 45, max: 100 } } } };
  const token = { uuid: participant.tokenUuid, actor };
  const participants = {
    findByTokenDocument: () => participant,
    findByActor: () => [],
    findByCombatant: () => null
  };
  const events = [];
  bus.on("encounter.event", (event) => events.push(event));
  const service = new EventService({ bus, getInstance: () => instance, participants, hooksRef });
  await service.start();
  await callbacks.get("updateToken")(token, { delta: { system: { attributes: { hp: { value: 45 } } } } });
  const event = events.find((entry) => entry.type === "participant.hpChanged");
  assert.equal(event.hpValue, 45);
  assert.equal(event.hpMax, 100);
  assert.equal(event.hpPercent, 45);
});
