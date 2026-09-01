import test from "node:test";
import assert from "node:assert/strict";
import { createEncounterBlueprint } from "../scripts/model/encounter-blueprint.js";
import { createEncounterInstance } from "../scripts/model/encounter-instance.js";
import { EncounterRuntime } from "../scripts/runtime/encounter-runtime.js";
import { EventService } from "../scripts/runtime/event-service.js";
import { EncounterEventBus } from "../scripts/runtime/event-bus.js";

function clone(value) { return structuredClone(value); }

function repositories(blueprint, instance) {
  let stored = clone(instance);
  const doc = { uuid: `JournalEntry.runtime-${instance.id}` };
  return {
    instanceRepository: {
      get(id) { return [stored.id, doc.uuid].includes(id) ? { document: doc, data: clone(stored) } : null; },
      list() { return [{ document: doc, data: clone(stored) }]; },
      async save(value) { stored = clone(value); return { document: doc, data: clone(stored) }; }
    },
    blueprintRepository: {
      get(id) { return [blueprint.id, "JournalEntry.blueprint"].includes(id) ? { document: { uuid: "JournalEntry.blueprint" }, data: clone(blueprint) } : null; }
    },
    read: () => clone(stored),
    write: (value) => { stored = clone(value); }
  };
}

function gameRef() {
  return {
    user: { id: "gm", isGM: true, active: true },
    users: { contents: [{ id: "gm", isGM: true, active: true }] }
  };
}

function runtimeFixture() {
  const blueprint = createEncounterBlueprint({
    id: "storm",
    name: "Storm Shrine",
    phases: [{ id: "opening", name: "Opening" }, { id: "awakening", name: "Awakening" }],
    objectives: [{ id: "ritual", name: "Stop the ritual", target: 3 }],
    actions: [{ id: "phase-two", type: "phase.transition", phaseId: "awakening" }],
    triggers: [{
      id: "round-two",
      name: "Awakening trigger",
      event: "combat.roundChanged",
      conditions: [{ field: "round", operator: "gte", value: 2 }],
      actions: ["phase-two"]
    }]
  });
  const instance = createEncounterInstance(blueprint, { id: "instance", blueprintUuid: "JournalEntry.blueprint" });
  const repos = repositories(blueprint, instance);
  const runtime = new EncounterRuntime({ ...repos, integrations: {}, gameRef: gameRef(), hooksRef: null });
  return { blueprint, instance, repos, runtime };
}

test("Encounter Runtime lifecycle persists active, paused, resumed and completed state", async () => {
  const { runtime, repos } = runtimeFixture();
  await runtime.activate("instance");
  assert.equal(repos.read().status, "active");
  assert.ok(repos.read().metadata.startedAt);

  await runtime.pause();
  assert.equal(repos.read().status, "paused");
  assert.ok(repos.read().metadata.pausedAt);

  await runtime.resume();
  assert.equal(repos.read().status, "active");
  assert.equal(repos.read().metadata.pausedAt, null);

  await runtime.complete();
  const completed = repos.read();
  assert.equal(completed.status, "completed");
  assert.ok(completed.metadata.completedAt);
  assert.ok(completed.log.some((entry) => entry.type === "encounter.completed"));

  await runtime.reopen();
  const reopened = repos.read();
  assert.equal(reopened.status, "active");
  assert.equal(reopened.metadata.completedAt, null);
  assert.ok(reopened.log.some((entry) => entry.type === "encounter.reopened"));
});

test("round trigger creates one pending GM decision and accepted phase transition persists", async () => {
  const { runtime, repos } = runtimeFixture();
  await runtime.activate("instance");
  await runtime.bus.emit("encounter.event", { type: "combat.roundChanged", instanceId: "instance", round: 2, turn: 0 });
  let stored = repos.read();
  assert.deepEqual(stored.triggeredEvents, ["round-two"]);
  assert.equal(stored.decisions.length, 1);
  assert.equal(stored.decisions[0].status, "pending");
  assert.equal(stored.currentPhaseId, "opening");

  await runtime.bus.emit("encounter.event", { type: "combat.roundChanged", instanceId: "instance", round: 3, turn: 0 });
  assert.equal(repos.read().decisions.length, 1, "once trigger must not duplicate decisions");

  await runtime.resolveDecision(stored.decisions[0].id, "accept");
  stored = repos.read();
  assert.equal(stored.decisions[0].status, "accepted");
  assert.equal(stored.currentPhaseId, "awakening");
});

