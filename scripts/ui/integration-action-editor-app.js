import { MODULE_ID } from "../constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function localize(key, fallback = key) {
  try {
    const value = game.i18n.localize(key);
    return value === key ? fallback : value;
  } catch { return fallback; }
}

function clone(value) {
  if (value == null) return value;
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return structuredClone(value);
}

function encounterApi() { return game.modules.get(MODULE_ID)?.api ?? null; }

function integrationIdFor(type) {
  if (type === "effect.apply") return "effectForge";
  if (type === "aura.setEnabled") return "auraForge";
  if (type === "affliction.apply") return "afflictionForge";
  if (type === "loot.createActor") return "lootForge";
  return null;
}

export class IntegrationActionEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pf2e-encounter-forge-integration-action-editor",
    classes: ["pf2e-encounter-forge", "encounter-integration-action-editor"],
    window: {
      title: "PF2E_ENCOUNTER_FORGE.Flow.IntegrationEditor.Title",
      icon: "fa-solid fa-gears",
      resizable: true
    },
    position: { width: 1320, height: 860 },
    actions: {
      commitIntegrationAction: IntegrationActionEditorApp.commitIntegrationAction,
      cancelIntegrationAction: IntegrationActionEditorApp.cancelIntegrationAction
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/integration-action-editor-app.hbs` }
  };

  constructor({ action = null, partyLevel = 1, partySize = 4, onCommit = null, ...options } = {}) {
    super(options);
    this.action = clone(action ?? {});
    this.type = String(this.action.type ?? "");
    this.partyLevel = Number.isInteger(Number(partyLevel)) ? Number(partyLevel) : 1;
    this.partySize = Number.isInteger(Number(partySize)) ? Number(partySize) : 4;
    this.onCommit = typeof onCommit === "function" ? onCommit : null;
    this.editor = null;
    this.mounting = false;
  }

  async _prepareContext() {
    return {
      actionName: this.action.name || this.action.id || localize("PF2E_ENCOUNTER_FORGE.Flow.Action", "Action"),
      type: this.type,
      typeLabel: localize(`PF2E_ENCOUNTER_FORGE.Flow.ActionType.${this.type}`, this.type),
      isLoot: this.type === "loot.createActor"
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#mountEditor().catch((error) => {
      console.error(`${MODULE_ID} | Integration action editor mount failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.IntegrationActionEditorFailed", "The integration editor could not be opened."));
    });
  }

  async #mountEditor() {
    if (this.mounting || this.editor) return;
    this.mounting = true;
    try {
      const container = this.element?.querySelector?.("[data-integration-action-editor-mount]");
      if (!(container instanceof HTMLElement)) return;
      const integrationId = integrationIdFor(this.type);
      const api = integrationId ? encounterApi()?.integrations?.api?.(integrationId) : null;
      if (!api) throw new Error(`${integrationId ?? this.type} integration is unavailable.`);

      if (this.type === "effect.apply") {
        const factory = api.ui?.effectEditor?.create;
        if (typeof factory !== "function") throw new Error("Effect Forge embedded editor API unavailable.");
        this.editor = factory({ definition: this.action.definition ?? null, layout: "full" });
        await this.editor.mount(container, { layout: "full" });
        return;
      }

      if (this.type === "aura.setEnabled") {
        const factory = api.ui?.auraEditor?.create;
        if (typeof factory !== "function") throw new Error("Aura Forge embedded editor API unavailable.");
        this.editor = factory({ definition: this.action.definition ?? null });
        await this.editor.mount(container);
        return;
      }

      if (this.type === "affliction.apply") {
        const factory = api.ui?.afflictionEditor?.create;
        if (typeof factory !== "function") throw new Error("Affliction Forge embedded editor API unavailable.");
        this.editor = factory({ definition: this.action.definition ?? null, mode: "create" });
        await this.editor.mount(container);
        return;
      }

      if (this.type === "loot.createActor") {
        const factory = api.createEmbeddedEditor;
        if (typeof factory !== "function") throw new Error("Loot Forge embedded editor API unavailable.");
        const initialConfig = {
          level: this.partyLevel,
          partySize: this.partySize,
          itemLevelMin: Math.max(0, this.partyLevel - 2),
          itemLevelMax: Math.max(0, this.partyLevel + 1),
          ...(clone(this.action.loot?.config ?? {}))
        };
        this.editor = factory({
          initialConfig,
          result: clone(this.action.loot?.result ?? null),
          editableLoot: clone(this.action.loot?.loot ?? null),
          persistGenerationSettings: false,
          persistSourceSelection: false
        });
        await this.editor.render(container);
        return;
      }

      throw new Error(`Unsupported integration action type '${this.type}'.`);
    } finally {
      this.mounting = false;
    }
  }

  async close(options = {}) {
    try { this.editor?.destroy?.(); } catch (error) { console.warn(`${MODULE_ID} | Integration editor teardown failed.`, error); }
    try { this.editor?.unmount?.(); } catch {}
    this.editor = null;
    return super.close(options);
  }

  static async commitIntegrationAction() {
    if (!this.editor) return;
    let payload = {};
    try {
      if (this.type === "effect.apply") {
        const definition = this.editor.value;
        const api = encounterApi()?.integrations?.api?.("effectForge");
        const report = api?.effects?.validate?.(definition);
        if (report?.valid === false) throw new Error(report.errors?.map?.((entry) => entry.message).join("; ") || "Invalid Effect Definition.");
        payload = { definition: clone(definition) };
      } else if (this.type === "aura.setEnabled") {
        const definition = this.editor.sync?.() ?? this.editor.value;
        const report = this.editor.validate?.();
        if (report?.valid === false) throw new Error(report.errors?.map?.((entry) => entry.message).join("; ") || "Invalid Aura Definition.");
        payload = { definition: clone(definition), definitionId: definition?.id ?? null };
      } else if (this.type === "affliction.apply") {
        const definition = this.editor.value;
        const report = this.editor.validate?.();
        if (report?.valid === false) throw new Error(report.errors?.map?.((entry) => entry.message).join("; ") || "Invalid Affliction Definition.");
        payload = { definition: clone(definition) };
      } else if (this.type === "loot.createActor") {
        const state = this.editor.syncFromForm?.() ?? this.editor.getState?.();
        payload = {
          loot: {
            config: clone(state?.config ?? {}),
            result: clone(state?.result ?? null),
            loot: clone(state?.loot ?? null)
          },
          lootActorName: String(state?.config?.newLootActorName ?? this.action.lootActorName ?? "").trim() || null
        };
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Integration action validation failed.`, error);
      ui.notifications.warn(error?.message ?? localize("PF2E_ENCOUNTER_FORGE.Notifications.IntegrationActionInvalid", "The integration action is incomplete or invalid."));
      return;
    }

    await this.onCommit?.(payload);
    await this.close();
  }

  static async cancelIntegrationAction() { await this.close(); }
}
