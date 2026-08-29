import test from "node:test";
import assert from "node:assert/strict";
import { createEncounterBlueprint } from "../scripts/model/encounter-blueprint.js";
import { createEncounterInstance } from "../scripts/model/encounter-instance.js";
import { SceneDeploymentService } from "../scripts/deployment/scene-deployment-service.js";
import { MODULE_ID } from "../scripts/constants.js";

function blueprint() {
  return createEncounterBlueprint({
    id: "scene-encounter",
    name: "Scene Encounter",
    participants: [
      { id: "boss", name: "Boss", source: { type: "fake" }, quantity: 1, groupId: "leaders" },
      { id: "guard", name: "Guard", source: { type: "fake" }, quantity: 3, groupId: "guards" }
    ],
    groups: [
      { id: "leaders", name: "Leaders" },
      { id: "guards", name: "Guards" }
    ]
  });
}

function actor(id, { width = 1, height = 1 } = {}) {
  return {
    id,
    uuid: `Actor.${id}`,
    name: id,
    prototypeToken: { width, height },
    async getTokenDocument(overrides = {}) {
      return {
        toObject() {
          return { name: id, width, height, hidden: false, flags: {}, ...overrides };
        }
      };
    }
  };
}

function sceneHarness() {
  let tokenIndex = 0;
  const createdSources = [];
  const deletedTokenIds = [];
  const updates = [];
  const pcToken = { id: "pc-1", actorId: "pc-a", actor: { id: "pc-a", type: "character" }, hidden: false };
  const scene = {
    id: "scene-1",
    uuid: "Scene.scene-1",
    name: "Arena",
    documentName: "Scene",
    width: 2400,
    height: 1600,
    grid: { size: 100 },
    flags: {},
    tokens: [pcToken],
    async createEmbeddedDocuments(type, sources) {
      assert.equal(type, "Token");
      createdSources.push(...structuredClone(sources));
      return sources.map((source) => {
        tokenIndex += 1;
        return {
          id: `t${tokenIndex}`,
          uuid: `Scene.scene-1.Token.t${tokenIndex}`,
          documentName: "Token",
          parent: scene,
          actorId: source.actorId,
          actorLink: source.actorLink,
          x: source.x,
          y: source.y,
          hidden: Boolean(source.hidden),
          flags: structuredClone(source.flags),
          updates: [],
          async update(data) { this.updates.push(data); }
        };
      });
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "Token");
      deletedTokenIds.push(...ids);
    },
    async update(data) { updates.push(data); }
  };
  return { scene, createdSources, deletedTokenIds, updates };
}

function assignActors(instance, actors) {
  for (const participant of instance.participants) {
    participant.actorUuid = participant.templateId === "boss" ? actors[0].uuid : actors[1].uuid;
  }
}

test("scene deployment creates one linked runtime Token per participant and records placement", async () => {
  const bp = blueprint();
  const instance = createEncounterInstance(bp, { actorMode: "per-type", sceneUuid: "Scene.scene-1" });
  const actors = [actor("boss"), actor("guard", { width: 2, height: 2 })];
  assignActors(instance, actors);
  const h = sceneHarness();
  const service = new SceneDeploymentService();

  const result = await service.deploy(instance, { scene: h.scene, actors });
  assert.equal(result.tokens.length, 4);
  assert.equal(instance.deployment.tokenUuids.length, 4);
  assert.equal(instance.deployment.placementMode, "staging-center");
  assert.ok(instance.deployment.tokensPlacedAt);
  assert.deepEqual(instance.participants.map((entry) => entry.state), ["ready", "ready", "ready", "ready"]);
  assert.ok(instance.participants.every((entry) => entry.tokenUuid?.startsWith("Scene.scene-1.Token.")));
  assert.ok(h.createdSources.every((source) => source.actorLink === false));
  assert.deepEqual(h.createdSources.map((source) => source.flags[MODULE_ID].participant.participantId), instance.participants.map((entry) => entry.id));
  assert.ok(h.createdSources.every((source) => Number.isFinite(source.x) && Number.isFinite(source.y)));
});