test("objective progress is persisted and automatically completes target-based objectives", async () => {
  const { runtime, repos } = runtimeFixture();
  await runtime.start("instance");
  await runtime.adjustObjective("ritual", 2);
  assert.equal(repos.read().objectives.ritual.progress, 2);
  assert.equal(repos.read().objectives.ritual.state, "active");
  await runtime.adjustObjective("ritual", 1);
  assert.equal(repos.read().objectives.ritual.progress, 3);
  assert.equal(repos.read().objectives.ritual.state, "completed");
});

test("runtime restore ignores merely prepared Instances but restores paused/active ones", async () => {
  const { runtime, repos } = runtimeFixture();
  let result = await runtime.restore();
  assert.equal(result.restored, false);
  const prepared = repos.read();
  prepared.status = "paused";
  repos.write(prepared);
  result = await runtime.restore();
  assert.equal(result.restored, true);
  assert.equal(result.instanceId, "instance");
  assert.equal(runtime.status().instanceStatus, "paused");
});

test("EventService normalizes relevant Combat and Combatant hooks into Encounter events", async () => {
  const callbacks = new Map();
  const hooksRef = {
    on(name, fn) { callbacks.set(name, fn); return `${name}-id`; },
    off() {}
  };
  const bus = new EncounterEventBus();
  const instance = {
    id: "i",
    deployment: { combatUuid: "Combat.c1" },
    participants: [{ id: "guard", tokenUuid: "Scene.s1.Token.t1", actorUuid: "Actor.a1" }]
  };
  const participants = {
    findByCombatant: (combatant) => combatant.tokenId === "t1" ? instance.participants[0] : null,
    findByTokenDocument: () => null,
    findByActor: () => []
  };
  const events = [];
  bus.on("encounter.event", (event) => events.push(event));
  const service = new EventService({ bus, getInstance: () => instance, participants, hooksRef });
  await service.start();
  await callbacks.get("updateCombat")({ id: "c1", uuid: "Combat.c1", round: 2, turn: 1 }, { round: 2, turn: 1 });
  await callbacks.get("updateCombatant")({ id: "cb1", tokenId: "t1", parent: { id: "c1", uuid: "Combat.c1" } }, { defeated: true });
  assert.ok(events.some((event) => event.type === "combat.roundChanged" && event.round === 2));
  assert.ok(events.some((event) => event.type === "combat.turnChanged" && event.turn === 1));
  assert.ok(events.some((event) => event.type === "participant.defeated" && event.participantId === "guard"));
  await service.stop();
});

test("ParticipantService resolves synthetic unlinked Token Actors through their owning Encounter Token", async () => {
  const { ParticipantService } = await import("../scripts/runtime/participant-service.js");
  const token = {
    id: "t1",
    uuid: "Scene.s1.Token.t1",
    flags: { "pf2e-encounter-forge": { participant: { instanceId: "i", participantId: "guard-1" } } }
  };
  const instance = { id: "i", participants: [{ id: "guard-1", tokenUuid: "Scene.s1.Token.t1", actorUuid: "Actor.a1" }] };
  const service = new ParticipantService({ getInstance: () => instance });
  const syntheticActor = { id: "a1", uuid: "Scene.s1.Token.t1.Actor.a1", token };
  assert.deepEqual(service.findByActor(syntheticActor).map((entry) => entry.id), ["guard-1"]);
});

