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

export async function openEncounterForge() {
  if (!game.user?.isGM) {
    ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.GMOnly", "Only the GM can open Encounter Forge."));
    return null;
  }

  if (!app) {
    app = new EncounterForgeApp();
    await app.initialize();
  }
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

  const current = document.querySelector("#actors, .actors-directory");
  if (current) injectEncounterForgeButton({ tabName: "actors" }, current);
  console.info(`${MODULE_ID} | Encounter Forge UI integration initialized.`);
}
