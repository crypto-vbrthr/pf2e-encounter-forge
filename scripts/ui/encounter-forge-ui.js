import { MODULE_ID } from "../constants.js";
import { EncounterForgeApp } from "./encounter-forge-app.js";

let app = null;

function localize(key, fallback = key) {
  try {
    const value = game.i18n.localize(key);
    return value === key ? fallback : value;
  } catch {
    return fallback;
  }
}

function clone(value) {
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return structuredClone(value);
}

function getApi() {
  return game.modules.get(MODULE_ID)?.api ?? null;
}

function getRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (html?.element instanceof HTMLElement) return html.element;
  return null;
}

function isActorDirectory(appRef, root) {
  const tabName = appRef?.tabName ?? appRef?.options?.tabName ?? appRef?.id ?? "";
  if (String(tabName).toLowerCase().includes("actor")) return true;
  return Boolean(root?.matches?.("#actors, .actors-directory") || root?.querySelector?.("#actors, .actors-directory"));
}

function regionDocumentUuid(region) {
  const sceneId = String(region?.parent?.id ?? region?.scene?.id ?? "").trim();
  const regionId = String(region?.id ?? "").trim();
  return String(region?.uuid ?? (sceneId && regionId ? `Scene.${sceneId}.Region.${regionId}` : "")).trim();
}

function sceneIdFromRegionUuid(regionUuid) {
  const match = /^Scene\.([^.]+)\.Region\.[^.]+$/.exec(String(regionUuid ?? ""));
  return match?.[1] ?? "";
}

function clearZoneBinding(zone) {
  if (!zone || typeof zone !== "object") return;
  delete zone.regionUuid;
  delete zone.regionName;
  delete zone.regionSceneId;
}

function clearRegionBinding(blueprint, regionUuid) {
  const target = String(regionUuid ?? "").trim();
  if (!target || !Array.isArray(blueprint?.zones)) return false;
  let changed = false;
  for (const zone of blueprint.zones) {
    if (String(zone?.regionUuid ?? "") !== target) continue;
    clearZoneBinding(zone);
    changed = true;
  }
  return changed;
}

function clearMissingSceneBindings(blueprint, sceneId, existingRegionUuids) {
  const targetSceneId = String(sceneId ?? "").trim();
  if (!targetSceneId || !Array.isArray(blueprint?.zones)) return false;
  let changed = false;
  for (const zone of blueprint.zones) {
    const regionUuid = String(zone?.regionUuid ?? "").trim();
    if (!regionUuid) continue;
    const bindingSceneId = String(zone?.regionSceneId ?? sceneIdFromRegionUuid(regionUuid)).trim();
    if (bindingSceneId !== targetSceneId || existingRegionUuids.has(regionUuid)) continue;
    clearZoneBinding(zone);
    changed = true;
  }
  return changed;
}

function applyCleanupToOpenApp(cleaner) {
  if (!app || typeof cleaner !== "function") return false;

  app.blueprints = (app.blueprints ?? []).map((entry) => {
    const copy = clone(entry);
    cleaner(copy);
    return copy;
  });

  const draftChanged = cleaner(app.draft);
  if (draftChanged) {
    // Treat the deleted Foundry document as an external data change rather than a
    // user edit. Mirroring the cleanup into the saved snapshot preserves any real
    // unsaved editor changes while preventing a clean editor from becoming dirty.
    try {
      const saved = JSON.parse(app.savedSnapshot);
      cleaner(saved);
      app.savedSnapshot = JSON.stringify(saved);
    } catch {}
  }
  return draftChanged;
}

async function persistBlueprintCleanup(cleaner) {
  const api = getApi();
  if (!api?.blueprints?.list || !api?.blueprints?.save || typeof cleaner !== "function") return false;
  let changed = false;
  for (const row of api.blueprints.list() ?? []) {
    const blueprint = clone(row?.data ?? row);
    if (!blueprint?.id || !cleaner(blueprint)) continue;
    await api.blueprints.save(blueprint);
    changed = true;
  }
  return changed;
}

