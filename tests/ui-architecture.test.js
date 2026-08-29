import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const uiSource = fs.readFileSync(new URL("../scripts/ui/encounter-forge-ui.js", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../scripts/ui/encounter-forge-app.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/encounter-forge-app.hbs", import.meta.url), "utf8");
const apiSource = fs.readFileSync(new URL("../scripts/api/public-api.js", import.meta.url), "utf8");
const browserSource = fs.readFileSync(new URL("../scripts/ui/participant-browser-app.js", import.meta.url), "utf8");
const forgeEditorSource = fs.readFileSync(new URL("../scripts/ui/forge-participant-editor-app.js", import.meta.url), "utf8");
const deploymentDialogSource = fs.readFileSync(new URL("../scripts/ui/deployment-dialog-app.js", import.meta.url), "utf8");
const deploymentTemplate = fs.readFileSync(new URL("../templates/deployment-dialog-app.hbs", import.meta.url), "utf8");

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
  for (const action of ["newBlueprint", "selectBlueprint", "saveBlueprint", "duplicateBlueprint", "deleteBlueprint", "refreshBlueprints", "detectParty", "browseParticipant", "addCreatureForgeParticipant", "addNpcForgeParticipant", "removeParticipant", "addGroup", "removeGroup"]) {
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


test("participant composition UI exposes Actor, Creature Forge, NPC Forge, groups, and budget feedback", () => {
  assert.match(template, /data-participant-drop/);
  assert.match(template, /data-budget-used/);
  assert.match(template, /data-budget-target/);
  assert.match(template, /data-participant-field="quantity"/);
  assert.match(template, /data-participant-field="role"/);
  assert.match(template, /data-participant-field="groupId"/);
  assert.match(appSource, /ParticipantBrowserApp/);
  assert.match(appSource, /ForgeParticipantEditorApp/);
  assert.match(appSource, /analyzeEncounterBudget/);
});


test("participant browser lazily reads world Actors and one Actor compendium index", () => {
  assert.match(browserSource, /game\.actors/);
  assert.match(browserSource, /pack\.getIndex/);
  assert.match(browserSource, /system\.details\.level\.value/);
  assert.match(browserSource, /Compendium\.\$\{pack\.collection\}\.Actor/);
});

test("Forge participant host consumes only public embedded editor contracts", () => {
  assert.match(forgeEditorSource, /api\.ui\?\.creatureEditor\?\.create/);
  assert.match(forgeEditorSource, /api\.ui\?\.createEditor/);
  assert.match(forgeEditorSource, /actorCreation:\s*false/);
  assert.match(forgeEditorSource, /createActor:\s*false/);
  assert.match(forgeEditorSource, /actionBar:\s*"host"/);
});

test("integration management UI shows detected modules and can toggle their use", () => {
  assert.match(template, /data-action="toggleIntegrations"/);
  assert.match(template, /data-action="toggleIntegration"/);
  assert.match(template, /integrationRows/);
  assert.match(appSource, /api\.integrations\.setEnabled/);
  assert.match(appSource, /entry\?\.usable/);
});


test("embedded Creature Forge uses the public full two-column layout and preserves a level fallback", () => {
  assert.match(forgeEditorSource, /layout:\s*"full"/);
  assert.match(forgeEditorSource, /mount\(container, \{ layout: "full"/);
  assert.doesNotMatch(forgeEditorSource, /layout:\s*"compact"/);
  assert.match(forgeEditorSource, /blueprint\.identity\?\.level \?\? request\.identity\?\.level/);
});

test("live XP UI exposes dynamic per-creature, quantity, warning, and support hooks", () => {
  assert.match(template, /data-participant-xp-each=/);
  assert.match(template, /data-participant-xp-quantity=/);
  assert.match(template, /data-budget-warning/);
  assert.match(appSource, /data-participant-xp-each/);
  assert.match(appSource, /data-participant-xp-quantity/);
  assert.match(appSource, /xpBox\?\.classList\?\.toggle/);
  assert.match(appSource, /warning\.hidden = budget\.unknownCount === 0/);
});

test("participant form synchronization targets participant cards rather than action buttons", () => {
  assert.equal(appSource.includes('querySelectorAll(".encounter-forge-participant[data-participant-id]")'), true);
  assert.equal(appSource.includes('querySelectorAll("[data-participant-id]")'), false);
  assert.equal(appSource.includes('querySelectorAll(".encounter-forge-group-row[data-group-id]")'), true);
});


test("in-place participant rerenders preserve the Encounter Forge scroll position", () => {
  assert.match(appSource, /#captureScrollState\(\)/);
  assert.match(appSource, /#restoreScrollState\(\)/);
  assert.match(appSource, /pendingScrollState/);
  assert.match(appSource, /editor\.scrollTop = state\.editorTop/);
  assert.match(appSource, /async #renderFresh\(\{ preserveScroll = true \} = \{\}\)/);
  assert.match(appSource, /next\.participants = .*filter/);
  assert.match(appSource, /await this\.#renderFresh\(\);/);
  assert.match(appSource, /#renderFresh\(\{ preserveScroll: false \}\)/);
});


test("Encounter Forge exposes prepared Encounter deployment from the Blueprint editor", () => {
  assert.match(template, /data-action="deployEncounter"/);
  assert.match(appSource, /EncounterDeploymentDialogApp/);
  assert.match(appSource, /api\?\.deployment\?\.deploy/);
  assert.match(deploymentTemplate, /name="sceneUuid"/);
  assert.match(deploymentTemplate, /name="actorFolderId"/);
  assert.match(deploymentTemplate, /name="createSubfolder"/);
  assert.match(deploymentTemplate, /name="subfolderName"/);
  assert.match(deploymentTemplate, /name="actorMode"/);
  assert.match(deploymentDialogSource, /ActorFolderService\(\)\.options\(\)/);
});

test("deployment dialog is rendered after the parent refresh and explicitly brought to front", () => {
  const deployMethod = appSource.slice(appSource.indexOf("static async deployEncounter()"), appSource.indexOf("static async saveBlueprint()"));
  const parentRefresh = deployMethod.indexOf("await this.#renderFresh()");
  const childRender = deployMethod.indexOf("await app.render({ force: true })");
  const bringToFront = deployMethod.indexOf("app.bringToFront?.()");
  assert.ok(parentRefresh >= 0);
  assert.ok(childRender > parentRefresh);
  assert.ok(bringToFront > childRender);
});

test("Scene deployment UI exposes automatic/manual Token placement and optional Combat preparation", () => {
  for (const field of ["placeTokens", "placementMode", "createCombat", "includePlayerTokens", "viewScene"]) {
    assert.match(deploymentTemplate, new RegExp(`name="${field}"`));
  }
  assert.match(deploymentTemplate, /value="staging-center"/);
  assert.match(deploymentTemplate, /value="interactive"/);
  assert.match(deploymentTemplate, /value="interactive"\s+selected/);
  assert.match(deploymentDialogSource, /placementMode: String\(read\("placementMode"\)\?\.value \?\? "interactive"\)/);
  assert.match(deploymentTemplate, /data-interactive-placement-note/);
  assert.match(deploymentDialogSource, /tokensEnabled/);
  assert.match(deploymentDialogSource, /placementMode\?\.value === "interactive"/);
  assert.match(deploymentDialogSource, /SCENE_PLACEMENT_CANCELLED/);
  assert.match(deploymentDialogSource, /createCombat:/);
  assert.match(deploymentDialogSource, /includePlayerTokens:/);
  assert.match(deploymentDialogSource, /viewScene:/);
  assert.match(appSource, /forgeElement\.hidden = true/);
  assert.match(appSource, /forgeElement\.hidden = previousHidden/);
  assert.match(appSource, /this\.bringToFront\?\.\(\)/);
  assert.match(appSource, /result\.tokens/);
  assert.match(appSource, /result\.combat/);
  assert.match(appSource, /!interactive && options\.viewScene/);
});


test("participant cards expose per-participant Token name and HP bar visibility controls", () => {
  assert.match(template, /data-participant-field="tokenDisplayName"/);
  assert.match(template, /data-participant-field="tokenDisplayBars"/);
  assert.match(template, /PF2E_ENCOUNTER_FORGE\.Participants\.TokenDisplay\.Name/);
  assert.match(template, /PF2E_ENCOUNTER_FORGE\.Participants\.TokenDisplay\.HpBar/);
  assert.match(appSource, /TOKEN_DISPLAY_MODE_KEYS/);
  assert.match(appSource, /participant\.tokenDisplay\.displayName/);
  assert.match(appSource, /participant\.tokenDisplay\.displayBars/);
  assert.match(appSource, /position:\s*\{\s*width:\s*1280,\s*height:\s*800\s*\}/);
});

test("Encounter Director provides a separate GM live-control surface and Combat Tracker launcher", () => {
  const directorUi = fs.readFileSync(new URL("../scripts/director/encounter-director-ui.js", import.meta.url), "utf8");
  const directorApp = fs.readFileSync(new URL("../scripts/director/encounter-director-app.js", import.meta.url), "utf8");
  const directorTemplate = fs.readFileSync(new URL("../templates/encounter-director-app.hbs", import.meta.url), "utf8");
  assert.match(directorUi, /renderCombatTracker/);
  assert.match(directorUi, /openEncounterDirector/);
  assert.match(directorUi, /fa-clapperboard/);
  for (const action of ["startEncounter", "pauseEncounter", "resumeEncounter", "completeEncounter", "reopenEncounter", "setPhase", "acceptDecision", "dismissDecision"]) {
    assert.match(directorTemplate, new RegExp(`data-action="${action}"`));
  }
  assert.match(directorApp, /runtime\?\.inspect/);
  assert.match(directorApp, /runtime\?\.resolveDecision/);
  assert.match(apiSource, /openDirector:/);
  assert.match(apiSource, /activate:/);
  assert.match(apiSource, /adjustObjective:/);
  assert.match(apiSource, /reopen:/);
  assert.match(directorUi, /entry\.data\?\.status === "completed"/);
});

test("Encounter Forge itself offers a quick Director launcher", () => {
  assert.match(template, /data-action="openDirector"/);
  assert.match(appSource, /static async openDirector/);
});


test("Encounter Director participant cards prioritize readable Actor identity and live HP presentation", () => {
  const directorApp = fs.readFileSync(new URL("../scripts/director/encounter-director-app.js", import.meta.url), "utf8");
  const directorTemplate = fs.readFileSync(new URL("../templates/encounter-director-app.hbs", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles/encounter-forge.css", import.meta.url), "utf8");
  assert.match(directorApp, /displayName/);
  assert.match(directorApp, /healthBand/);
  assert.match(directorApp, /width:\s*680,\s*height:\s*800/);
  assert.match(directorTemplate, /encounter-director-participant-portrait/);
  assert.match(directorTemplate, /encounter-director-participant-meta/);
  assert.match(directorTemplate, /encounter-director-participant-hp-row/);
  assert.match(directorTemplate, /role="meter"/);
  assert.match(css, /data-health="critical"/);
});
