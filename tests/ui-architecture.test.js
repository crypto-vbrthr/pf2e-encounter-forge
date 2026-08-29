import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const uiSource = fs.readFileSync(new URL("../scripts/ui/encounter-forge-ui.js", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../scripts/ui/encounter-forge-app.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/encounter-forge-app.hbs", import.meta.url), "utf8");
const apiSource = fs.readFileSync(new URL("../scripts/api/public-api.js", import.meta.url), "utf8");

test("Encounter Forge installs a GM Actor Directory launcher with Foundry 14 fallbacks", () => {
  assert.match(uiSource, /renderActorDirectory/);
  assert.match(uiSource, /renderSidebarTab/);
  assert.match(uiSource, /renderApplicationV2/);
  assert.match(uiSource, /game\.user\?\.isGM/);
  assert.match(uiSource, /data-\$\{MODULE_ID\}-button/);
});

test("public API exposes the stable UI launcher", () => {
  assert.match(apiSource, /ui:\s*Object\.freeze/);
  assert.match(apiSource, /open:\s*\(\)\s*=>\s*openEncounterForge\(\)/);
});

test("blueprint UI includes persistence actions and base encounter fields", () => {
  for (const action of ["newBlueprint", "selectBlueprint", "saveBlueprint", "duplicateBlueprint", "deleteBlueprint", "refreshBlueprints"]) {
    assert.match(template, new RegExp(`data-action="${action}"`));
  }
  for (const field of ["name", "description", "partyLevel", "partySize", "threatTarget", "threatBudget"]) {
    assert.match(template, new RegExp(`name="${field}"`));
  }
  assert.match(appSource, /api\.blueprints\.save/);
  assert.match(appSource, /api\?\.blueprints\?\.delete/);
});