test("per-participant Actor mode creates linked Tokens", async () => {
  const bp = createEncounterBlueprint({
    id: "individuals",
    name: "Individuals",
    participants: [
      { id: "a", name: "A", source: { type: "fake" }, quantity: 1 },
      { id: "b", name: "B", source: { type: "fake" }, quantity: 1 }
    ]
  });
  const instance = createEncounterInstance(bp, { actorMode: "per-participant", sceneUuid: "Scene.scene-1" });
  const actors = [actor("a"), actor("b")];
  instance.participants[0].actorUuid = actors[0].uuid;
  instance.participants[1].actorUuid = actors[1].uuid;
  const h = sceneHarness();
  const service = new SceneDeploymentService();

  await service.deploy(instance, { scene: h.scene, actors });
  assert.ok(h.createdSources.every((source) => source.actorLink === true));
});


test("interactive Scene deployment delegates placement and persists manually chosen coordinates and rotation", async () => {
  const bp = blueprint();
  const instance = createEncounterInstance(bp, { actorMode: "per-type", sceneUuid: "Scene.scene-1" });
  const actors = [actor("boss"), actor("guard")];
  assignActors(instance, actors);
  const h = sceneHarness();
  const calls = [];
  const interactivePlacement = {
    async place({ scene, sources, placements }) {
      calls.push({ scene, sources: structuredClone(sources), participantIds: placements.map((entry) => entry.participant.id) });
      return sources.map((source, index) => ({
        id: `manual-${index + 1}`,
        uuid: `Scene.scene-1.Token.manual-${index + 1}`,
        documentName: "Token",
        parent: scene,
        actorId: source.actorId,
        x: 150 + index * 125,
        y: 325 + index * 50,
        rotation: index * 30,
        flags: structuredClone(source.flags),
        async update() {}
      }));
    }
  };
  const service = new SceneDeploymentService({ interactivePlacement });

  const result = await service.deploy(instance, { scene: h.scene, actors, placementMode: "interactive" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].scene, h.scene);
  assert.equal(result.tokens.length, 4);
  assert.equal(h.createdSources.length, 0, "interactive placement must not use automatic Scene token creation");
  assert.equal(instance.deployment.placementMode, "interactive");
  assert.deepEqual(instance.participants.map((entry) => entry.runtime.placement.mode), ["interactive", "interactive", "interactive", "interactive"]);
  assert.deepEqual(instance.participants.map((entry) => entry.runtime.placement.rotation), [0, 30, 60, 90]);
  assert.deepEqual(instance.participants.map((entry) => entry.runtime.placement.x), [150, 275, 400, 525]);
});

test("optional Combat preparation adds opponent Tokens and existing PC Tokens without starting combat", async () => {
  const combats = [];
  class FakeCombat {
    static async create(data) {
      const combat = {
        id: "combat-1",
        uuid: "Combat.combat-1",
        data,
        combatants: [],
        updates: [],
        deleted: false,
        async createEmbeddedDocuments(type, rows) {
          assert.equal(type, "Combatant");
          this.combatants.push(...structuredClone(rows));
          return rows;
        },
        async update(update) { this.updates.push(update); },
        async delete() { this.deleted = true; }
      };
      combats.push(combat);
      return combat;
    }
  }

  const bp = blueprint();
  const instance = createEncounterInstance(bp, { actorMode: "per-type", sceneUuid: "Scene.scene-1" });
  const actors = [actor("boss"), actor("guard")];
  assignActors(instance, actors);
  const h = sceneHarness();
  const service = new SceneDeploymentService({ CombatClass: FakeCombat });

  const result = await service.deploy(instance, { scene: h.scene, actors, createCombat: true, includePlayerTokens: true });
  assert.equal(combats.length, 1);
  assert.equal(result.combat, combats[0]);
  assert.equal(combats[0].data.active, false);
  assert.equal(combats[0].combatants.length, 5);
  assert.ok(combats[0].combatants.some((entry) => entry.tokenId === "pc-1"));
  assert.equal(instance.deployment.combatUuid, "Combat.combat-1");
  assert.ok(instance.deployment.combatPreparedAt);
  assert.equal(instance.deployment.includePlayerTokensInCombat, true);
});

