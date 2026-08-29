import test from "node:test";
import assert from "node:assert/strict";
import { ParticipantSourceRegistry } from "../scripts/engine/participant-source-registry.js";
import { registerCoreParticipantSources } from "../scripts/engine/core-participant-sources.js";

function integrations(apis = {}) {
  return { api: (id) => apis[id] ?? null };
}

test("custom participant sources can be registered and materialized", async () => {
  const registry = new ParticipantSourceRegistry();
  registry.register("custom", { materialize: async (source) => ({ id: source.value }) });
  assert.equal(registry.validate({ type: "custom", value: 7 }).valid, true);
  assert.deepEqual(await registry.materialize({ type: "custom", value: 7 }), { id: 7 });
});

test("Creature Forge source uses public generation and actor creation API", async () => {
  const calls = [];
  const actor = { update: async (data) => calls.push(["update", data]) };
  const api = {
    generateAsync: async (request) => { calls.push(["generate", request]); return { id: "bp-1" }; },
    createActor: async (blueprint, options) => { calls.push(["create", blueprint, options]); return { actor }; }
  };
  const registry = registerCoreParticipantSources(new ParticipantSourceRegistry(), integrations({ creatureForge: api }));
  const result = await registry.materialize({ type: "creatureForge", request: { level: 5 } }, { actorFolderId: "folder", blueprintId: "enc", participantTemplateId: "p1", instanceId: "i1" });
  assert.equal(result, actor);
  assert.equal(calls[0][0], "generate");
  assert.equal(calls[1][0], "create");
  assert.equal(calls[1][2].folder, "folder");
  assert.equal(calls[2][0], "update");
});

test("NPC Forge source uses engine.generate and documents.createActor", async () => {
  const calls = [];
  const actor = { update: async () => {} };
  const api = {
    engine: { generate: (request) => { calls.push(["generate", request]); return { identity: { name: "NPC" } }; } },
    documents: { createActor: async (npc, options) => { calls.push(["create", npc, options]); return actor; } }
  };
  const registry = registerCoreParticipantSources(new ParticipantSourceRegistry(), integrations({ npcForge: api }));
  const result = await registry.materialize({ type: "npcForge", request: { level: { value: 4 } } }, { actorFolderId: "folder" });
  assert.equal(result, actor);
  assert.equal(calls[0][0], "generate");
  assert.equal(calls[1][0], "create");
  assert.equal(calls[1][2].folder, "folder");
});
