import { MODULE_ID } from "../constants.js";
import { EncounterDirectorApp } from "./encounter-director-app.js";
import { openEncounterInstanceManager } from "./encounter-instance-manager-ui.js";
import { blueprintVisibleOnScene, currentSceneId, instanceVisibleOnScene } from "../utils/scene-binding.js";

let app = null;

function localize(key, fallback = key) {
  try { const value = game.i18n.localize(key); return value === key ? fallback : value; }
  catch { return fallback; }
}

function getRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (html?.element instanceof HTMLElement) return html.element;
  return null;
}

function getApi() { return game.modules.get(MODULE_ID)?.api ?? null; }

function instanceEntries() {
  return getApi()?.instances?.list?.() ?? [];
}

function byRecency(rows) {
  return [...rows].sort((a, b) => String(b.data?.metadata?.modifiedAt ?? b.data?.metadata?.createdAt ?? "").localeCompare(String(a.data?.metadata?.modifiedAt ?? a.data?.metadata?.createdAt ?? "")));
}


export function findEncounterDirectorCandidates() {
  const api = getApi();
  const sceneId = currentSceneId();
  const rows = byRecency(instanceEntries()).filter((entry) => instanceVisibleOnScene(entry, { api, sceneId }));
  const live = rows.filter((entry) => ["active", "paused", "prepared"].includes(entry.data?.status));
  if (live.length) return live;
  return rows.filter((entry) => ["completed", "aborted"].includes(entry.data?.status));
}


function candidateHasBlueprint(entry) {
  const api = getApi();
  const reference = entry?.data?.blueprint ?? {};
  if (reference.snapshot && typeof reference.snapshot === "object") return true;
  return Boolean(
    api?.blueprints?.get?.(reference.uuid ?? reference.id)
    ?? api?.blueprints?.get?.(reference.id)
  );
}

function activeBlueprintEntries() {
  const sceneId = currentSceneId();
  return (getApi()?.blueprints?.list?.() ?? []).filter((entry) => !entry?.data?.metadata?.archivedAt && blueprintVisibleOnScene(entry?.data ?? {}, sceneId));
}

function runtimeBoundDirectorId() {
  const api = getApi();
  const status = api?.runtime?.status?.() ?? {};
  const id = status.activeInstanceId ?? null;
  if (!id || !["active", "paused"].includes(status.instanceStatus)) return null;
  const entry = api?.instances?.get?.(id) ?? null;
  return instanceVisibleOnScene(entry, { api, sceneId: currentSceneId() }) ? id : null;
}

async function handleDirectorSceneChange() {
  if (!game.user?.isGM || !app?.instanceId || !app?.element) return;
  const api = getApi();
  const entry = api?.instances?.get?.(app.instanceId) ?? null;
  if (entry?.data && instanceVisibleOnScene(entry, { api, sceneId: currentSceneId() })) return;

  const previous = app;
  app = null;
  try { await previous?.close?.(); }
  catch (error) { console.warn(`${MODULE_ID} | Could not close Scene-incompatible Encounter Director.`, error); }

  // Scene-bound Encounters must disappear as soon as the GM changes maps. If the
  // destination Scene has another runnable Encounter or Blueprint, move the Director
  // there automatically. Otherwise leave it closed without a noisy warning.
  if (findEncounterDirectorCandidates().length || activeBlueprintEntries().length) {
    try { await openEncounterDirector(); }
    catch (error) { console.error(`${MODULE_ID} | Could not reopen Encounter Director after Scene change.`, error); }
  }
}

export function findPreferredEncounterInstanceId() {
  const api = getApi();
  const runtimeStatus = api?.runtime?.status?.() ?? {};
  const runtimeId = runtimeStatus.activeInstanceId ?? null;
  const sceneId = currentSceneId();
  const runtimeEntry = runtimeId ? api?.instances?.get?.(runtimeId) ?? null : null;
  if (runtimeId && ["active", "paused", "prepared"].includes(runtimeStatus.instanceStatus) && instanceVisibleOnScene(runtimeEntry, { api, sceneId })) return runtimeId;

  // A completed Runtime binding must not pin the Director forever. A newly deployed
  // prepared Instance on the current Combat/Scene should win immediately.
  let completedCombatCandidate = null;
  const combatRef = game.combat?.flags?.[MODULE_ID]?.encounter?.instanceUuid ?? game.combat?.flags?.[MODULE_ID]?.encounter?.instanceId ?? null;
  if (combatRef) {
    const combatEntry = api?.instances?.get?.(combatRef) ?? null;
    if (["active", "paused", "prepared"].includes(combatEntry?.data?.status) && instanceVisibleOnScene(combatEntry, { api, sceneId })) return combatEntry.data.id;
    if (combatEntry?.data?.status === "completed" && instanceVisibleOnScene(combatEntry, { api, sceneId })) completedCombatCandidate = combatEntry.data.id;
  }

  const scene = globalThis.canvas?.scene ?? game.scenes?.active ?? null;
  const refs = Object.values(scene?.flags?.[MODULE_ID]?.instances ?? {}).map((entry) => entry?.instanceUuid).filter(Boolean);
  const sceneEntries = refs.map((ref) => api?.instances?.get?.(ref)).filter((entry) => Boolean(entry) && instanceVisibleOnScene(entry, { api, sceneId }));
  const sortedSceneEntries = byRecency(sceneEntries);
  const scenePreferred = sortedSceneEntries.find((entry) => ["active", "paused", "prepared"].includes(entry.data?.status));
  if (scenePreferred) return scenePreferred.data.id;

  const sortedGlobalEntries = byRecency(instanceEntries()).filter((entry) => instanceVisibleOnScene(entry, { api, sceneId }));
  const globalPreferred = sortedGlobalEntries.find((entry) => ["active", "paused", "prepared"].includes(entry.data?.status));
  if (globalPreferred) return globalPreferred.data.id;

  if (runtimeId && runtimeStatus.instanceStatus === "completed" && instanceVisibleOnScene(runtimeEntry, { api, sceneId })) return runtimeId;
  if (completedCombatCandidate) return completedCombatCandidate;
  return sortedSceneEntries.find((entry) => entry.data?.status === "completed")?.data?.id
    ?? sortedGlobalEntries.find((entry) => entry.data?.status === "completed")?.data?.id
    ?? null;
}

