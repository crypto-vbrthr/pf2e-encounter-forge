import test from "node:test";
import assert from "node:assert/strict";
import { InteractiveTokenPlacementService } from "../scripts/deployment/interactive-token-placement-service.js";
import { EncounterForgeError } from "../scripts/utils/errors.js";

function token(id, source, scene) {
  return {
    id,
    uuid: `Scene.${scene.id}.Token.${id}`,
    documentName: "Token",
    parent: scene,
    actorId: source.actorId,
    x: source.x ?? 0,
    y: source.y ?? 0,
    rotation: source.rotation ?? 0
  };
}

test("interactive placement switches to the selected Scene and delegates sequential previews to Foundry TokenLayer.placeTokens", async () => {
  const sourceA = { actorId: "a1", x: 0, y: 0 };
  const sourceB = { actorId: "a2", x: 0, y: 0 };
  const scene = { id: "target", viewCalls: 0 };
  const calls = [];
  const canvas = {
    scene: { id: "other" },
    tokens: {
      activated: 0,
      released: 0,
      activate() { this.activated += 1; },
      releaseAll() { this.released += 1; },
      async placeTokens(sources, options) {
        calls.push({ sources: structuredClone(sources), options });
        options.onChange?.({ index: 0, count: sources.length });
        options.onChange?.({ index: 1, count: sources.length });
        assert.equal(options.preSkip?.({ index: 0 }), false);
        return sources.map((source, index) => token(`t${index + 1}`, { ...source, x: 100 + index * 100, y: 200, rotation: 45 * index }, scene));
      }
    }
  };
  scene.view = async () => { scene.viewCalls += 1; canvas.scene = scene; };

  const service = new InteractiveTokenPlacementService({ canvasRef: () => canvas, sceneReadyTimeout: 100 });
  const result = await service.place({
    scene,
    sources: [sourceA, sourceB],
    placements: [
      { participant: { id: "boss" }, actor: { name: "Boss" } },
      { participant: { id: "guard-1" }, actor: { name: "Guard" } }
    ]
  });

  assert.equal(scene.viewCalls, 1);
  assert.equal(canvas.tokens.activated, 1);
  assert.equal(canvas.tokens.released, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.allowRotation, true);
  assert.equal(calls[0].options.create, true);
  assert.deepEqual(result.map((entry) => [entry.x, entry.y, entry.rotation]), [[100, 200, 0], [200, 200, 45]]);
});

test("interactive placement treats Foundry dismiss/Esc as an explicit deployment cancellation", async () => {
  const scene = { id: "target" };
  const canvas = {
    scene,
    tokens: {
      activate() {},
      releaseAll() {},
      async placeTokens() { return []; }
    }
  };
  const service = new InteractiveTokenPlacementService({ canvasRef: canvas });
  await assert.rejects(
    () => service.place({ scene, sources: [{ actorId: "a1" }], placements: [{ participant: { id: "a" }, actor: { name: "A" } }] }),
    (error) => error instanceof EncounterForgeError && error.code === "SCENE_PLACEMENT_CANCELLED"
  );
});

test("interactive placement fails clearly when Foundry TokenLayer placement API is unavailable", async () => {
  const scene = { id: "target" };
  const service = new InteractiveTokenPlacementService({ canvasRef: { scene, tokens: {} } });
  await assert.rejects(
    () => service.place({ scene, sources: [{ actorId: "a1" }] }),
    (error) => error instanceof EncounterForgeError && error.code === "INTERACTIVE_TOKEN_PLACEMENT_UNAVAILABLE"
  );
});
