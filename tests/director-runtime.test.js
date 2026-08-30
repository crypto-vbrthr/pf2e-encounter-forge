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
