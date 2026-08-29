import test from "node:test";
import assert from "node:assert/strict";
import { createEncounterBlueprint } from "../scripts/model/encounter-blueprint.js";
import { EncounterDeploymentService } from "../scripts/deployment/deployment-service.js";
import { ActorFolderService } from "../scripts/deployment/folder-service.js";

function actorFactory() {
  let index = 0;
  const actors = [];
  return {
    actors,
    create(source) {
      index += 1;
      const actor = {
        id: `a${index}`,
        uuid: `Actor.a${index}`,
        name: source.label ?? `Actor ${index}`,
        flags: {},
        updates: [],
        deleted: false,
        async update(data) { this.updates.push(data); if (data.name) this.name = data.name; },
        async delete() { this.deleted = true; }
      };
      actors.push(actor);
      return actor;
    }
  };
}

function blueprint() {
  return createEncounterBlueprint({
    id: "encounter",
    name: "Storm Shrine",
    participants: [
      { id: "boss", name: "Priestess", source: { type: "fake", label: "Boss" }, quantity: 1 },
      { id: "guard", name: "Guardian", source: { type: "fake", label: "Guard" }, quantity: 3 }
    ]
  });
}

function harness({ actorMode = "per-type", failAt = null, sceneDeployment = null } = {}) {
  const factory = actorFactory();
  let call = 0;
  const participantSources = {
    async materialize(source) {
      call += 1;
      if (failAt === call) throw new Error("materialization failed");
      return factory.create(source);
    }
  };
  const saved = [];
  const instanceRepository = {
    async save(instance) {
      saved.push(structuredClone(instance));
      return { document: { uuid: `JournalEntry.runtime-${instance.id}` }, data: structuredClone(instance) };
    }
  };
  const folder = { id: "folder-enc", name: "Storm Shrine", update: async () => {}, delete: async () => {} };
  const folderService = { resolveTarget: async () => ({ folder, created: true }) };
  const deployment = new EncounterDeploymentService({ participantSources, instanceRepository, folderService, sceneDeployment, gameRef: { user: { isGM: true } } });
  return { deployment, factory, saved, folder, actorMode };
}

test("per-type deployment creates one World Actor per participant template and shares it across runtime participants", async () => {
  const h = harness();
  const result = await h.deployment.deploy(blueprint(), { actorMode: "per-type", blueprintUuid: "JournalEntry.blueprint" });
  assert.equal(result.actors.length, 2);
  assert.equal(h.saved.length, 1);
  assert.equal(result.instance.blueprint.uuid, "JournalEntry.blueprint");
  assert.equal(result.instance.deployment.actorFolderId, "folder-enc");
  assert.equal(result.instance.deployment.materializedActorUuids.length, 2);
  const boss = result.instance.participants.find((entry) => entry.templateId === "boss");
  const guards = result.instance.participants.filter((entry) => entry.templateId === "guard");
  assert.equal(boss.actorUuid, "Actor.a1");
  assert.deepEqual(guards.map((entry) => entry.actorUuid), ["Actor.a2", "Actor.a2", "Actor.a2"]);
  assert.equal(result.instance.status, "prepared");
});

test("per-participant deployment creates a separate World Actor for every concrete opponent", async () => {
  const h = harness();
  const result = await h.deployment.deploy(blueprint(), { actorMode: "per-participant" });
  assert.equal(result.actors.length, 4);
  assert.deepEqual(result.instance.participants.map((entry) => entry.actorUuid), ["Actor.a1", "Actor.a2", "Actor.a3", "Actor.a4"]);
  assert.equal(result.actors[1].name, "Guardian 1");
  assert.equal(result.actors[3].name, "Guardian 3");
});

test("failed deployment rolls back Actors created before the materialization error and does not persist the Instance", async () => {
  const h = harness({ failAt: 2 });
  await assert.rejects(() => h.deployment.deploy(blueprint(), { actorMode: "per-type" }), /materialization failed/);
  assert.equal(h.factory.actors.length, 1);
  assert.equal(h.factory.actors[0].deleted, true);
  assert.equal(h.saved.length, 0);
});

test("Actor folder options preserve hierarchy and Encounter subfolders use unique names", async () => {
  const folders = [
    { id: "root", type: "Actor", name: "Encounters", folder: null, sort: 0 },
    { id: "child", type: "Actor", name: "Existing", folder: "root", sort: 0 }
  ];
  class FakeFolder {
    static async create(data) {
      const folder = { id: `f${folders.length + 1}`, ...data };
      folders.push(folder);
      return folder;
    }
  }
  const service = new ActorFolderService({ gameRef: { user: { isGM: true }, folders }, FolderClass: FakeFolder });
  const options = service.options();
  assert.deepEqual(options.map((entry) => [entry.name, entry.depth]), [["Encounters", 0], ["Existing", 1]]);
  folders.push({ id: "same", type: "Actor", name: "Storm Shrine", folder: "root", sort: 1 });
  const result = await service.resolveTarget({ folderId: "root", createSubfolder: true, subfolderName: "Storm Shrine" });
  assert.equal(result.created, true);
  assert.equal(result.folder.name, "Storm Shrine (2)");
  assert.equal(result.folder.folder, "root");
});

test("deployment enforces the resolved Actor folder after provider materialization", async () => {
  const h = harness();
  const result = await h.deployment.deploy(blueprint(), { actorMode: "per-type" });
  assert.equal(result.actors.length, 2);
  for (const actor of result.actors) {
    const folderUpdate = actor.updates.find((update) => Object.prototype.hasOwnProperty.call(update, "folder"));
    assert.ok(folderUpdate, `Expected ${actor.name} to receive an explicit folder update`);
    assert.equal(folderUpdate.folder, "folder-enc");
  }
});


test("deployment delegates selected Scene preparation and persists concrete Token/Combat references", async () => {
  const previousFromUuid = globalThis.fromUuid;
  const scene = { id: "scene-1", uuid: "Scene.scene-1", name: "Arena", documentName: "Scene" };
  globalThis.fromUuid = async (uuid) => uuid === scene.uuid ? scene : null;
  const tokens = [{ id: "t1", uuid: "Scene.scene-1.Token.t1" }];
  const combat = { id: "c1", uuid: "Combat.c1" };
  const calls = [];
  const sceneDeployment = {
    async deploy(instance, options) {
      calls.push({ type: "deploy", options });
      instance.deployment.tokenUuids = tokens.map((token) => token.uuid);
      instance.deployment.tokensPlacedAt = "now";
      instance.deployment.placementMode = options.placementMode;
      instance.deployment.combatUuid = combat.uuid;
      instance.participants[0].tokenUuid = tokens[0].uuid;
      return { scene, tokens, combat };
    },
    async stampReferences(options) { calls.push({ type: "stamp", options }); },
    async rollback() {}
  };
  try {
    const h = harness({ sceneDeployment });
    const result = await h.deployment.deploy(blueprint(), {
      actorMode: "per-type",
      sceneUuid: scene.uuid,
      placeTokens: true,
      placementMode: "staging-center",
      createCombat: true,
      includePlayerTokens: true
    });
    assert.equal(calls[0].type, "deploy");
    assert.equal(calls[0].options.scene, scene);
    assert.equal(calls[0].options.createCombat, true);
    assert.equal(result.tokens, tokens);
    assert.equal(result.combat, combat);
    assert.equal(result.instance.deployment.tokenUuids[0], tokens[0].uuid);
    assert.equal(result.instance.deployment.combatUuid, combat.uuid);
    assert.equal(calls[1].type, "stamp");
  } finally {
    globalThis.fromUuid = previousFromUuid;
  }
});
