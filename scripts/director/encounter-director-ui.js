import { MODULE_ID } from "../constants.js";
import { EncounterDirectorApp } from "./encounter-director-app.js";

let app = null;
let lastSelectedInstanceId = null;

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function entryLabel(entry) {
  const data = entry?.data ?? {};
  const name = String(data.name ?? data.blueprint?.name ?? data.id ?? localize("PF2E_ENCOUNTER_FORGE.Editor.Untitled", "Untitled Encounter"));
  const scene = String(data.deployment?.sceneName ?? "").trim();
  return scene ? `${name} · ${scene}` : name;
}

function sceneInstanceEntries() {
  const api = getApi();
  const scene = globalThis.canvas?.scene ?? game.scenes?.active ?? null;
  const refs = Object.values(scene?.flags?.[MODULE_ID]?.instances ?? {}).map((entry) => entry?.instanceUuid).filter(Boolean);
  return refs.map((ref) => api?.instances?.get?.(ref)).filter(Boolean);
}

async function chooseInstance(rows, { title, prompt } = {}) {
  const choices = byRecency(rows).filter((entry) => entry?.data?.id);
  if (choices.length === 0) return null;
  if (choices.length === 1) return choices[0].data.id;

  const preferred = choices.some((entry) => entry.data.id === lastSelectedInstanceId)
    ? lastSelectedInstanceId
    : choices[0].data.id;
  const options = choices.map((entry) => {
    const id = String(entry.data.id);
    const selected = id === preferred ? " selected" : "";
    return `<option value="${escapeHtml(id)}"${selected}>${escapeHtml(entryLabel(entry))}</option>`;
  }).join("");

  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2?.wait) return preferred;
  return await DialogV2.wait({
    window: { title: title ?? localize("PF2E_ENCOUNTER_FORGE.Director.SelectEncounterTitle", "Select Encounter") },
    content: `<div class="form-group"><label>${escapeHtml(prompt ?? localize("PF2E_ENCOUNTER_FORGE.Director.SelectEncounterPrompt", "Several prepared Encounters are available. Choose which one the Director should open."))}</label><select name="instanceId">${options}</select></div>`,
    buttons: [
      {
        action: "open",
        label: localize("PF2E_ENCOUNTER_FORGE.Director.OpenSelected", "Open Director"),
        icon: "fa-solid fa-clapperboard",
        default: true,
        callback: (_event, button) => String(button?.form?.elements?.instanceId?.value ?? preferred)
      },
      {
        action: "cancel",
        label: localize("Cancel", "Cancel"),
        icon: "fa-solid fa-xmark",
        callback: () => null
      }
    ],
    modal: true,
    rejectClose: false
  });
}

export function findPreferredEncounterInstanceId() {
  const api = getApi();
  const runtimeStatus = api?.runtime?.status?.() ?? {};
  const runtimeId = runtimeStatus.activeInstanceId ?? null;
  if (runtimeId && ["active", "paused", "prepared"].includes(runtimeStatus.instanceStatus)) return runtimeId;

  // A completed Runtime binding must not pin the Director forever. A newly deployed
  // prepared Instance on the current Combat/Scene should win immediately.
  let completedCombatCandidate = null;
  const combatRef = game.combat?.flags?.[MODULE_ID]?.encounter?.instanceUuid ?? game.combat?.flags?.[MODULE_ID]?.encounter?.instanceId ?? null;
  if (combatRef) {
    const combatEntry = api?.instances?.get?.(combatRef) ?? null;
    if (["active", "paused", "prepared"].includes(combatEntry?.data?.status)) return combatEntry.data.id;
    if (combatEntry?.data?.status === "completed") completedCombatCandidate = combatEntry.data.id;
  }

  const sortedSceneEntries = byRecency(sceneInstanceEntries());
  const scenePreferred = sortedSceneEntries.find((entry) => ["active", "paused", "prepared"].includes(entry.data?.status));
  if (scenePreferred) return scenePreferred.data.id;

  const sortedGlobalEntries = byRecency(instanceEntries());
  const globalPreferred = sortedGlobalEntries.find((entry) => ["active", "paused", "prepared"].includes(entry.data?.status));
  if (globalPreferred) return globalPreferred.data.id;

  if (runtimeId && runtimeStatus.instanceStatus === "completed") return runtimeId;
  if (completedCombatCandidate) return completedCombatCandidate;
  return sortedSceneEntries.find((entry) => entry.data?.status === "completed")?.data?.id
    ?? sortedGlobalEntries.find((entry) => entry.data?.status === "completed")?.data?.id
    ?? null;
}