test("GM-confirmed trigger posts a whispered Chat notice with a Director launcher", async () => {
  const blueprint = createEncounterBlueprint({
    id: "chat-decision",
    name: "Chat Decision",
    actions: [{ id: "advance", name: "Advance ritual", type: "director.message", message: "Advance" }],
    triggers: [{ id: "needs-gm", name: "Ritual decision", event: "combat.roundChanged", actions: ["advance"], confirm: true }]
  });
  const instance = createEncounterInstance(blueprint, { id: "chat-instance", blueprintUuid: "JournalEntry.blueprint" });
  const repos = repositories(blueprint, instance);
  const messages = [];
  const chatMessageClass = { async create(data) { messages.push(clone(data)); return { id: "m1" }; } };
  const runtime = new EncounterRuntime({ ...repos, integrations: {}, gameRef: gameRef(), hooksRef: null, chatMessageClass });
  await runtime.activate("chat-instance");
  await runtime.bus.emit("encounter.event", { type: "combat.roundChanged", instanceId: "chat-instance", round: 2, turn: 0 });

  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].whisper, ["gm"]);
  assert.match(messages[0].content, /data-pf2e-encounter-forge-open-director/);
  assert.match(messages[0].content, /Advance ritual/);
  assert.equal(messages[0].flags["pf2e-encounter-forge"].decision.instanceId, "chat-instance");
});

test("Runtime adopts the current Combat on the Encounter Scene when no prepared Combat UUID exists", async () => {
  const blueprint = createEncounterBlueprint({ id: "scene-combat", name: "Scene Combat" });
  const instance = createEncounterInstance(blueprint, { id: "scene-instance", blueprintUuid: "JournalEntry.blueprint", sceneUuid: "Scene.s1" });
  const repos = repositories(blueprint, instance);
  const updates = [];
  const combat = {
    id: "c-live",
    uuid: "Combat.c-live",
    scene: { id: "s1" },
    round: 2,
    turn: 1,
    flags: {},
    async update(data) { updates.push(data); this.flags["pf2e-encounter-forge"] = { encounter: { instanceId: "scene-instance" } }; }
  };
  const game = gameRef();
  game.combat = combat;
  game.combats = { contents: [combat] };
  const runtime = new EncounterRuntime({ ...repos, integrations: {}, gameRef: game, hooksRef: null });
  await runtime.activate("scene-instance");

  const stored = repos.read();
  assert.equal(stored.deployment.combatUuid, "Combat.c-live");
  assert.equal(stored.runtimeVariables.round, 2);
  assert.equal(stored.runtimeVariables.turn, 1);
  assert.ok(updates.some((entry) => entry["flags.pf2e-encounter-forge.encounter.instanceId"] === "scene-instance"));
});

test("EventService uses Foundry v14 pre-update combatRound updateData and counts completed rounds", async () => {
  const callbacks = new Map();
  const hooksRef = { on(name, fn) { callbacks.set(name, fn); return name; }, off() {} };
  const bus = new EncounterEventBus();
  // Foundry v14 fires combatRound before the Combat document update. The document
  // therefore intentionally remains on the previous round when the hook is called.
  const combat = { id: "c-scene", uuid: "Combat.c-scene", scene: { id: "s1" }, round: 1, turn: 0, flags: {} };
  const game = { combat };
  const instance = { id: "i-scene", deployment: { sceneUuid: "Scene.s1", combatUuid: null }, participants: [] };
  const events = [];
  bus.on("encounter.event", (event) => events.push(event));
  const service = new EventService({ bus, getInstance: () => instance, participants: {}, hooksRef, gameRef: game });
  await service.start();

  await callbacks.get("combatRound")(combat, { round: 2, turn: 0 }, { direction: 1 });
  combat.round = 2;
  await callbacks.get("combatRound")(combat, { round: 3, turn: 0 }, { direction: 1 });
  combat.round = 3;
  await callbacks.get("combatRound")(combat, { round: 4, turn: 0 }, { direction: 1 });

  assert.deepEqual(events.filter((entry) => entry.type === "combat.roundEnded").map((entry) => entry.round), [1, 2, 3]);
  assert.deepEqual(events.filter((entry) => entry.type === "combat.roundChanged").map((entry) => entry.round), [2, 3, 4]);
  await service.stop();
});

