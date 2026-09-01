import test from "node:test";
import assert from "node:assert/strict";
import { createEncounterBlueprint, validateEncounterBlueprint } from "../scripts/model/encounter-blueprint.js";
import { analyzeEncounterFlow } from "../scripts/engine/encounter-flow.js";
import { createEncounterInstance } from "../scripts/model/encounter-instance.js";
import { EncounterRuntime } from "../scripts/runtime/encounter-runtime.js";
import { EventService } from "../scripts/runtime/event-service.js";
import { EncounterEventBus } from "../scripts/runtime/event-bus.js";
import { matchesTriggerConditions } from "../scripts/runtime/trigger-service.js";

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

test("HP direction events distinguish decreases from increases and retain previous HP", async () => {
  const callbacks = new Map();
  const hooksRef = { on(name, fn) { callbacks.set(name, fn); return name; }, off() {} };
  const bus = new EncounterEventBus();
  const participant = { id: "boss", tokenUuid: "Scene.s.Token.t", actorUuid: "Actor.a" };
  const instance = { id: "i", deployment: {}, participants: [participant] };
  const actor = { system: { attributes: { hp: { value: 80, max: 100 } } } };
  const token = { uuid: participant.tokenUuid, actor };
  const participants = {
    findByTokenDocument: () => participant,
    findByActor: () => [],
    findByCombatant: () => null,
    async snapshots() { return [{ id: participant.id, hp: { value: 80, max: 100, percent: 80 } }]; }
  };
  const events = [];
  bus.on("encounter.event", (event) => events.push(event));
  const service = new EventService({ bus, getInstance: () => instance, participants, hooksRef });
  await service.start();

  actor.system.attributes.hp.value = 50;
  await callbacks.get("updateToken")(token, { delta: { system: { attributes: { hp: { value: 50 } } } } });
  assert.deepEqual(events.map((entry) => entry.type), ["participant.hpChanged", "participant.hpDecreased"]);
  assert.equal(events[1].previousHpValue, 80);
  assert.equal(events[1].hpValue, 50);

  events.length = 0;
  actor.system.attributes.hp.value = 70;
  await callbacks.get("updateToken")(token, { delta: { system: { attributes: { hp: { value: 70 } } } } });
  assert.deepEqual(events.map((entry) => entry.type), ["participant.hpChanged", "participant.hpIncreased"]);
  assert.equal(events[1].previousHpValue, 50);
  assert.equal(events[1].hpValue, 70);

  events.length = 0;
  await callbacks.get("updateToken")(token, { delta: { system: { attributes: { hp: { value: 70 } } } } });
  assert.deepEqual(events, []);
});

test("round-end events are emitted only after a completed combat round", async () => {
  const callbacks = new Map();
  const hooksRef = { on(name, fn) { callbacks.set(name, fn); return name; }, off() {} };
  const bus = new EncounterEventBus();
  const instance = { id: "i", deployment: { combatUuid: "Combat.c" }, participants: [] };
  const events = [];
  bus.on("encounter.event", (event) => events.push(event));
  const service = new EventService({ bus, getInstance: () => instance, participants: {}, hooksRef });
  await service.start();

  await callbacks.get("updateCombat")({ id: "c", uuid: "Combat.c", round: 1, turn: 0 }, { round: 1 });
  assert.equal(events.some((event) => event.type === "combat.roundEnded"), false);

  events.length = 0;
  await callbacks.get("updateCombat")({ id: "c", uuid: "Combat.c", round: 2, turn: 0 }, { round: 2 });
  assert.deepEqual(events.map((event) => event.type), ["combat.roundEnded", "combat.roundChanged"]);
  assert.equal(events[0].round, 1);
  assert.equal(events[0].nextRound, 2);
});

test("objective completion can cascade into a phase transition trigger", async () => {
  const blueprint = createEncounterBlueprint({
    phases: [{ id: "ritual", name: "Ritual" }, { id: "aftermath", name: "Aftermath" }],
    objectives: [{ id: "ritual-progress", name: "Ritual progress", target: 3 }],
    actions: [
      { id: "advance", type: "objective.progress", objectiveId: "ritual-progress", amount: 1 },
      { id: "advance-phase", type: "phase.transition", phaseId: "aftermath" }
    ],
    triggers: [
      { id: "each-round", event: "combat.roundEnded", activePhaseId: "ritual", once: false, confirm: false, automatic: true, actions: ["advance"] },
      { id: "ritual-complete", event: "objective.completed", activePhaseId: "ritual", objectiveId: "ritual-progress", once: true, confirm: false, automatic: true, actions: ["advance-phase"] }
    ]
  });
  const instance = createEncounterInstance(blueprint, { id: "i", blueprintUuid: "JournalEntry.blueprint" });
  const repos = repositories(blueprint, instance);
  const runtime = new EncounterRuntime({ ...repos, integrations: {}, gameRef, hooksRef: null });
  await runtime.activate("i");

  for (let round = 1; round <= 3; round += 1) {
    await runtime.bus.emit("encounter.event", { type: "combat.roundEnded", instanceId: "i", round });
  }

  const stored = repos.read();
  assert.equal(stored.objectives["ritual-progress"].progress, 3);
  assert.equal(stored.objectives["ritual-progress"].state, "completed");
  assert.equal(stored.currentPhaseId, "aftermath");
  assert(stored.triggeredEvents.includes("ritual-complete"));
});

