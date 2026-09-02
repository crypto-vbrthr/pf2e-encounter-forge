import test from "node:test";
import assert from "node:assert/strict";
import { createEncounterBlueprint } from "../scripts/model/encounter-blueprint.js";
import { createEncounterInstance } from "../scripts/model/encounter-instance.js";
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

function harness({ actorMode = "per-type", failAt = null, sceneDeployment = null, existingInstances = [] } = {}) {
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
  const storedEntries = existingInstances.map((instance) => ({
    document: { uuid: `JournalEntry.runtime-${instance.id}` },
    data: structuredClone(instance)
  }));
  const instanceRepository = {
    list() { return storedEntries.map((entry) => ({ document: entry.document, data: structuredClone(entry.data) })); },
    async save(instance) {
      saved.push(structuredClone(instance));
      return { document: { uuid: `JournalEntry.runtime-${instance.id}` }, data: structuredClone(instance) };
    }
  };
  const folder = { id: "folder-enc", name: "Storm Shrine", update: async () => {}, delete: async () => {} };
  let folderResolveCalls = 0;
  const folderService = { resolveTarget: async () => { folderResolveCalls += 1; return { folder, created: true }; } };
  const deployment = new EncounterDeploymentService({ participantSources, instanceRepository, folderService, sceneDeployment, gameRef: { user: { isGM: true } } });
  return { deployment, factory, saved, folder, actorMode, get folderResolveCalls() { return folderResolveCalls; } };
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


test("repeated Blueprint deployment on the same Scene reuses the newest prepared Instance before materialization", async () => {
  const previousFromUuid = globalThis.fromUuid;
  const scene = { id: "scene-1", uuid: "Scene.scene-1", name: "Arena", documentName: "Scene" };
  globalThis.fromUuid = async (uuid) => uuid === scene.uuid ? scene : null;
  try {
    const bp = blueprint();
    const older = createEncounterInstance(bp, { id: "prepared-old", sceneUuid: scene.uuid });
    older.metadata.modifiedAt = "2026-08-29T12:00:00.000Z";
    const newer = createEncounterInstance(bp, { id: "prepared-new", sceneUuid: scene.uuid });
    newer.metadata.modifiedAt = "2026-08-29T13:00:00.000Z";
    const h = harness({ existingInstances: [older, newer] });

    const result = await h.deployment.deploy(bp, { sceneUuid: scene.uuid, actorMode: "per-type" });

    assert.equal(result.reusedPrepared, true);
    assert.equal(result.instance.id, "prepared-new");
    assert.equal(result.scene, scene);
    assert.equal(h.factory.actors.length, 0, "deduplication must happen before participant materialization");
    assert.equal(h.folderResolveCalls, 0, "deduplication must happen before Actor-folder creation/resolution");
    assert.equal(h.saved.length, 0);
  } finally {
    globalThis.fromUuid = previousFromUuid;
  }
});

test("prepared Instance deduplication is Scene-specific and explicit forceNewInstance creates another run", async () => {
  const previousFromUuid = globalThis.fromUuid;
  const sceneA = { id: "scene-a", uuid: "Scene.scene-a", name: "Arena A", documentName: "Scene" };
  const sceneB = { id: "scene-b", uuid: "Scene.scene-b", name: "Arena B", documentName: "Scene" };
  globalThis.fromUuid = async (uuid) => uuid === sceneA.uuid ? sceneA : uuid === sceneB.uuid ? sceneB : null;
  try {
    const bp = blueprint();
    const existing = createEncounterInstance(bp, { id: "prepared-a", sceneUuid: sceneA.uuid });

    const differentScene = harness({ existingInstances: [existing] });
    const resultB = await differentScene.deployment.deploy(bp, { sceneUuid: sceneB.uuid, actorMode: "per-type", placeTokens: false });
    assert.notEqual(resultB.instance.id, existing.id);
    assert.equal(resultB.reusedPrepared, undefined);
    assert.equal(differentScene.factory.actors.length, 2);
    assert.equal(differentScene.saved.length, 1);

    const forced = harness({ existingInstances: [existing] });
    const forcedResult = await forced.deployment.deploy(bp, { sceneUuid: sceneA.uuid, actorMode: "per-type", placeTokens: false, forceNewInstance: true });
    assert.notEqual(forcedResult.instance.id, existing.id);
    assert.equal(forcedResult.reusedPrepared, undefined);
    assert.equal(forced.factory.actors.length, 2);
    assert.equal(forced.saved.length, 1);
  } finally {
    globalThis.fromUuid = previousFromUuid;
  }
});

test("prepared Instance deduplication does not reuse a stale Blueprint snapshot after encounter content changes", async () => {
  const previousFromUuid = globalThis.fromUuid;
  const scene = { id: "scene-revision", uuid: "Scene.scene-revision", name: "Revision Arena", documentName: "Scene" };
  globalThis.fromUuid = async (uuid) => uuid === scene.uuid ? scene : null;
  try {
    const original = blueprint();
    const existing = createEncounterInstance(original, { id: "prepared-old-revision", sceneUuid: scene.uuid });
    const changed = createEncounterBlueprint({
      ...original,
      id: original.id,
      name: original.name,
      participants: [
        ...original.participants,
        { id: "reinforcement", name: "Reinforcement", source: { type: "fake", label: "Reinforcement" }, quantity: 1 }
      ],
      metadata: { ...original.metadata, createdAt: original.metadata.createdAt }
    });
    const h = harness({ existingInstances: [existing] });
    const result = await h.deployment.deploy(changed, { sceneUuid: scene.uuid, actorMode: "per-type", placeTokens: false });

    assert.notEqual(result.instance.id, existing.id);
    assert.equal(result.reusedPrepared, undefined);
    assert.equal(result.instance.blueprint.snapshot.participants.length, 3);
    assert.equal(h.factory.actors.length, 3, "changed Blueprint content must create a fresh deployment");
    assert.equal(h.saved.length, 1);
  } finally {
    globalThis.fromUuid = previousFromUuid;
  }
});

test("prepared Instance deduplication keeps extension metadata but ignores archive bookkeeping", async () => {
  const previousFromUuid = globalThis.fromUuid;
  const scene = { id: "scene-metadata", uuid: "Scene.scene-metadata", name: "Metadata Arena", documentName: "Scene" };
  globalThis.fromUuid = async (uuid) => uuid === scene.uuid ? scene : null;
  try {
    const original = createEncounterBlueprint({
      ...blueprint(),
      metadata: { notes: { addonRule: "alpha" } }
    });
    const existing = createEncounterInstance(original, { id: "prepared-metadata", sceneUuid: scene.uuid });

    const archivedOnly = createEncounterBlueprint({
      ...original,
      id: original.id,
      metadata: { ...original.metadata, createdAt: original.metadata.createdAt, archivedAt: "2026-09-02T08:00:00.000Z" }
    });
    const sameRuntime = harness({ existingInstances: [existing] });
    const reused = await sameRuntime.deployment.deploy(archivedOnly, { sceneUuid: scene.uuid, actorMode: "per-type" });
    assert.equal(reused.reusedPrepared, true, "archive bookkeeping alone must not invalidate a prepared deployment");

    const extensionChanged = createEncounterBlueprint({
      ...original,
      id: original.id,
      metadata: { ...original.metadata, createdAt: original.metadata.createdAt, notes: { addonRule: "beta" } }
    });
    const changedRuntime = harness({ existingInstances: [existing] });
    const fresh = await changedRuntime.deployment.deploy(extensionChanged, { sceneUuid: scene.uuid, actorMode: "per-type", placeTokens: false });
    assert.notEqual(fresh.instance.id, existing.id);
    assert.equal(fresh.reusedPrepared, undefined);
    assert.equal(changedRuntime.factory.actors.length, 2, "extension metadata changes must create a fresh deployment");
  } finally {
    globalThis.fromUuid = previousFromUuid;
  }
});

test("Scene-bound Blueprint deployment always uses the bound Scene and rejects another Scene", async () => {
  const previousFromUuid = globalThis.fromUuid;
  const boundScene = { id: "bound", uuid: "Scene.bound", name: "Bound Arena", documentName: "Scene" };
  const otherScene = { id: "other", uuid: "Scene.other", name: "Other Arena", documentName: "Scene" };
  globalThis.fromUuid = async (uuid) => uuid === boundScene.uuid ? boundScene : uuid === otherScene.uuid ? otherScene : null;
  try {
    const bp = createEncounterBlueprint({
      ...blueprint(),
      sceneBinding: { sceneId: boundScene.id, sceneUuid: boundScene.uuid, sceneName: boundScene.name }
    });
    const h = harness();
    const result = await h.deployment.deploy(bp, { actorMode: "per-type", placeTokens: false });
    assert.equal(result.scene, boundScene);
    assert.equal(result.instance.deployment.sceneUuid, boundScene.uuid);

    const rejected = harness();
    await assert.rejects(
      () => rejected.deployment.deploy(bp, { actorMode: "per-type", sceneUuid: otherScene.uuid, placeTokens: false }),
      (error) => error?.code === "BLUEPRINT_SCENE_MISMATCH"
    );
    assert.equal(rejected.factory.actors.length, 0);
  } finally {
    globalThis.fromUuid = previousFromUuid;
  }
});