test("EventService uses Foundry v14 combatStart updateData for the initial Director round", async () => {
  const callbacks = new Map();
  const hooksRef = { on(name, fn) { callbacks.set(name, fn); return name; }, off() {} };
  const bus = new EncounterEventBus();
  const combat = { id: "c-start", uuid: "Combat.c-start", scene: { id: "s1" }, round: 0, turn: null, flags: {} };
  const game = { combat };
  const instance = { id: "i-start", deployment: { sceneUuid: "Scene.s1", combatUuid: null }, participants: [] };
  const events = [];
  bus.on("encounter.event", (event) => events.push(event));
  const service = new EventService({ bus, getInstance: () => instance, participants: {}, hooksRef, gameRef: game });
  await service.start();

  await callbacks.get("combatStart")(combat, { round: 1, turn: 0 });

  assert.ok(events.some((entry) => entry.type === "combat.roundChanged" && entry.round === 1));
  assert.equal(events.some((entry) => entry.type === "combat.roundEnded"), false);
  await service.stop();
});


test("EventService accepts a current Foundry Combat with null scene when its Combatants use Encounter Tokens", async () => {
  const callbacks = new Map();
  const hooksRef = { on(name, fn) { callbacks.set(name, fn); return name; }, off() {} };
  const bus = new EncounterEventBus();
  const combat = {
    id: "c-null-scene",
    uuid: "Combat.c-null-scene",
    scene: null,
    round: 1,
    turn: 0,
    flags: {},
    combatants: { contents: [{ tokenId: "enemy-token" }] }
  };
  const game = { combat };
  const instance = {
    id: "i-null-scene",
    deployment: {
      sceneUuid: "Scene.s1",
      combatUuid: null,
      tokenUuids: ["Scene.s1.Token.enemy-token"]
    },
    participants: []
  };
  const events = [];
  bus.on("encounter.event", (event) => events.push(event));
  const service = new EventService({ bus, getInstance: () => instance, participants: {}, hooksRef, gameRef: game });
  await service.start();

  const diagnostic = service.combatDiagnostic(combat);
  assert.equal(diagnostic.matches, true);
  assert.equal(diagnostic.receivedSceneId, "s1");
  assert.equal(diagnostic.receivedSceneContext.sceneReason, "encounter-token-overlap");

  await callbacks.get("combatRound")(combat, { round: 2, turn: 0 }, { direction: 1 });
  assert.ok(events.some((entry) => entry.type === "combat.roundChanged" && entry.round === 2));
  assert.ok(events.some((entry) => entry.type === "combat.roundEnded" && entry.round === 1));
  await service.stop();
});

test("Runtime adopts a current Combat with null scene when it overlaps deployed Encounter Tokens", async () => {
  const blueprint = createEncounterBlueprint({ id: "null-scene-combat", name: "Null Scene Combat" });
  const instance = createEncounterInstance(blueprint, { id: "null-scene-instance", blueprintUuid: "JournalEntry.blueprint", sceneUuid: "Scene.s1" });
  instance.deployment.tokenUuids = ["Scene.s1.Token.enemy-token"];
  const repos = repositories(blueprint, instance);
  const updates = [];
  const combat = {
    id: "c-null-scene-live",
    uuid: "Combat.c-null-scene-live",
    scene: null,
    round: 2,
    turn: 1,
    flags: {},
    combatants: { contents: [{ tokenId: "enemy-token" }] },
    async update(data) { updates.push(data); this.flags["pf2e-encounter-forge"] = { encounter: { instanceId: "null-scene-instance" } }; }
  };
  const game = gameRef();
  game.combat = combat;
  game.combats = { contents: [combat] };
  const runtime = new EncounterRuntime({ ...repos, integrations: {}, gameRef: game, hooksRef: null });
  await runtime.activate("null-scene-instance");

  const stored = repos.read();
  assert.equal(stored.deployment.combatUuid, "Combat.c-null-scene-live");
  assert.equal(stored.runtimeVariables.round, 2);
  assert.equal(stored.runtimeVariables.turn, 1);
  assert.ok(updates.some((entry) => entry["flags.pf2e-encounter-forge.encounter.instanceId"] === "null-scene-instance"));
});

