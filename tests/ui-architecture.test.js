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
const flowSource = fs.readFileSync(new URL("../scripts/engine/encounter-flow.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles/encounter-forge.css", import.meta.url), "utf8");

const directorUiSource = fs.readFileSync(new URL("../scripts/director/encounter-director-ui.js", import.meta.url), "utf8");
const instanceManagerSource = fs.readFileSync(new URL("../scripts/director/encounter-instance-manager-app.js", import.meta.url), "utf8");
const instanceManagerTemplate = fs.readFileSync(new URL("../templates/encounter-instance-manager-app.hbs", import.meta.url), "utf8");

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

test("Encounter Flow authoring exposes phases, objectives, actions, triggers, conditions and validation", () => {
  for (const action of ["addPhase", "removePhase", "movePhaseUp", "movePhaseDown", "addObjective", "removeObjective", "addFlowAction", "removeFlowAction", "addTrigger", "removeTrigger", "addTriggerCondition", "removeTriggerCondition"]) {
    assert.match(template, new RegExp(`data-action="${action}"`));
  }
  for (const field of ["data-phase-field", "data-objective-field", "data-flow-action-field", "data-trigger-field", "data-trigger-condition-field", "data-trigger-action"]) {
    assert.match(template, new RegExp(field));
  }
  assert.match(appSource, /analyzeEncounterFlow/);
  assert.match(apiSource, /flow:\s*Object\.freeze/);
  assert.match(apiSource, /actionTypes:\s*FLOW_ACTION_TYPES/);
});


