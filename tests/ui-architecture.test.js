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
  for (const action of ["newBlueprint", "selectBlueprint", "saveBlueprint", "duplicateBlueprint", "deleteBlueprint", "refreshBlueprints", "detectParty"]) {
    assert.match(template, new RegExp(`data-action="${action}"`));
  }
  for (const field of ["name", "description", "partyLevel", "partySize", "threatTarget", "threatBudget"]) {
    assert.match(template, new RegExp(`name="${field}"`));
  }
  assert.match(appSource, /api\.blueprints\.save/);
  assert.match(appSource, /api\?\.blueprints\?\.delete/);
});


test("blueprint UI can auto-detect and refresh the PF2e player party", () => {
  assert.match(template, /data-action="detectParty"/);
  assert.match(template, /partyDetection\.averageLevelText/);
  assert.match(appSource, /api\?\.party\?\.detect/);
  assert.match(appSource, /detection\.partyLevel/);
  assert.match(appSource, /detection\.size/);
});

test("editor sections flow vertically without grid row overlap", () => {
  const css = fs.readFileSync(new URL("../styles/encounter-forge.css", import.meta.url), "utf8");
  const editorBlocks = [...css.matchAll(/\.encounter-forge-editor\s*\{([\s\S]*?)\}/g)].map((match) => match[0]);
  const layoutBlock = editorBlocks.find((block) => /display:\s*block/.test(block)) ?? "";
  assert.match(layoutBlock, /display:\s*block/);
  assert.match(layoutBlock, /overflow-y:\s*auto/);
  assert.doesNotMatch(layoutBlock, /grid-template-rows/);
});