test("scene deployment rolls Tokens back when Combat preparation fails", async () => {
  class BrokenCombat {
    static async create() { throw new Error("combat failed"); }
  }
  const bp = blueprint();
  const instance = createEncounterInstance(bp, { actorMode: "per-type", sceneUuid: "Scene.scene-1" });
  const actors = [actor("boss"), actor("guard")];
  assignActors(instance, actors);
  const h = sceneHarness();
  const service = new SceneDeploymentService({ CombatClass: BrokenCombat });

  await assert.rejects(() => service.deploy(instance, { scene: h.scene, actors, createCombat: true }), /combat failed/);
  assert.deepEqual(h.deletedTokenIds, ["t1", "t2", "t3", "t4"]);
});

test("stamping Scene deployment references stores Instance UUID on Scene, Tokens and Combat", async () => {
  const bp = blueprint();
  const instance = createEncounterInstance(bp, { actorMode: "per-type", sceneUuid: "Scene.scene-1" });
  const actors = [actor("boss"), actor("guard")];
  assignActors(instance, actors);
  const h = sceneHarness();
  const service = new SceneDeploymentService();
  const result = await service.deploy(instance, { scene: h.scene, actors });

  await service.stampReferences({ instance, instanceUuid: "JournalEntry.instance", scene: h.scene, tokens: result.tokens });
  assert.equal(result.tokens[0].updates[0][`flags.${MODULE_ID}.participant.instanceUuid`], "JournalEntry.instance");
  const sceneFlag = h.updates[0][`flags.${MODULE_ID}.instances`];
  assert.equal(sceneFlag[instance.id].instanceUuid, "JournalEntry.instance");
});


test("Scene deployment applies participant Token name and HP-bar visibility without changing Actor prototypes", async () => {
  const bp = createEncounterBlueprint({
    id: "token-display",
    name: "Token Display",
    participants: [{
      id: "guard",
      name: "Guard",
      source: { type: "fake" },
      quantity: 1,
      tokenDisplay: { displayName: "ALWAYS", displayBars: "HOVER", hpBarAttribute: "attributes.hp" }
    }]
  });
  const instance = createEncounterInstance(bp, { actorMode: "per-type", sceneUuid: "Scene.scene-1" });
  const guard = actor("guard");
  guard.prototypeToken.displayName = 0;
  guard.prototypeToken.displayBars = 0;
  instance.participants[0].actorUuid = guard.uuid;
  const h = sceneHarness();
  const service = new SceneDeploymentService();

  await service.deploy(instance, { scene: h.scene, actors: [guard] });
  assert.equal(h.createdSources[0].displayName, 50);
  assert.equal(h.createdSources[0].displayBars, 30);
  assert.equal(h.createdSources[0].bar1.attribute, "attributes.hp");
  assert.equal(guard.prototypeToken.displayName, 0);
  assert.equal(guard.prototypeToken.displayBars, 0);
});

test("Scene deployment preserves prototype Token display settings when participant uses inherit", async () => {
  const bp = createEncounterBlueprint({
    id: "token-inherit",
    name: "Token Inherit",
    participants: [{ id: "guard", name: "Guard", source: { type: "fake" }, quantity: 1 }]
  });
  const instance = createEncounterInstance(bp, { actorMode: "per-type", sceneUuid: "Scene.scene-1" });
  const guard = actor("guard");
  guard.getTokenDocument = async (overrides = {}) => ({
    toObject() { return { name: "guard", hidden: false, displayName: 40, displayBars: 20, bar1: { attribute: "custom.resource" }, flags: {}, ...overrides }; }
  });
  instance.participants[0].actorUuid = guard.uuid;
  const h = sceneHarness();
  const service = new SceneDeploymentService();

  await service.deploy(instance, { scene: h.scene, actors: [guard] });
  assert.equal(h.createdSources[0].displayName, 40);
  assert.equal(h.createdSources[0].displayBars, 20);
  assert.equal(h.createdSources[0].bar1.attribute, "custom.resource");
});
