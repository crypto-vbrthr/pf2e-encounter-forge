import test from "node:test";
import assert from "node:assert/strict";
import { createEncounterBlueprint } from "../scripts/model/encounter-blueprint.js";
import { createEncounterInstance } from "../scripts/model/encounter-instance.js";
import { blueprintVisibleOnScene, instanceVisibleOnScene } from "../scripts/utils/scene-binding.js";

test("unbound Blueprints are visible on every Scene while bound Blueprints only match their Scene", () => {
  const unbound = createEncounterBlueprint({ id: "global", name: "Global" });
  const bound = createEncounterBlueprint({ id: "crypt", name: "Crypt", sceneBinding: { sceneId: "s1", sceneName: "Crypt" } });
  assert.equal(blueprintVisibleOnScene(unbound, "s1"), true);
  assert.equal(blueprintVisibleOnScene(unbound, "s2"), true);
  assert.equal(blueprintVisibleOnScene(bound, "s1"), true);
  assert.equal(blueprintVisibleOnScene(bound, "s2"), false);
  assert.equal(blueprintVisibleOnScene(bound, null), false);
});

test("Instance visibility follows the frozen Blueprint Scene binding snapshot", () => {
  const bound = createEncounterBlueprint({ id: "crypt", name: "Crypt", sceneBinding: { sceneId: "s1", sceneName: "Crypt" } });
  const instance = createEncounterInstance(bound, { id: "run-1", sceneUuid: "Scene.s1" });
  assert.equal(instanceVisibleOnScene({ data: instance }, { sceneId: "s1" }), true);
  assert.equal(instanceVisibleOnScene({ data: instance }, { sceneId: "s2" }), false);
});