export async function openEncounterDirector(instanceOrId = null) {
  if (!game.user?.isGM) {
    ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.GMOnly", "Only the GM can open Encounter Director."));
    return null;
  }

  const explicitId = typeof instanceOrId === "string" ? instanceOrId : instanceOrId?.id ?? null;
  let id = explicitId;

  if (!id) {
    const runtimeId = runtimeBoundDirectorId();
    if (runtimeId) id = runtimeId;
    else {
      const candidates = findEncounterDirectorCandidates();
      if (candidates.length > 1 || (candidates.length === 1 && !candidateHasBlueprint(candidates[0]))) {
        return openEncounterInstanceManager({ selectedInstanceId: app?.instanceId ?? null, sceneFiltered: true });
      }
      id = candidates[0]?.data?.id ?? findPreferredEncounterInstanceId();
    }
  }

  if (!id) {
    const blueprints = activeBlueprintEntries();
    if (blueprints.length) {
      return openEncounterInstanceManager({ selectedInstanceId: app?.instanceId ?? null, sceneFiltered: true });
    }
    ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Director.NoSceneEncounter", "No prepared or running Encounter or active Blueprint is available on the current Scene."));
    return null;
  }
  if (!app) {
    app = new EncounterDirectorApp({ instanceId: id });
    await app.initialize(id);
  } else if (app.instanceId !== id) {
    await app.setInstance(id);
  } else {
    await app.initialize(id);
  }
  await app.render({ force: true });
  app.bringToFront?.();
  return app;
}

function isCombatTracker(appRef, root) {
  const id = String(appRef?.tabName ?? appRef?.options?.tabName ?? appRef?.id ?? "").toLowerCase();
  return id.includes("combat") || Boolean(root?.matches?.("#combat, .combat-sidebar, .combat-tracker") || root?.querySelector?.("#combat, .combat-sidebar, .combat-tracker"));
}

export function injectDirectorButton(appRef, html) {
  if (!game.user?.isGM) return;
  const root = getRoot(html);
  if (!root || !isCombatTracker(appRef, root)) return;
  if (root.querySelector(`[data-${MODULE_ID}-director-button]`)) return;
  const header = [
    ".directory-header .header-actions",
    ".combat-tracker-header",
    ".directory-header",
    ".header-actions",
    "header"
  ].map((selector) => root.querySelector(selector)).find(Boolean);
  if (!header) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pf2e-encounter-director-launcher";
  button.setAttribute(`data-${MODULE_ID}-director-button`, "");
  button.dataset.tooltip = "PF2E_ENCOUNTER_FORGE.Director.Open";
  button.setAttribute("aria-label", localize("PF2E_ENCOUNTER_FORGE.Director.Open", "Open Encounter Director"));
  button.innerHTML = `<i class="fa-solid fa-clapperboard"></i><span>${localize("PF2E_ENCOUNTER_FORGE.Director.ShortName", "Director")}</span>`;
  button.addEventListener("click", (event) => { event.preventDefault(); openEncounterDirector(); });
  header.append(button);
}

function injectDecisionChatControls(_message, html) {
  if (!game.user?.isGM) return;
  const root = getRoot(html);
  if (!root) return;
  for (const button of root.querySelectorAll?.("[data-pf2e-encounter-forge-open-director]") ?? []) {
    if (button.dataset.encounterForgeBound === "true") continue;
    button.dataset.encounterForgeBound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const instanceId = String(button.dataset.instanceId ?? "").trim() || null;
      openEncounterDirector(instanceId);
    });
  }
}

export function initializeEncounterDirectorUi() {
  Hooks.on("renderCombatTracker", injectDirectorButton);
  Hooks.on("renderSidebarTab", injectDirectorButton);
  Hooks.on("renderApplicationV2", injectDirectorButton);
  Hooks.on("renderChatMessageHTML", injectDecisionChatControls);
  Hooks.on("canvasReady", handleDirectorSceneChange);
  const current = document.querySelector("#combat, .combat-sidebar, .combat-tracker");
  if (current) injectDirectorButton({ tabName: "combat" }, current);
  console.info(`${MODULE_ID} | Encounter Director UI integration initialized.`);
}