test("flow reference labels refresh live while names are edited", () => {
  assert.match(appSource, /#refreshReferenceLabels\(\)/);
  assert.match(appSource, /syncAndRefreshReferences/);
  assert.match(appSource, /data-flow-action-field=\"phaseId\".*data-trigger-field=\"activePhaseId\"/s);
  assert.match(appSource, /data-flow-action-field=\"objectiveId\"/);
  assert.match(appSource, /data-trigger-field=\"participantId\"/);
  assert.match(appSource, /data-participant-field=\"groupId\"/);
  assert.match(template, /data-trigger-action-label=\"\{\{id\}\}\"/);
});

test("Encounter Forge exposes and safeguards the onboarding example encounter", () => {
  assert.match(template, /data-action=\"createExampleBlueprint\"/);
  assert.match(template, /encounter-forge-example-banner/);
  assert.match(template, /hasPlaceholderParticipants/);
  assert.match(appSource, /#seedInitialExampleIfNeeded/);
  assert.match(appSource, /createExampleEncounterBlueprint/);
  assert.match(appSource, /participant\.source\?\.type === \"example\"/);
});


test("encounter library toolbar is labeled and overflow-safe", () => {
  const libraryTemplate = fs.readFileSync(new URL("../templates/encounter-forge-app.hbs", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles/encounter-forge.css", import.meta.url), "utf8");
  assert.match(libraryTemplate, /encounter-forge-library-section-label/);
  assert.match(libraryTemplate, /PF2E_ENCOUNTER_FORGE\.Library\.Action\.New/);
  assert.match(libraryTemplate, /PF2E_ENCOUNTER_FORGE\.Library\.Action\.Director/);
  assert.match(css, /encounter-forge-library-actions[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /encounter-forge-library[\s\S]*overflow:\s*hidden/);
});


test("saved Encounter rows are left-aligned cards with direct delete controls", () => {
  const libraryTemplate = fs.readFileSync(new URL("../templates/encounter-forge-app.hbs", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles/encounter-forge.css", import.meta.url), "utf8");
  assert.match(libraryTemplate, /encounter-forge-blueprint-select/);
  assert.match(libraryTemplate, /encounter-forge-blueprint-delete/);
  assert.match(libraryTemplate, /data-action="deleteBlueprint" data-blueprint-id="\{\{id\}\}"/);
  assert.match(css, /encounter-forge-blueprint-select[\s\S]*text-align:\s*left\s*!important/);
  assert.match(css, /encounter-forge-blueprint-name,[\s\S]*encounter-forge-blueprint-meta[\s\S]*text-align:\s*left\s*!important/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) 2rem/);
  assert.match(appSource, /target\?\.dataset\?\.blueprintId \|\| this\.selectedBlueprintId/);
});


test("Flow authoring exposes round-end and objective trigger selectors", () => {
  const flowSource = fs.readFileSync(new URL("../scripts/engine/encounter-flow.js", import.meta.url), "utf8");
  assert.match(template, /data-trigger-field="objectiveId"/);
  assert.match(flowSource, /"combat\.roundEnded"/);
  assert.match(flowSource, /"participant\.hpDecreased"/);
  assert.match(flowSource, /"participant\.hpIncreased"/);
  assert.match(flowSource, /"objective\.progressChanged"/);
  assert.match(flowSource, /"objective\.completed"/);
});

test("Flow authoring exposes external Forge runtime actions with target scopes and embedded configuration", () => {
  const integrationEditor = fs.readFileSync(new URL("../scripts/ui/integration-action-editor-app.js", import.meta.url), "utf8");
  const integrationTemplate = fs.readFileSync(new URL("../templates/integration-action-editor-app.hbs", import.meta.url), "utf8");
  const actionService = fs.readFileSync(new URL("../scripts/runtime/action-service.js", import.meta.url), "utf8");
  const flowSource = fs.readFileSync(new URL("../scripts/engine/encounter-flow.js", import.meta.url), "utf8");
  assert.match(template, /data-action="configureFlowAction"/);
  assert.match(template, /data-flow-action-field="targetMode"/);
  assert.match(template, /data-flow-action-field="targetId"/);
  assert.match(template, /data-flow-action-field="enabled"/);
  for (const type of ["effect.apply", "aura.setEnabled", "affliction.apply", "loot.createActor"]) {
    assert.match(flowSource, new RegExp(type.replace(".", "\\.")));
    assert.match(actionService, new RegExp(type.replace(".", "\\.")));
  }
  assert.match(integrationEditor, /effectEditor\?\.create/);
  assert.match(integrationEditor, /auraEditor\?\.create/);
  assert.match(integrationEditor, /afflictionEditor\?\.create/);
  assert.match(integrationEditor, /createEmbeddedEditor/);
  assert.match(integrationTemplate, /data-integration-action-editor-mount/);
});


test("Encounter Director passively refreshes participant HP while an Encounter is still prepared", () => {
  const directorApp = fs.readFileSync(new URL("../scripts/director/encounter-director-app.js", import.meta.url), "utf8");
  assert.match(directorApp, /#subscribeDocuments\(\)/);
  assert.match(directorApp, /#registerDocumentHook\("updateActor"/);
  assert.match(directorApp, /#registerDocumentHook\("updateToken"/);
  assert.match(directorApp, /#isParticipantActor/);
  assert.match(directorApp, /#isParticipantToken/);
  assert.match(directorApp, /#hpChanged/);
  assert.match(directorApp, /this\.#scheduleRender\(\)/);
  assert.doesNotMatch(directorApp, /#subscribeDocuments[\s\S]{0,1200}runtime\?\.start/);
});

test("Encounter Director has a passive snapshot fallback for prepared-Encounter live participant refresh", () => {
  const directorApp = fs.readFileSync(new URL("../scripts/director/encounter-director-app.js", import.meta.url), "utf8");
  assert.match(directorApp, /#startPassiveObservation\(\)/);
  assert.match(directorApp, /setTimeout\(tick, 400\)/);
  assert.match(directorApp, /runtime\?\.inspect/);
  assert.match(directorApp, /lastObservationFingerprint/);
});

test("GM decision flow surfaces a Chat notice with a Director launcher", () => {
  const runtimeSource = fs.readFileSync(new URL("../scripts/runtime/encounter-runtime.js", import.meta.url), "utf8");
  const directorUi = fs.readFileSync(new URL("../scripts/director/encounter-director-ui.js", import.meta.url), "utf8");
  assert.match(runtimeSource, /#notifyDecisionInChat/);
  assert.match(runtimeSource, /data-pf2e-encounter-forge-open-director/);
  assert.match(runtimeSource, /whisper:\s*gmIds/);
  assert.match(directorUi, /renderChatMessage/);
  assert.match(directorUi, /data-pf2e-encounter-forge-open-director/);
});

test("completed Director state yields to a newly prepared redeployment and new triggers default to round end", () => {
  const directorApp = fs.readFileSync(new URL("../scripts/director/encounter-director-app.js", import.meta.url), "utf8");
  const directorUi = fs.readFileSync(new URL("../scripts/director/encounter-director-ui.js", import.meta.url), "utf8");
  assert.match(directorApp, /#preparedSuccessorId/);
  assert.match(directorApp, /candidate\.status !== "prepared"/);
  assert.match(directorUi, /\["active", "paused", "prepared"\]\.includes\(runtimeStatus\.instanceStatus\)/);
  assert.match(appSource, /event:\s*"combat\.roundEnded"/);
});

test("Encounter Director exposes prepared actions as manual GM controls", () => {
  const directorTemplate = fs.readFileSync(new URL("../templates/encounter-director-app.hbs", import.meta.url), "utf8");
  const directorApp = fs.readFileSync(new URL("../scripts/director/encounter-director-app.js", import.meta.url), "utf8");
  const runtimeSource = fs.readFileSync(new URL("../scripts/runtime/encounter-runtime.js", import.meta.url), "utf8");
  const apiSource = fs.readFileSync(new URL("../scripts/api/public-api.js", import.meta.url), "utf8");
  assert.match(directorTemplate, /PF2E_ENCOUNTER_FORGE\.Director\.PreparedActions/);
  assert.match(directorTemplate, /data-action="runAction" data-action-id="\{\{id\}\}"/);
  assert.match(directorApp, /static async runAction/);
  assert.match(runtimeSource, /async executeAction\(actionOrId/);
  assert.match(apiSource, /executeAction:\s*\(actionOrId/);
});

test("Flow authoring can duplicate phases, objectives, actions, and safe-disabled triggers", () => {
  for (const action of ["duplicatePhase", "duplicateObjective", "duplicateFlowAction", "duplicateTrigger"]) {
    assert.match(template, new RegExp(`data-action="${action}"`));
    assert.match(appSource, new RegExp(`static async ${action}`));
  }
  assert.match(appSource, /source\.enabled = false/);
  assert.match(template, /PF2E_ENCOUNTER_FORGE\.Flow\.Duplicate/);
});

test("advanced Flow conditions expose AND/OR, NOT, context references, and readable summaries", () => {
  assert.match(template, /data-trigger-field="conditionMode"/);
  assert.match(template, /data-trigger-field="conditionObjectiveId"/);
  assert.match(template, /data-trigger-field="conditionGroupId"/);
  assert.match(template, /data-trigger-condition-field="negate"/);
  assert.match(template, /encounter-forge-condition-summary/);
  assert.match(appSource, /FLOW_CONDITION_MODES/);
  assert.match(apiSource, /conditionModes:\s*FLOW_CONDITION_MODES/);
});

test("Flow authoring visually separates individual phase, objective, action, and trigger entries", () => {
  const css = fs.readFileSync(new URL("../styles/encounter-forge.css", import.meta.url), "utf8");
  for (const selector of [
    ".encounter-forge-phase-row",
    ".encounter-forge-objective-row",
    ".encounter-forge-flow-action-row",
    ".encounter-forge-trigger-row"
  ]) {
    assert.match(css, new RegExp(selector.replaceAll(".", "\\.") + "[\\s\\S]*border-color:\\s*rgba\\("));
  }
  assert.match(css, /border:\s*2px solid rgba\(/);
  assert.match(css, /encounter-forge-flow-list \{ display: grid; gap: 0\.6rem;[\s\S]*?\}/);
  assert.match(css, /focus-within/);
});


test("Flow authoring exposes per-condition participant state references", () => {
  assert.match(template, /data-trigger-condition-field="participantId"/);
  assert.match(appSource, /FLOW_PARTICIPANT_CONTEXT_FIELDS/);
  assert.match(flowSource, /participantHpBelowMax/);
  assert.match(flowSource, /FLOW_CONDITION_PARTICIPANT_REQUIRED/);
});

test("participant and group-state Trigger conditions cannot widen the Blueprint editor", () => {
  const css = fs.readFileSync(new URL("../styles/encounter-forge.css", import.meta.url), "utf8");
  assert.match(css, /\.encounter-forge-editor\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-x:\s*hidden;/);
  assert.match(css, /\.encounter-forge-trigger-condition\s*\{[\s\S]*?grid-template-areas:[\s\S]*?"negate field operator remove"[\s\S]*?"\. value value remove"/);
  assert.match(css, /\.encounter-forge-trigger-condition\.has-participant-context\s*\{[\s\S]*?"negate field participant remove"[\s\S]*?"\. operator value remove"/);
  assert.match(css, /\.encounter-forge-trigger-condition\.has-group-participant-context\s*\{[\s\S]*?"negate field group remove"[\s\S]*?"\. groupmatch operator remove"/);
  assert.match(css, /\.encounter-forge-condition-group-control\s*\{\s*grid-area:\s*group;/);
  assert.doesNotMatch(css, /\.encounter-forge-trigger-condition[\s\S]{0,300}minmax\(9rem/);
  assert.match(css, /\.encounter-forge-flow-panel input,[\s\S]*?width:\s*100%;/);
});

test("condition logic labels can be displayed verbosely or as AND/OR per client", () => {
  const settingsSource = fs.readFileSync(new URL("../scripts/ui/ui-settings.js", import.meta.url), "utf8");
  const mainSource = fs.readFileSync(new URL("../scripts/main.js", import.meta.url), "utf8");
  assert.match(settingsSource, /CONDITION_LOGIC_DISPLAY_SETTING\s*=\s*"ui\.conditionLogicDisplay"/);
  assert.match(settingsSource, /scope:\s*"client"/);
  assert.match(settingsSource, /config:\s*true/);
  assert.match(settingsSource, /verbose/);
  assert.match(settingsSource, /operators/);
  assert.match(settingsSource, /AND \/ OR/);
  assert.match(mainSource, /registerEncounterForgeUiSettings\(\)/);
  assert.match(appSource, /getConditionLogicDisplayMode\(\)/);
  assert.match(appSource, /ConditionMode\.\$\{conditionLogicDisplayMode\}/);
  assert.match(uiSource, /pf2eEncounterForgeConditionLogicDisplayChanged/);
});


test("group-member state conditions expose explicit group evaluation and hide irrelevant shared context selectors", () => {
  assert.match(template, /\{\{#if usesObjectiveConditionContext\}\}/);
  assert.match(template, /\{\{#if usesGroupConditionContext\}\}/);
  assert.match(template, /data-trigger-condition-field="groupId"/);
  assert.match(template, /data-trigger-condition-field="groupMatchMode"/);
  assert.match(template, /data-trigger-condition-field="groupMatchCount"/);
  assert.match(appSource, /FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS/);
  assert.match(appSource, /FLOW_GROUP_MATCH_MODES/);
  assert.match(flowSource, /groupParticipantHpPercent/);
  assert.match(apiSource, /groupMatchModes:\s*FLOW_GROUP_MATCH_MODES/);
});

test("Flow actions expose persistent delayed execution controls and Director schedule management", () => {
  assert.match(template, /data-flow-action-field="timingMode"/);
  assert.match(template, /data-flow-action-field="timingAmount"/);
  assert.match(appSource, /FLOW_ACTION_TIMING_MODES/);
  assert.match(apiSource, /actionTimingModes:\s*FLOW_ACTION_TIMING_MODES/);
  const directorTemplate = fs.readFileSync(new URL("../templates/encounter-director-app.hbs", import.meta.url), "utf8");
  const directorSource = fs.readFileSync(new URL("../scripts/director/encounter-director-app.js", import.meta.url), "utf8");
  assert.match(directorTemplate, /data-action="runScheduledActionNow"/);
  assert.match(directorTemplate, /data-action="cancelScheduledAction"/);
  assert.match(directorSource, /scheduledActions/);
});

test("Flow authoring exposes logical zones bound to Foundry Scene Regions and spatial Trigger controls", () => {
  assert.match(template, /PF2E_ENCOUNTER_FORGE\.Flow\.ZonesTitle/);
  assert.match(template, /data-zone-field="regionUuid"/);
  assert.match(template, /data-action="refreshRegions"/);
  assert.match(template, /\{\{#if isRegionEvent\}\}/);
  assert.match(template, /data-trigger-field="zoneId"/);
  assert.match(template, /data-trigger-field="regionTokenScope"/);
  assert.match(appSource, /FLOW_REGION_EVENT_TYPES/);
  assert.match(appSource, /FLOW_REGION_TOKEN_SCOPES/);
  assert.match(flowSource, /region\.tokenEntered/);
  assert.match(flowSource, /region\.tokenExited/);
  assert.match(flowSource, /regionPlayerCharacterCount/);
  assert.match(apiSource, /regionEventTypes:\s*FLOW_REGION_EVENT_TYPES/);
  assert.match(apiSource, /regionTokenScopes:\s*FLOW_REGION_TOKEN_SCOPES/);
  assert.match(apiSource, /regionConditionFields:\s*FLOW_REGION_CONDITION_FIELDS/);
});


test("Scene Regions can be adopted directly while the Encounter editor stays open", () => {
  assert.match(template, /data-region-quick-add/);
  assert.match(appSource, /DIRECT_REGION_OPTION_PREFIX/);
  assert.match(appSource, /createRegion/);
  assert.match(appSource, /deleteRegion/);
  assert.match(appSource, /updateRegion/);
  assert.match(appSource, /canvasReady/);
  assert.match(appSource, /#bindTriggerToSceneRegion/);
  assert.match(appSource, /#addZoneFromRegion/);
});

test("Linked Trigger action checkboxes keep their labels visually attached", () => {
  assert.match(css, /encounter-forge-trigger-actions-list input\[type="checkbox"\]/);
  assert.match(css, /width:\s*1rem\s*!important/);
  assert.match(css, /encounter-forge-trigger-actions-list label[\s\S]*display:\s*inline-flex\s*!important/);
});

test("Encounter Director asks the GM to choose when multiple runnable Instances exist and exposes Instance cleanup", () => {
  const directorUi = fs.readFileSync(new URL("../scripts/director/encounter-director-ui.js", import.meta.url), "utf8");
  const directorApp = fs.readFileSync(new URL("../scripts/director/encounter-director-app.js", import.meta.url), "utf8");
  const directorTemplate = fs.readFileSync(new URL("../templates/encounter-director-app.hbs", import.meta.url), "utf8");
  const managerApp = fs.readFileSync(new URL("../scripts/director/encounter-instance-manager-app.js", import.meta.url), "utf8");
  const managerTemplate = fs.readFileSync(new URL("../templates/encounter-instance-manager-app.hbs", import.meta.url), "utf8");
  assert.match(directorUi, /findEncounterDirectorCandidates/);
  assert.match(directorUi, /candidates\.length > 1/);
  assert.match(directorUi, /openEncounterInstanceManager/);
  assert.match(directorTemplate, /data-action="manageInstances"/);
  assert.match(directorTemplate, /data-action="purgeCompletedInstances"/);
  assert.match(directorApp, /purgeCompletedInstances/);
  assert.match(directorApp, /status === "completed"/);
  assert.match(directorApp, /CompletedInstancesDeleted/);
  assert.match(directorApp, /openInstanceManager/);
  assert.match(managerTemplate, /data-action="openInstance"/);
  assert.match(managerTemplate, /data-action="deleteInstance"/);
  assert.match(managerTemplate, /data-action="purgeOrphans"/);
  assert.match(managerTemplate, /data-action="purgeCompleted"/);
  assert.match(managerApp, /purgeCompleted/);
  assert.match(managerApp, /blueprintEntry/);
  assert.match(managerApp, /orphaned/);
  assert.match(managerApp, /api\.instances\?\.delete/);
  assert.match(managerApp, /api\.runtime\?\.stop/);
});


test("Director falls back to Blueprint preparation when no stored Instance exists", () => {
  assert.match(directorUiSource, /blueprints\?\.list\?\.\(\)/);
  assert.match(directorUiSource, /openEncounterInstanceManager/);
  assert.match(instanceManagerSource, /EncounterDeploymentDialogApp/);
  assert.match(instanceManagerSource, /static async createInstance/);
  assert.match(instanceManagerSource, /api\?\.deployment\?\.deploy/);
  assert.match(instanceManagerSource, /api\?\.ui\?\.openDirector/);
  assert.match(instanceManagerTemplate, /data-action="createInstance"/);
  assert.match(instanceManagerTemplate, /data-blueprint-id="\{\{id\}\}"/);
  assert.match(instanceManagerSource, /forceNewInstance:\s*true/);
  assert.match(appSource, /PreparedInstanceReused/);
});

test("Blueprint archive separates consumed encounters from Director preparation without deleting them", () => {
  const directorUi = fs.readFileSync(new URL("../scripts/director/encounter-director-ui.js", import.meta.url), "utf8");
  const managerApp = fs.readFileSync(new URL("../scripts/director/encounter-instance-manager-app.js", import.meta.url), "utf8");
  const editorTemplate = fs.readFileSync(new URL("../templates/encounter-forge-app.hbs", import.meta.url), "utf8");
  const publicApi = fs.readFileSync(new URL("../scripts/api/public-api.js", import.meta.url), "utf8");
  assert.match(editorTemplate, /data-action="archiveBlueprint"/);
  assert.match(editorTemplate, /data-action="restoreBlueprint"/);
  assert.match(editorTemplate, /archivedBlueprints/);
  assert.match(appSource, /metadata\?\.archivedAt/);
  assert.match(publicApi, /archive:\s*\(idOrUuid\)/);
  assert.match(publicApi, /restore:\s*\(idOrUuid\)/);
  assert.match(directorUi, /activeBlueprintEntries/);
  assert.match(directorUi, /!entry\?\.data\?\.metadata\?\.archivedAt/);
  assert.match(managerApp, /!entry\?\.data\?\.metadata\?\.archivedAt/);
});

test("Scene-bound Blueprints are authored in the editor and filtered by Director on the current Scene", () => {
  const directorUi = fs.readFileSync(new URL("../scripts/director/encounter-director-ui.js", import.meta.url), "utf8");
  const managerApp = fs.readFileSync(new URL("../scripts/director/encounter-instance-manager-app.js", import.meta.url), "utf8");
  const deploymentService = fs.readFileSync(new URL("../scripts/deployment/deployment-service.js", import.meta.url), "utf8");
  const editorTemplate = fs.readFileSync(new URL("../templates/encounter-forge-app.hbs", import.meta.url), "utf8");
  assert.match(editorTemplate, /name="sceneBindingId"/);
  assert.match(directorUi, /blueprintVisibleOnScene/);
  assert.match(directorUi, /instanceVisibleOnScene/);
  assert.match(directorUi, /Hooks\.on\("canvasReady", handleDirectorSceneChange\)/);
  assert.match(managerApp, /sceneFiltered/);
  assert.match(deploymentService, /BLUEPRINT_SCENE_MISMATCH/);
});

test("Director final-state controls are read-only and snapshot-backed Instances remain openable after Blueprint deletion", () => {
  const directorTemplate = fs.readFileSync(new URL("../templates/encounter-director-app.hbs", import.meta.url), "utf8");
  const directorSource = fs.readFileSync(new URL("../scripts/director/encounter-director-app.js", import.meta.url), "utf8");
  const managerSource = fs.readFileSync(new URL("../scripts/director/encounter-instance-manager-app.js", import.meta.url), "utf8");
  const managerTemplate = fs.readFileSync(new URL("../templates/encounter-instance-manager-app.hbs", import.meta.url), "utf8");
  assert.match(directorSource, /readOnly/);
  assert.match(directorTemplate, /Director\.ReadOnlyNotice/);
  assert.match(directorTemplate, /\{\{#unless mutable\}\}disabled\{\{\/unless\}\}/);
  assert.match(managerSource, /snapshotAvailable/);
  assert.match(managerSource, /detached/);
  assert.match(managerTemplate, /InstanceManager\.SnapshotOnly/);
  assert.match(managerTemplate, /BlueprintSnapshotAvailable/);
});
