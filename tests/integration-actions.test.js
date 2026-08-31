import test from "node:test";
import assert from "node:assert/strict";
import { ActionService } from "../scripts/runtime/action-service.js";
import { EncounterEventBus } from "../scripts/runtime/event-bus.js";
import { createEncounterBlueprint, validateEncounterBlueprint } from "../scripts/model/encounter-blueprint.js";

function integrations(apis) {
  return { api: (id) => apis[id] ?? null };
}

const actors = [{ uuid: "Actor.a" }, { uuid: "Actor.b" }];
const participants = { resolveActors: async () => actors };

test("runtime integration action delegates Effect Forge definitions to resolved Encounter targets", async () => {
  const calls = [];
  const bus = new EncounterEventBus();
  const service = new ActionService({
    bus,
    participants,
    integrations: integrations({
      effectForge: {
        effects: {
          validate: () => ({ valid: true }),
          apply: async (definition, targets) => { calls.push({ definition, targets }); return [{ id: "e1" }]; }
        }
      }
    })
  });
  const result = await service.execute({ id: "fx", type: "effect.apply", definition: { id: "slow" }, targetMode: "all" });
  assert.equal(result.handled, true);
  assert.equal(result.targetCount, 2);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].targets, actors);
});

test("runtime integration action assigns and toggles Actor-local Aura Forge definitions", async () => {
  const states = new Map();
  const setCalls = [];
  const assignCalls = [];
  const api = {
    instances: {
      list: (actor) => states.get(actor.uuid) ? [states.get(actor.uuid)] : [],
      async assignDefinition(actor, definition) {
        assignCalls.push({ actor: actor.uuid, definitionId: definition.id });
        const instance = { id: `aura-${actor.uuid}`, definitionId: definition.id, enabled: true };
        states.set(actor.uuid, instance);
        return instance;
      },
      async setEnabled(actor, instanceId, enabled) { setCalls.push({ actor: actor.uuid, instanceId, enabled }); }
    }
  };
  const service = new ActionService({ participants, integrations: integrations({ auraForge: api }) });
  const definition = { id: "storm-aura", name: "Storm Aura" };
  const enabled = await service.execute({ id: "on", type: "aura.setEnabled", definition, targetMode: "all", enabled: true });
  assert.equal(enabled.handled, true);
  assert.equal(setCalls.filter((entry) => entry.enabled).length, 2);
  assert.equal(assignCalls.length, 2);
  await service.execute({ id: "on-again", type: "aura.setEnabled", definition, targetMode: "all", enabled: true });
  assert.equal(assignCalls.length, 2, "existing Aura instances should only be re-enabled, not assigned a second time");
  const disabled = await service.execute({ id: "off", type: "aura.setEnabled", definition, targetMode: "all", enabled: false });
  assert.equal(disabled.handled, true);
  assert.equal(setCalls.filter((entry) => !entry.enabled).length, 2);
});

test("runtime integration action delegates Affliction Forge application", async () => {
  const calls = [];
  const instance = { id: "encounter-i" };
  const service = new ActionService({
    participants,
    getInstance: () => instance,
    integrations: integrations({
      afflictionForge: { engine: { applyDefinition: async (definition, targets, options) => { calls.push({ definition, targets, options }); return [1, 2]; } } }
    })
  });
  const result = await service.execute({ id: "aff", type: "affliction.apply", definition: { id: "venom" }, targetMode: "all" });
  assert.equal(result.handled, true);
  assert.equal(result.resultCount, 2);
  assert.equal(calls[0].options.source.encounterInstanceId, "encounter-i");
});

test("Loot Forge action creates a reward Actor in the Encounter Actor folder and remembers it", async () => {
  const updates = [];
  const actor = { uuid: "Actor.loot", name: "Reward", async update(changes) { updates.push(changes); } };
  const instance = { id: "i", deployment: { actorFolderId: "folder-1" }, runtimeVariables: {} };
  const service = new ActionService({
    getInstance: () => instance,
    integrations: integrations({
      lootForge: {
        generateLoot: async () => ({ coins: { gp: 10 } }),
        createLootActorWithLoot: async () => actor
      }
    })
  });
  const result = await service.execute({ id: "loot", type: "loot.createActor", loot: { config: { level: 5 } }, lootActorName: "Reward" });
  assert.equal(result.handled, true);
  assert.equal(updates[0].folder, "folder-1");
  assert.equal(updates[0]["flags.pf2e-encounter-forge.encounter"].actionId, "loot");
  assert.deepEqual(instance.runtimeVariables.integrationActions.loot.lootActorUuids, ["Actor.loot"]);
});

test("flow validation requires integration definitions and valid participant/group targets", () => {
  const blueprint = createEncounterBlueprint({
    participants: [{ id: "boss", name: "Boss", source: { type: "document", uuid: "Actor.x" }, level: 5 }],
    groups: [{ id: "guards", name: "Guards" }],
    actions: [
      { id: "bad-effect", type: "effect.apply", targetMode: "participant", targetId: "missing" },
      { id: "good-aura", type: "aura.setEnabled", targetMode: "group", targetId: "guards", definition: { id: "aura" } }
    ]
  });
  const report = validateEncounterBlueprint(blueprint);
  assert.equal(report.valid, false);
  assert(report.errors.some((entry) => entry.code === "FLOW_ACTION_PARTICIPANT_TARGET"));
  assert(report.errors.some((entry) => entry.code === "FLOW_EFFECT_DEFINITION"));
  assert.equal(report.errors.some((entry) => entry.path === "actions.good-aura"), false);
});

test("participant target resolution prefers concrete Token Actors and supports template/group scopes", async () => {
  const { ParticipantService } = await import("../scripts/runtime/participant-service.js");
  const tokenActorA = { uuid: "Scene.s.Token.t1.Actor.a" };
  const tokenActorB = { uuid: "Scene.s.Token.t2.Actor.b" };
  const docs = new Map([
    ["Scene.s.Token.t1", { actor: tokenActorA }],
    ["Scene.s.Token.t2", { actor: tokenActorB }]
  ]);
  const previous = globalThis.fromUuid;
  globalThis.fromUuid = async (uuid) => docs.get(uuid) ?? null;
  try {
    const instance = {
      participants: [
        { id: "goblin-1", templateId: "goblin", groupId: "guards", tokenUuid: "Scene.s.Token.t1", actorUuid: "Actor.shared" },
        { id: "goblin-2", templateId: "goblin", groupId: "guards", tokenUuid: "Scene.s.Token.t2", actorUuid: "Actor.shared" }
      ]
    };
    const service = new ParticipantService({ getInstance: () => instance });
    assert.deepEqual(await service.resolveActors({ mode: "participant", id: "goblin" }), [tokenActorA, tokenActorB]);
    assert.deepEqual(await service.resolveActors({ mode: "group", id: "guards" }), [tokenActorA, tokenActorB]);
  } finally {
    globalThis.fromUuid = previous;
  }
});
