import test from "node:test";
import assert from "node:assert/strict";
import { changeTouchesPath, hpChangeDetected } from "../scripts/utils/change-paths.js";

test("HP change detection accepts both flattened and nested Foundry update payloads", () => {
  assert.equal(hpChangeDetected({ "system.attributes.hp.value": 12 }), true);
  assert.equal(hpChangeDetected({ system: { attributes: { hp: { value: 12 } } } }), true);
  assert.equal(hpChangeDetected({ delta: { system: { attributes: { hp: { value: 12 } } } } }), true);
  assert.equal(hpChangeDetected({ system: { attributes: { ac: { value: 28 } } } }), false);
});

test("generic changed-path detection can match nested descendants without flagging siblings", () => {
  assert.equal(changeTouchesPath({ system: { attributes: { hp: { max: 50 } } } }, ["system.attributes.hp"]), true);
  assert.equal(changeTouchesPath({ system: { attributes: { perception: 20 } } }, ["system.attributes.hp"]), false);
});
