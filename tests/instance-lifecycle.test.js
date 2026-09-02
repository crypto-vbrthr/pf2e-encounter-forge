import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.js";
import { deleteEncounterInstance } from "../scripts/persistence/instance-lifecycle.js";

function clone(value) { return structuredClone(value); }

test("safe Instance deletion stops a bound Runtime and removes Scene/Combat routing without deleting deployment documents", async () => {
  const instance = {
    id: "run-1",
    deployment: { sceneUuid: "Scene.s1", combatUuid: "Combat.c1" }
  };
  const instanceDocument = { uuid: "JournalEntry.runtime-run-1" };
  let stored = clone(instance);
  let repositoryDeleted = false;
  const instanceRepository = {
    get(id) { return id === "run-1" ? { document: instanceDocument, data: clone(stored) } : null; },
    async delete(id) { if (id !== "run-1") return false; repositoryDeleted = true; stored = null; return true; }
  };

  let stopped = 0;
  const runtime = {
    status: () => ({ activeInstanceId: "run-1" }),
    async stop() { stopped += 1; }
  };

  const scene = {
    id: "s1",
    name: "Arena",
    flags: { [MODULE_ID]: { instances: {
      "run-1": { instanceUuid: instanceDocument.uuid },
      "run-2": { instanceUuid: "JournalEntry.runtime-run-2" }
    } } },
    updates: [],
    async update(changes) { this.updates.push(clone(changes)); }
  };
  const combat = {
    id: "c1",
    flags: { [MODULE_ID]: { encounter: { instanceId: "run-1", instanceUuid: instanceDocument.uuid } } },
    unset: [],
    async unsetFlag(scope, key) { this.unset.push([scope, key]); }
  };
  let actorOrTokenDeletes = 0;
  const fromUuidRef = async (uuid) => uuid === "Scene.s1" ? scene : uuid === "Combat.c1" ? combat : null;

  const result = await deleteEncounterInstance("run-1", {
    instanceRepository,
    runtime,
    gameRef: {},
    fromUuidRef
  });

  assert.equal(result, true);
  assert.equal(stopped, 1);
  assert.equal(repositoryDeleted, true);
  assert.equal(actorOrTokenDeletes, 0);
  assert.equal(scene.updates.length, 1);
  assert.deepEqual(scene.updates[0][`flags.${MODULE_ID}.instances`], {
    "run-2": { instanceUuid: "JournalEntry.runtime-run-2" }
  });
  assert.deepEqual(combat.unset, [[MODULE_ID, "encounter"]]);
});

test("safe Instance deletion leaves an unrelated Runtime and Combat binding untouched", async () => {
  const instance = { id: "run-1", deployment: { sceneUuid: null, combatUuid: "Combat.c1" } };
  const instanceRepository = {
    get: () => ({ document: { uuid: "JournalEntry.runtime-run-1" }, data: clone(instance) }),
    async delete() { return true; }
  };
  let stopped = 0;
  const runtime = { status: () => ({ activeInstanceId: "run-2" }), async stop() { stopped += 1; } };
  const combat = {
    id: "c1",
    flags: { [MODULE_ID]: { encounter: { instanceId: "run-2", instanceUuid: "JournalEntry.runtime-run-2" } } },
    unsetCalls: 0,
    async unsetFlag() { this.unsetCalls += 1; }
  };

  assert.equal(await deleteEncounterInstance("run-1", {
    instanceRepository,
    runtime,
    gameRef: {},
    fromUuidRef: async (uuid) => uuid === "Combat.c1" ? combat : null
  }), true);
  assert.equal(stopped, 0);
  assert.equal(combat.unsetCalls, 0);
});