test("EventService deduplicates concurrent Foundry v14 combat signals before awaiting Runtime listeners", async () => {
  const callbacks = new Map();
  const hooksRef = { on(name, fn) { callbacks.set(name, fn); return name; }, off() {} };
  const bus = new EncounterEventBus();
  const instance = { id: "i-dedupe", deployment: { combatUuid: "Combat.c-dedupe" }, participants: [] };
  const combat = { id: "c-dedupe", uuid: "Combat.c-dedupe", round: 0, turn: 0, flags: {} };
  const events = [];
  bus.on("encounter.event", async (event) => {
    events.push(event);
    // Force the individual Foundry hook callbacks to overlap. The Runtime must reserve
    // the observed round/turn synchronously rather than waiting for this listener.
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  const service = new EventService({ bus, getInstance: () => instance, participants: {}, hooksRef, gameRef: { combat: null } });
  await service.start();

  await Promise.all([
    callbacks.get("combatStart")(combat, { round: 1, turn: 0 }),
    callbacks.get("updateCombat")(combat, { round: 1, turn: 0 }),
    callbacks.get("combatTurnChange")(combat, { round: 0, turn: null }, { round: 1, turn: 0 })
  ]);

  assert.equal(events.filter((entry) => entry.type === "combat.roundChanged").length, 1);
  assert.equal(events.filter((entry) => entry.type === "combat.roundEnded").length, 0, "initial round must establish a baseline, not synthesize completed rounds");

  combat.round = 1;
  events.length = 0;
  await Promise.all([
    callbacks.get("combatRound")(combat, { round: 2, turn: 0 }),
    callbacks.get("updateCombat")({ ...combat, round: 2 }, { round: 2, turn: 0 }),
    callbacks.get("combatTurnChange")({ ...combat, round: 2 }, { round: 1, turn: 0 }, { round: 2, turn: 0 })
  ]);

  assert.deepEqual(events.filter((entry) => entry.type === "combat.roundEnded").map((entry) => entry.round), [1]);
  assert.deepEqual(events.filter((entry) => entry.type === "combat.roundChanged").map((entry) => entry.round), [2]);
  await service.stop();
});

test("EventService never replays elapsed rounds when the first observed combat state is already later", async () => {
  const callbacks = new Map();
  const hooksRef = { on(name, fn) { callbacks.set(name, fn); return name; }, off() {} };
  const bus = new EncounterEventBus();
  const instance = { id: "i-late", deployment: { combatUuid: "Combat.c-late" }, participants: [] };
  const events = [];
  bus.on("encounter.event", (event) => events.push(event));
  const service = new EventService({ bus, getInstance: () => instance, participants: {}, hooksRef, gameRef: { combat: null } });
  await service.start();

  await callbacks.get("combatRound")({ id: "c-late", uuid: "Combat.c-late", round: 3, turn: 0, flags: {} }, { round: 4, turn: 0 });
  assert.deepEqual(events.filter((entry) => entry.type === "combat.roundEnded"), []);
  assert.deepEqual(events.filter((entry) => entry.type === "combat.roundChanged").map((entry) => entry.round), [4]);
  await service.stop();
});

test("one-shot triggers reserve themselves while a parallel duplicate event is still being handled", async () => {
  const blueprint = createEncounterBlueprint({
    id: "parallel-trigger",
    name: "Parallel Trigger",
    actions: [{ id: "advance", name: "Advance phase", type: "director.message", message: "Advance once" }],
    triggers: [{ id: "once", name: "Once", event: "objective.completed", objectiveId: "ritual", once: true, confirm: true, actions: ["advance"] }],
    objectives: [{ id: "ritual", name: "Ritual", target: 3 }]
  });
  const instance = createEncounterInstance(blueprint, { id: "parallel-instance", blueprintUuid: "JournalEntry.blueprint" });
  const repos = repositories(blueprint, instance);
  const messages = [];
  const chatMessageClass = { async create(data) { await new Promise((resolve) => setTimeout(resolve, 5)); messages.push(clone(data)); return { id: `m${messages.length}` }; } };
  const runtime = new EncounterRuntime({ ...repos, integrations: {}, gameRef: gameRef(), hooksRef: null, chatMessageClass });
  await runtime.activate("parallel-instance");
  const event = { type: "objective.completed", instanceId: "parallel-instance", objectiveId: "ritual", progress: 3, target: 3 };
  await Promise.all([
    runtime.bus.emit("encounter.event", clone(event)),
    runtime.bus.emit("encounter.event", clone(event)),
    runtime.bus.emit("encounter.event", clone(event))
  ]);
  assert.equal(repos.read().decisions.length, 1);
  assert.equal(messages.length, 1);
});

test("Director message action is persisted in the Director log and whispered to GMs", async () => {
  const blueprint = createEncounterBlueprint({
    id: "director-message",
    name: "Director Message",
    actions: [{ id: "note", name: "Ritual warning", type: "director.message", message: "The altar begins to crack." }],
    triggers: [{ id: "note-trigger", event: "combat.roundChanged", once: true, confirm: false, automatic: true, actions: ["note"] }]
  });
  const instance = createEncounterInstance(blueprint, { id: "director-message-instance", blueprintUuid: "JournalEntry.blueprint" });
  const repos = repositories(blueprint, instance);
  const messages = [];
  const chatMessageClass = { async create(data) { messages.push(clone(data)); return { id: "m-note" }; } };
  const runtime = new EncounterRuntime({ ...repos, integrations: {}, gameRef: gameRef(), hooksRef: null, chatMessageClass });
  await runtime.activate("director-message-instance");
  await runtime.bus.emit("encounter.event", { type: "combat.roundChanged", instanceId: "director-message-instance", round: 2, turn: 0 });

  assert.ok(repos.read().log.some((entry) => entry.type === "director.message" && entry.message === "The altar begins to crack."));
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].whisper, ["gm"]);
  assert.match(messages[0].content, /The altar begins to crack\./);
  assert.match(messages[0].content, /data-pf2e-encounter-forge-open-director/);
});