test("flow analysis rejects trigger references to missing objectives", () => {
  const blueprint = createEncounterBlueprint({
    objectives: [{ id: "real", name: "Real", target: 1 }],
    triggers: [{ id: "bad-objective-trigger", event: "objective.completed", objectiveId: "missing", actions: [] }]
  });
  const flow = analyzeEncounterFlow(blueprint);
  assert(flow.errors.some((entry) => entry.code === "FLOW_TRIGGER_OBJECTIVE"));
});

test("advanced conditions support AND, OR, and per-condition NOT against Encounter context", async () => {
  const instance = {
    currentPhaseId: "opening",
    runtimeVariables: { round: 4, turn: 1 },
    participants: [],
    objectives: {}
  };
  const event = { type: "combat.turnChanged", round: 4, turn: 1 };
  const all = {
    conditionMode: "all",
    conditions: [
      { field: "currentRound", operator: "gte", value: 4 },
      { field: "currentPhaseId", operator: "eq", value: "opening" },
      { field: "currentTurn", operator: "eq", value: 99, negate: true }
    ]
  };
  const any = {
    conditionMode: "any",
    conditions: [
      { field: "currentRound", operator: "gte", value: 10 },
      { field: "currentPhaseId", operator: "eq", value: "opening" }
    ]
  };
  assert.equal(await matchesTriggerConditions(all, event, instance), true);
  assert.equal(await matchesTriggerConditions(any, event, instance), true);
});

test("objective context conditions can inspect persistent objective state on unrelated events", async () => {
  const instance = {
    currentPhaseId: "opening",
    runtimeVariables: { round: 2, turn: 0 },
    participants: [],
    objectives: { ritual: { progress: 2, target: 3, state: "active" } }
  };
  const trigger = {
    conditionObjectiveId: "ritual",
    conditions: [
      { field: "objectiveProgress", operator: "gte", value: 2 },
      { field: "objectiveStateCurrent", operator: "eq", value: "active" }
    ]
  };
  assert.equal(await matchesTriggerConditions(trigger, { type: "combat.roundEnded", round: 2 }, instance), true);
});

test("group count conditions include the participant state transition carried by the current event", async () => {
  const instance = {
    participants: [
      { id: "cultist-1", templateId: "cultist", groupId: "ritualists", state: "defeated" },
      { id: "cultist-2", templateId: "cultist", groupId: "ritualists", state: "active" },
      { id: "cultist-3", templateId: "cultist", groupId: "ritualists", state: "active" }
    ],
    objectives: {},
    runtimeVariables: {}
  };
  const trigger = {
    participantId: "cultist",
    conditionGroupId: "ritualists",
    conditions: [
      { field: "groupDefeatedCount", operator: "gte", value: 2 },
      { field: "groupRemainingCount", operator: "lte", value: 1 }
    ]
  };
  const event = { type: "participant.defeated", participantId: "cultist-2" };
  assert.equal(await matchesTriggerConditions(trigger, event, instance), true, "template participant filters should match concrete quantity-expanded participants and group counts should include the new defeat");
});

test("flow analysis requires context references and warns about contradictory ALL conditions", () => {
  const blueprint = createEncounterBlueprint({
    phases: [{ id: "opening", name: "Opening" }],
    groups: [{ id: "ritualists", name: "Ritualists" }],
    triggers: [{
      id: "advanced",
      event: "combat.roundChanged",
      conditionMode: "all",
      conditions: [
        { field: "groupDefeatedCount", operator: "gte", value: 2 },
        { field: "currentRound", operator: "gte", value: 4 },
        { field: "currentRound", operator: "lte", value: 2 }
      ]
    }]
  });
  const flow = analyzeEncounterFlow(blueprint);
  assert(flow.errors.some((entry) => entry.code === "FLOW_CONDITION_GROUP_REQUIRED"));
  assert(flow.warnings.some((entry) => entry.code === "FLOW_CONDITION_CONTRADICTION"));
});


test("participant-state conditions can inspect different creatures than the event participant", async () => {
  const instance = {
    participants: [
      { id: "a", templateId: "a", state: "ready" },
      { id: "b", templateId: "b", state: "ready" },
      { id: "c", templateId: "c", state: "ready" }
    ],
    objectives: {},
    runtimeVariables: {}
  };
  const snapshots = new Map([
    ["b", [{ id: "b", state: "ready", hp: { value: 7, max: 10, percent: 70 } }]],
    ["c", [{ id: "c", state: "ready", hp: { value: 10, max: 10, percent: 100 } }]]
  ]);
  const participants = { async snapshotsForReference(id) { return snapshots.get(id) ?? []; } };
  const trigger = {
    participantId: "a",
    conditionMode: "any",
    conditions: [
      { field: "participantHpBelowMax", participantId: "b", operator: "eq", value: true },
      { field: "participantHpBelowMax", participantId: "c", operator: "eq", value: true }
    ]
  };
  const event = { type: "participant.hpChanged", participantId: "a", hpValue: 9, hpMax: 10, hpPercent: 90 };
  assert.equal(await matchesTriggerConditions(trigger, event, instance, { participants }), true);
});