async function removeDeletedRegionReferences(region) {
  if (!game.user?.isGM) return;
  const regionUuid = regionDocumentUuid(region);
  if (!regionUuid) return;
  const cleaner = (blueprint) => clearRegionBinding(blueprint, regionUuid);

  try {
    await persistBlueprintCleanup(cleaner);
    const draftChanged = applyCleanupToOpenApp(cleaner);
    if (app && (draftChanged || app.element)) await app.render({ force: true });
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to clean deleted Region references.`, error);
  }
}

async function removeAlreadyMissingCurrentSceneReferences() {
  if (!game.user?.isGM) return;
  const scene = globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? globalThis.game?.scenes?.active ?? null;
  const sceneId = String(scene?.id ?? "").trim();
  if (!sceneId) return;
  const regions = scene?.regions ?? scene?.getEmbeddedCollection?.("Region") ?? [];
  const existingRegionUuids = new Set(Array.from(regions ?? []).map((region) => regionDocumentUuid(region)).filter(Boolean));
  const cleaner = (blueprint) => clearMissingSceneBindings(blueprint, sceneId, existingRegionUuids);

  try {
    await persistBlueprintCleanup(cleaner);
    const draftChanged = applyCleanupToOpenApp(cleaner);
    if (app && draftChanged) await app.render({ force: true });
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to clean missing Region references.`, error);
  }
}

export async function openEncounterForge() {
  if (!game.user?.isGM) {
    ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.GMOnly", "Only the GM can open Encounter Forge."));
    return null;
  }

  if (!app) {
    app = new EncounterForgeApp();
    await app.initialize();
  }
  await removeAlreadyMissingCurrentSceneReferences();
  await app.render({ force: true });
  app.bringToFront?.();
  return app;
}

export function injectEncounterForgeButton(appRef, html) {
  if (!game.user?.isGM) return;
  const root = getRoot(html);
  if (!root || !isActorDirectory(appRef, root)) return;
  if (root.querySelector(`[data-${MODULE_ID}-button]`)) return;

  const createButton = root.querySelector('button[data-action="createEntry"], button[data-action="createDocument"], .create-entry');
  const target = createButton?.parentElement ?? [
    ".directory-header .header-actions",
    ".directory-header .action-buttons",
    ".directory-header",
    ".header-actions",
    "header"
  ].map((selector) => root.querySelector(selector)).find(Boolean);
  if (!target) return;

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(`data-${MODULE_ID}-button`, "");
  button.className = "pf2e-encounter-forge-directory-button";
  button.dataset.tooltip = "PF2E_ENCOUNTER_FORGE.Controls.Open";
  button.setAttribute("aria-label", localize("PF2E_ENCOUNTER_FORGE.Controls.Open", "Open Encounter Forge"));
  button.innerHTML = `<i class="fa-solid fa-shield-halved"></i><span>${localize("PF2E_ENCOUNTER_FORGE.Name", "Encounter Forge")}</span>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    openEncounterForge();
  });

  if (createButton?.parentElement) createButton.insertAdjacentElement("afterend", button);
  else target.append(button);
}

export function initializeEncounterForgeUi() {
  Hooks.on("renderActorDirectory", injectEncounterForgeButton);
  Hooks.on("renderSidebarTab", injectEncounterForgeButton);
  Hooks.on("renderApplicationV2", injectEncounterForgeButton);
  Hooks.on("deleteRegion", removeDeletedRegionReferences);
  Hooks.on("canvasReady", () => removeAlreadyMissingCurrentSceneReferences());
  Hooks.on("pf2eEncounterForgeConditionLogicDisplayChanged", () => {
    if (app) app.render({ force: true });
  });

  const current = document.querySelector("#actors, .actors-directory");
  if (current) injectEncounterForgeButton({ tabName: "actors" }, current);
  console.info(`${MODULE_ID} | Encounter Forge UI integration initialized.`);
}