test("Director can manually execute an authored Runtime action through the shared ActionService", async () => {
  const { runtime, repos } = runtimeFixture();
  await runtime.activate("instance");
  assert.equal(repos.read().currentPhaseId, "opening");

  const result = await runtime.executeAction("phase-two", { reason: "director-manual" });
  assert.equal(result.handled, true);
  const stored = repos.read();
  assert.equal(stored.currentPhaseId, "awakening");
  assert.ok(stored.log.some((entry) => entry.type === "action.manual" && entry.data.actionId === "phase-two"));
});

test("delayed actions wait for the configured number of completed combat rounds", async () => {
  const blueprint = createEncounterBlueprint({
    id: "delayed-rounds",
    name: "Delayed Rounds",
    objectives: [{ id: "ritual", name: "Ritual", target: 3 }],
    actions: [{ id: "advance", name: "Advance", type: "objective.progress", objectiveId: "ritual", amount: 1, timing: { mode: "roundEnd", amount: 2 } }],
    triggers: [{ id: "arm", event: "participant.defeated", once: true, confirm: false, automatic: true, actions: ["advance"] }]
  });
  const instance = createEncounterInstance(blueprint, { id: "delayed-instance", blueprintUuid: "JournalEntry.blueprint" });
  const repos = repositories(blueprint, instance);
  const runtime = new EncounterRuntime({ ...repos, integrations: {}, gameRef: gameRef(), hooksRef: null });
  await runtime.activate("delayed-instance");

  await runtime.bus.emit("encounter.event", { type: "participant.defeated", instanceId: "delayed-instance", participantId: "nobody" });
  let stored = repos.read();
  assert.equal(stored.objectives.ritual.progress, 0);
  assert.equal(stored.runtimeVariables.scheduledActions.length, 1);
  assert.equal(stored.runtimeVariables.scheduledActions[0].dueCounter, 2);

  await runtime.bus.emit("encounter.event", { type: "combat.roundEnded", instanceId: "delayed-instance", round: 1 });
  stored = repos.read();
  assert.equal(stored.objectives.ritual.progress, 0);
  assert.equal(stored.runtimeVariables.scheduledActions.length, 1);

  await runtime.bus.emit("encounter.event", { type: "combat.roundEnded", instanceId: "delayed-instance", round: 2 });
  stored = repos.read();
  assert.equal(stored.objectives.ritual.progress, 1);
  assert.equal(stored.runtimeVariables.scheduledActions.length, 0);
  assert.ok(stored.log.some((entry) => entry.type === "action.scheduleExecuted"));
});