test("participant-state condition validation requires a live participant reference", () => {
  const blueprint = createEncounterBlueprint({
    participants: [{ id: "a", name: "A", source: { type: "document", uuid: "Actor.a" } }],
    triggers: [{
      id: "watch-a",
      event: "participant.hpChanged",
      conditions: [{ field: "participantHpBelowMax", operator: "eq", value: true }]
    }]
  });
  const flow = analyzeEncounterFlow(blueprint);
  assert(flow.errors.some((entry) => entry.code === "FLOW_CONDITION_PARTICIPANT_REQUIRED"));

  blueprint.triggers[0].conditions[0].participantId = "missing";
  const missing = analyzeEncounterFlow(blueprint);
  assert(missing.errors.some((entry) => entry.code === "FLOW_CONDITION_PARTICIPANT_REFERENCE"));
});

test("group-member HP conditions support any, all, and at-least-N evaluation", async () => {
  const instance = {
    participants: [
      { id: "a", templateId: "a", groupId: "boss", state: "ready" },
      { id: "b", templateId: "b", groupId: "defenders", state: "ready" },
      { id: "c", templateId: "c", groupId: "defenders", state: "ready" }
    ],
    objectives: {},
    runtimeVariables: {}
  };
  const snapshots = [
    { id: "b", groupId: "defenders", state: "ready", hp: { value: 4, max: 10, percent: 40 } },
    { id: "c", groupId: "defenders", state: "ready", hp: { value: 8, max: 10, percent: 80 } }
  ];
  const participants = { async snapshotsForGroup(id) { return id === "defenders" ? snapshots : []; } };
  const event = { type: "participant.hpChanged", participantId: "a", hpValue: 9, hpMax: 10, hpPercent: 90 };
  const condition = { field: "groupParticipantHpPercent", groupId: "defenders", operator: "lte", value: 50 };

  assert.equal(await matchesTriggerConditions({ participantId: "a", conditions: [{ ...condition, groupMatchMode: "any" }] }, event, instance, { participants }), true);
  assert.equal(await matchesTriggerConditions({ participantId: "a", conditions: [{ ...condition, groupMatchMode: "all" }] }, event, instance, { participants }), false);
  assert.equal(await matchesTriggerConditions({ participantId: "a", conditions: [{ ...condition, groupMatchMode: "atLeast", groupMatchCount: 2 }] }, event, instance, { participants }), false);

  snapshots[1].hp = { value: 5, max: 10, percent: 50 };
  assert.equal(await matchesTriggerConditions({ participantId: "a", conditions: [{ ...condition, groupMatchMode: "all" }] }, event, instance, { participants }), true);
  assert.equal(await matchesTriggerConditions({ participantId: "a", conditions: [{ ...condition, groupMatchMode: "atLeast", groupMatchCount: 2 }] }, event, instance, { participants }), true);
});

test("group-member state condition validation requires a valid group and positive at-least count", () => {
  const blueprint = createEncounterBlueprint({
    groups: [{ id: "defenders", name: "Defenders" }],
    triggers: [{
      id: "watch-group",
      event: "participant.hpChanged",
      conditions: [{ field: "groupParticipantHpPercent", operator: "lte", value: 50, groupMatchMode: "atLeast", groupMatchCount: 0 }]
    }]
  });
  let flow = analyzeEncounterFlow(blueprint);
  assert(flow.errors.some((entry) => entry.code === "FLOW_CONDITION_GROUP_PARTICIPANT_REQUIRED"));
  assert(flow.errors.some((entry) => entry.code === "FLOW_CONDITION_GROUP_MATCH_COUNT"));

  blueprint.triggers[0].conditions[0].groupId = "missing";
  blueprint.triggers[0].conditions[0].groupMatchCount = 1;
  flow = analyzeEncounterFlow(blueprint);
  assert(flow.errors.some((entry) => entry.code === "FLOW_CONDITION_GROUP_PARTICIPANT_REFERENCE"));
});

test("flow analysis validates delayed action timing", () => {
  const blueprint = createEncounterBlueprint({
    actions: [{ id: "late", type: "director.message", message: "Later", timing: { mode: "roundEnd", amount: 0 } }]
  });
  let flow = analyzeEncounterFlow(blueprint);
  assert(flow.errors.some((entry) => entry.code === "FLOW_ACTION_TIMING_AMOUNT"));

  blueprint.actions[0].timing = { mode: "unknown", amount: 2 };
  flow = analyzeEncounterFlow(blueprint);
  assert(flow.warnings.some((entry) => entry.code === "FLOW_ACTION_TIMING_MODE"));
});