async function resolveDirectorInstanceId() {
  const api = getApi();
  const runtimeStatus = api?.runtime?.status?.() ?? {};
  const runtimeId = runtimeStatus.activeInstanceId ?? null;

  // A real Runtime binding is authoritative. There is nothing to choose while an
  // Encounter is already running or paused.
  if (runtimeId && ["active", "paused"].includes(runtimeStatus.instanceStatus)) return runtimeId;

  const combatRef = game.combat?.flags?.[MODULE_ID]?.encounter?.instanceUuid ?? game.combat?.flags?.[MODULE_ID]?.encounter?.instanceId ?? null;
  if (combatRef) {
    const combatEntry = api?.instances?.get?.(combatRef) ?? null;
    if (["active", "paused"].includes(combatEntry?.data?.status)) return combatEntry.data.id;
  }

  const sceneEntries = byRecency(sceneInstanceEntries());
  const sceneRunning = sceneEntries.filter((entry) => ["active", "paused"].includes(entry.data?.status));
  if (sceneRunning.length === 1) return sceneRunning[0].data.id;
  if (sceneRunning.length > 1) {
    return chooseInstance(sceneRunning, {
      prompt: localize("PF2E_ENCOUNTER_FORGE.Director.SelectRunningPrompt", "Several running Encounters are associated with this Scene. Choose which one the Director should open.")
    });
  }

  const scenePrepared = sceneEntries.filter((entry) => entry.data?.status === "prepared");
  if (scenePrepared.length === 1) return scenePrepared[0].data.id;
  if (scenePrepared.length > 1) {
    return chooseInstance(scenePrepared, {
      prompt: localize("PF2E_ENCOUNTER_FORGE.Director.SelectPreparedPrompt", "Several prepared Encounters are available on this Scene. Choose which one the Director should open.")
    });
  }

  // A prepared Runtime binding or Combat reference is still a strong hint when the
  // Scene itself has no competing prepared Encounter.
  if (runtimeId && runtimeStatus.instanceStatus === "prepared") return runtimeId;
  if (combatRef) {
    const combatEntry = api?.instances?.get?.(combatRef) ?? null;
    if (combatEntry?.data?.status === "prepared") return combatEntry.data.id;
  }

  const globalEntries = byRecency(instanceEntries());
  const globalRunning = globalEntries.filter((entry) => ["active", "paused"].includes(entry.data?.status));
  if (globalRunning.length === 1) return globalRunning[0].data.id;
  if (globalRunning.length > 1) return chooseInstance(globalRunning);

  const globalPrepared = globalEntries.filter((entry) => entry.data?.status === "prepared");
  if (globalPrepared.length === 1) return globalPrepared[0].data.id;
  if (globalPrepared.length > 1) {
    return chooseInstance(globalPrepared, {
      prompt: localize("PF2E_ENCOUNTER_FORGE.Director.SelectPreparedGlobalPrompt", "Several prepared Encounters are available. Choose which one the Director should open.")
    });
  }

  if (runtimeId && runtimeStatus.instanceStatus === "completed") return runtimeId;
  if (combatRef) {
    const combatEntry = api?.instances?.get?.(combatRef) ?? null;
    if (combatEntry?.data?.status === "completed") return combatEntry.data.id;
  }
  return sceneEntries.find((entry) => entry.data?.status === "completed")?.data?.id
    ?? globalEntries.find((entry) => entry.data?.status === "completed")?.data?.id
    ?? null;
}

export async function openEncounterDirector(instanceOrId = null) {
  if (!game.user?.isGM) {
    ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.GMOnly", "Only the GM can open Encounter Director."));
    return null;
  }
  const explicitId = typeof instanceOrId === "string" ? instanceOrId : instanceOrId?.id ?? null;
  const id = explicitId ?? await resolveDirectorInstanceId();
  if (!id) {
    if (!explicitId && (sceneInstanceEntries().some((entry) => entry?.data?.status === "prepared") || instanceEntries().some((entry) => entry?.data?.status === "prepared"))) return null;
    ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Director.NoInstance", "No prepared or running Encounter Instance is available."));
    return null;
  }
  lastSelectedInstanceId = id;
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
  Hooks.on("renderChatMessage", injectDecisionChatControls);
  Hooks.on("renderChatMessageHTML", injectDecisionChatControls);
  const current = document.querySelector("#combat, .combat-sidebar, .combat-tracker");
  if (current) injectDirectorButton({ tabName: "combat" }, current);
  console.info(`${MODULE_ID} | Encounter Director UI integration initialized.`);
}