test("delayed turn actions freeze while the Encounter is paused and can be cancelled", async () => {
  const blueprint = createEncounterBlueprint({
    id: "delayed-turns",
    name: "Delayed Turns",
    actions: [{ id: "note", name: "Warning", type: "director.message", message: "Now", timing: { mode: "turnEnd", amount: 2 } }]
  });
  const instance = createEncounterInstance(blueprint, { id: "turn-instance", blueprintUuid: "JournalEntry.blueprint" });
  const repos = repositories(blueprint, instance);
  const runtime = new EncounterRuntime({ ...repos, integrations: {}, gameRef: gameRef(), hooksRef: null, chatMessageClass: { async create() { return null; } } });
  await runtime.activate("turn-instance");
  const result = await runtime.executeAction("note");
  assert.equal(result.scheduled, true);
  const scheduleId = result.scheduleId;

  await runtime.pause();
  await runtime.bus.emit("encounter.event", { type: "combat.turnEnded", instanceId: "turn-instance", round: 1, turn: 1 });
  assert.equal(repos.read().runtimeVariables.timeline.turnEnds, 0);

  await runtime.resume();
  await runtime.bus.emit("encounter.event", { type: "combat.turnEnded", instanceId: "turn-instance", round: 1, turn: 2 });
  assert.equal(repos.read().runtimeVariables.timeline.turnEnds, 1);
  assert.equal(repos.read().runtimeVariables.scheduledActions.length, 1);

  await runtime.cancelScheduledAction(scheduleId);
  assert.equal(repos.read().runtimeVariables.scheduledActions.length, 0);
  assert.ok(repos.read().log.some((entry) => entry.type === "action.scheduleCancelled"));
});

test("EventService emits combat.turnEnded only after a previously observed turn completes", async () => {
  const callbacks = new Map();
  const hooksRef = { on(name, fn) { callbacks.set(name, fn); return name; }, off() {} };
  const bus = new EncounterEventBus();
  const instance = { id: "turn-end-instance", deployment: { combatUuid: "Combat.turn-end" }, participants: [] };
  const events = [];
  bus.on("encounter.event", (event) => events.push(event));
  const service = new EventService({ bus, getInstance: () => instance, participants: {}, hooksRef, gameRef: { combat: null } });
  await service.start();

  const combat = { id: "turn-end", uuid: "Combat.turn-end", round: 1, turn: null, flags: {} };
  await callbacks.get("combatStart")(combat, { round: 1, turn: 0 });
  assert.equal(events.some((event) => event.type === "combat.turnEnded"), false, "the first observed turn is only a baseline");

  combat.turn = 0;
  await callbacks.get("combatTurn")(combat, { round: 1, turn: 1 });
  assert.ok(events.some((event) => event.type === "combat.turnEnded" && event.turn === 0 && event.nextTurn === 1));
  await service.stop();
});

test("delayed actions announce their deferred execution in GM Chat", async () => {
  const blueprint = createEncounterBlueprint({
    id: "scheduled-chat",
    name: "Scheduled Chat",
    actions: [{ id: "delayed-aura", name: "Activate ward", type: "director.message", message: "Ward active", timing: { mode: "roundEnd", amount: 2 } }],
    triggers: [{ id: "arm-ward", name: "Arm ward", event: "combat.roundChanged", once: true, confirm: false, automatic: true, actions: ["delayed-aura"] }]
  });
  const instance = createEncounterInstance(blueprint, { id: "scheduled-chat-instance", blueprintUuid: "JournalEntry.blueprint" });
  const repos = repositories(blueprint, instance);
  const messages = [];
  const chatMessageClass = { async create(data) { messages.push(clone(data)); return { id: `m-${messages.length}` }; } };
  const runtime = new EncounterRuntime({ ...repos, integrations: {}, gameRef: gameRef(), hooksRef: null, chatMessageClass });
  await runtime.activate("scheduled-chat-instance");
  await runtime.bus.emit("encounter.event", { type: "combat.roundChanged", instanceId: "scheduled-chat-instance", round: 1, turn: 0 });

  assert.equal(messages.length, 1);
  assert.match(messages[0].content, /Activate ward/);
  assert.match(messages[0].content, /scheduled now/i);
  assert.match(messages[0].content, /2 more completed combat rounds/i);
  assert.match(messages[0].content, /data-pf2e-encounter-forge-open-director/);
  assert.equal(messages[0].flags["pf2e-encounter-forge"].scheduledAction.instanceId, "scheduled-chat-instance");
  assert.equal(repos.read().runtimeVariables.scheduledActions.length, 1);
});

test("GM decision Chat marks delayed prepared actions before acceptance", async () => {
  const blueprint = createEncounterBlueprint({
    id: "delayed-decision-chat",
    name: "Delayed Decision Chat",
    actions: [{ id: "delayed-note", name: "Collapse ceiling", type: "director.message", message: "Crash", timing: { mode: "roundEnd", amount: 1 } }],
    triggers: [{ id: "collapse-warning", name: "Collapse warning", event: "combat.roundChanged", once: true, confirm: true, actions: ["delayed-note"] }]
  });
  const instance = createEncounterInstance(blueprint, { id: "delayed-decision-instance", blueprintUuid: "JournalEntry.blueprint" });
  const repos = repositories(blueprint, instance);
  const messages = [];
  const chatMessageClass = { async create(data) { messages.push(clone(data)); return { id: "m-decision" }; } };
  const runtime = new EncounterRuntime({ ...repos, integrations: {}, gameRef: gameRef(), hooksRef: null, chatMessageClass });
  await runtime.activate("delayed-decision-instance");
  await runtime.bus.emit("encounter.event", { type: "combat.roundChanged", instanceId: "delayed-decision-instance", round: 1, turn: 0 });

  assert.equal(messages.length, 1);
  assert.match(messages[0].content, /Collapse ceiling/);
  assert.match(messages[0].content, /delayed: after the next combat round ends/i);
  assert.equal(repos.read().runtimeVariables.scheduledActions.length, 0, "the decision has not been accepted yet");
});

test("scheduled actions do not wait for informational Chat delivery", async () => {
  const blueprint = createEncounterBlueprint({
    id: "scheduled-chat-nonblocking",
    name: "Scheduled Chat Nonblocking",
    actions: [{ id: "delayed-note", name: "Delayed note", type: "director.message", message: "Later", timing: { mode: "roundEnd", amount: 1 } }],
    triggers: [{ id: "schedule-note", name: "Schedule note", event: "combat.roundChanged", once: true, confirm: false, automatic: true, actions: ["delayed-note"] }]
  });
  const instance = createEncounterInstance(blueprint, { id: "scheduled-chat-nonblocking-instance", blueprintUuid: "JournalEntry.blueprint" });
  const repos = repositories(blueprint, instance);
  let chatStarted = 0;
  const chatMessageClass = { create() { chatStarted += 1; return new Promise(() => {}); } };
  const runtime = new EncounterRuntime({ ...repos, integrations: {}, gameRef: gameRef(), hooksRef: null, chatMessageClass });
  await runtime.activate("scheduled-chat-nonblocking-instance");

  await Promise.race([
    runtime.bus.emit("encounter.event", { type: "combat.roundChanged", instanceId: "scheduled-chat-nonblocking-instance", round: 1, turn: 0 }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("scheduling waited for ChatMessage.create")), 100))
  ]);

  assert.equal(chatStarted, 1);
  assert.equal(repos.read().runtimeVariables.scheduledActions.length, 1);
  assert.equal(repos.read().runtimeVariables.scheduledActions[0].mode, "roundEnd");
  assert.equal(repos.read().runtimeVariables.scheduledActions[0].dueCounter, 1);
});
