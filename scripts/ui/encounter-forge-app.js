import { MODULE_ID } from "../constants.js";
import { createEncounterBlueprint } from "../model/encounter-blueprint.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function localize(key, fallback = key) {
  try {
    const value = game.i18n.localize(key);
    return value === key ? fallback : value;
  } catch {
    return fallback;
  }
}

async function confirmDialog(titleKey, promptKey) {
  const title = localize(titleKey, "Encounter Forge");
  const content = `<p>${localize(promptKey, "Discard unsaved changes?")}</p>`;
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2?.confirm) {
    return Boolean(await DialogV2.confirm({ window: { title }, content, modal: true, rejectClose: false }));
  }
  return globalThis.confirm?.(localize(promptKey, "Discard unsaved changes?")) ?? false;
}

function getApi() {
  return game.modules.get(MODULE_ID)?.api ?? null;
}

function asInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function asNullableNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function clone(value) {
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return structuredClone(value);
}

export class EncounterForgeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pf2e-encounter-forge-app",
    classes: ["pf2e-encounter-forge", "encounter-forge-app"],
    tag: "form",
    window: {
      title: "PF2E_ENCOUNTER_FORGE.WindowTitle",
      icon: "fa-solid fa-shield-halved",
      resizable: true
    },
    position: { width: 1120, height: 760 },
    actions: {
      newBlueprint: EncounterForgeApp.newBlueprint,
      selectBlueprint: EncounterForgeApp.selectBlueprint,
      saveBlueprint: EncounterForgeApp.saveBlueprint,
      duplicateBlueprint: EncounterForgeApp.duplicateBlueprint,
      deleteBlueprint: EncounterForgeApp.deleteBlueprint,
      refreshBlueprints: EncounterForgeApp.refreshBlueprints
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/encounter-forge-app.hbs` }
  };

  constructor(options = {}) {
    super(options);
    this.blueprints = [];
    this.selectedBlueprintId = null;
    this.draft = createEncounterBlueprint({});
    this.savedSnapshot = JSON.stringify(this.draft);
    this.initialized = false;
    this.allowCloseWithoutPrompt = false;
  }

  get isDirty() {
    return JSON.stringify(this.draft) !== this.savedSnapshot;
  }

  async initialize() {
    await this.#reloadBlueprints();
    if (this.blueprints.length > 0) this.#loadBlueprint(this.blueprints[0].id);
    else this.#resetDraft();
    this.initialized = true;
    return this;
  }

  async _prepareContext() {
    const api = getApi();
    const integrationStatus = api?.integrations?.status?.() ?? {};
    const integrationRows = Array.isArray(integrationStatus) ? integrationStatus : Object.values(integrationStatus ?? {});
    const readyIntegrations = integrationRows.filter((entry) => entry?.ready).length;

    const draft = this.draft ?? createEncounterBlueprint({});
    return {
      blueprints: this.blueprints.map((entry) => ({
        id: entry.id,
        name: entry.name || localize("PF2E_ENCOUNTER_FORGE.Editor.Untitled", "Untitled Encounter"),
        selected: entry.id === this.selectedBlueprintId,
        partyLevel: entry.party?.level ?? 1,
        partySize: entry.party?.size ?? 4,
        threat: localize(`PF2E_ENCOUNTER_FORGE.Threat.${entry.threat?.target ?? "moderate"}`, entry.threat?.target ?? "moderate")
      })),
      hasBlueprints: this.blueprints.length > 0,
      draft: {
        ...draft,
        threatBudget: draft.threat?.budget ?? "",
        participantCount: draft.participants?.reduce?.((sum, participant) => sum + (Number(participant.quantity) || 1), 0) ?? 0,
        groupCount: draft.groups?.length ?? 0,
        objectiveCount: draft.objectives?.length ?? 0,
        phaseCount: draft.phases?.length ?? 0,
        triggerCount: draft.triggers?.length ?? 0,
        actionCount: draft.actions?.length ?? 0
      },
      isDirty: this.isDirty,
      isSaved: Boolean(this.selectedBlueprintId),
      readyIntegrations,
      totalIntegrations: integrationRows.length,
      threatOptions: ["trivial", "low", "moderate", "severe", "extreme"].map((value) => ({
        value,
        label: localize(`PF2E_ENCOUNTER_FORGE.Threat.${value}`, value),
        selected: draft.threat?.target === value
      }))
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!(root instanceof HTMLElement)) return;

    for (const input of root.querySelectorAll("[data-blueprint-field]")) {
      input.addEventListener("input", () => this.#syncDraftFromForm());
      input.addEventListener("change", () => this.#syncDraftFromForm());
    }
    this.#updateDirtyIndicator();
  }

  async close(options = {}) {
    this.#syncDraftFromForm();
    if (!this.allowCloseWithoutPrompt && this.isDirty) {
      const confirmed = await confirmDialog(
        "PF2E_ENCOUNTER_FORGE.Dialogs.DiscardTitle",
        "PF2E_ENCOUNTER_FORGE.Dialogs.DiscardPrompt"
      );
      if (!confirmed) return this;
    }
    this.allowCloseWithoutPrompt = false;
    return super.close(options);
  }

  async #reloadBlueprints() {
    const api = getApi();
    const rows = api?.blueprints?.list?.() ?? [];
    this.blueprints = rows
      .map((row) => clone(row?.data ?? row))
      .filter((entry) => entry?.id)
      .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), game.i18n?.lang));
  }

  #resetDraft() {
    this.selectedBlueprintId = null;
    this.draft = createEncounterBlueprint({ name: localize("PF2E_ENCOUNTER_FORGE.Editor.NewEncounter", "New Encounter") });
    this.savedSnapshot = JSON.stringify(this.draft);
  }

  #loadBlueprint(id) {
    const found = this.blueprints.find((entry) => entry.id === id);
    if (!found) return false;
    this.selectedBlueprintId = found.id;
    this.draft = clone(found);
    this.savedSnapshot = JSON.stringify(this.draft);
    return true;
  }

  #syncDraftFromForm() {
    const root = this.element;
    if (!(root instanceof HTMLElement)) return this.draft;

    const value = (name) => root.querySelector(`[name="${name}"]`)?.value;
    const next = clone(this.draft);
    next.name = String(value("name") ?? next.name ?? "").trim();
    next.description = String(value("description") ?? next.description ?? "");
    next.party ??= {};
    next.party.level = asInteger(value("partyLevel"), next.party.level ?? 1, { min: 1, max: 20 });
    next.party.size = asInteger(value("partySize"), next.party.size ?? 4, { min: 1, max: 12 });
    next.threat ??= {};
    next.threat.target = String(value("threatTarget") ?? next.threat.target ?? "moderate");
    next.threat.budget = asNullableNumber(value("threatBudget"));
    this.draft = next;
    this.#updateDirtyIndicator();
    return next;
  }

  #updateDirtyIndicator() {
    const indicator = this.element?.querySelector?.("[data-dirty-indicator]");
    if (!(indicator instanceof HTMLElement)) return;
    indicator.classList.toggle("dirty", this.isDirty);
    indicator.classList.toggle("clean", !this.isDirty);
    const text = indicator.querySelector("[data-dirty-text]");
    if (text) {
      text.textContent = localize(
        this.isDirty ? "PF2E_ENCOUNTER_FORGE.Editor.UnsavedChanges" : "PF2E_ENCOUNTER_FORGE.Editor.AllChangesSaved",
        this.isDirty ? "Unsaved changes" : "All changes saved"
      );
    }
  }

  async #confirmDiscardIfNeeded() {
    this.#syncDraftFromForm();
    if (!this.isDirty) return true;
    return confirmDialog("PF2E_ENCOUNTER_FORGE.Dialogs.DiscardTitle", "PF2E_ENCOUNTER_FORGE.Dialogs.DiscardPrompt");
  }

  async #renderFresh() {
    await this.render({ force: true });
  }

  static async newBlueprint() {
    if (!await this.#confirmDiscardIfNeeded()) return;
    this.#resetDraft();
    await this.#renderFresh();
  }

  static async selectBlueprint(_event, target) {
    const id = target?.dataset?.blueprintId;
    if (!id || id === this.selectedBlueprintId) return;
    if (!await this.#confirmDiscardIfNeeded()) return;
    if (this.#loadBlueprint(id)) await this.#renderFresh();
  }

  static async saveBlueprint() {
    const api = getApi();
    if (!api?.blueprints?.save) return;
    this.#syncDraftFromForm();

    const normalized = createEncounterBlueprint({
      ...this.draft,
      id: this.draft.id,
      metadata: {
        ...this.draft.metadata,
        createdAt: this.draft.metadata?.createdAt
      }
    });
    const validation = api.blueprints.validate(normalized);
    if (!validation.valid) {
      const details = validation.errors.slice(0, 5).map((entry) => `• ${entry.message}`).join("\n");
      ui.notifications.error(`${localize("PF2E_ENCOUNTER_FORGE.Notifications.ValidationFailed", "Encounter blueprint is invalid.")}\n${details}`);
      return;
    }

    try {
      await api.blueprints.save(normalized);
      this.draft = clone(normalized);
      this.selectedBlueprintId = normalized.id;
      this.savedSnapshot = JSON.stringify(this.draft);
      await this.#reloadBlueprints();
      ui.notifications.info(localize("PF2E_ENCOUNTER_FORGE.Notifications.Saved", "Encounter saved."));
      await this.#renderFresh();
    } catch (error) {
      console.error(`${MODULE_ID} | Saving encounter blueprint failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.SaveFailed", "Encounter could not be saved."));
    }
  }

  static async duplicateBlueprint() {
    const api = getApi();
    if (!api?.blueprints?.save) return;
    this.#syncDraftFromForm();
    const suffix = localize("PF2E_ENCOUNTER_FORGE.Editor.CopySuffix", "Copy");
    const copy = createEncounterBlueprint({
      ...this.draft,
      id: undefined,
      name: `${this.draft.name || localize("PF2E_ENCOUNTER_FORGE.Editor.Untitled", "Untitled Encounter")} (${suffix})`,
      metadata: { sourceModule: MODULE_ID, notes: {} }
    });
    try {
      await api.blueprints.save(copy);
      await this.#reloadBlueprints();
      this.#loadBlueprint(copy.id);
      ui.notifications.info(localize("PF2E_ENCOUNTER_FORGE.Notifications.Duplicated", "Encounter duplicated."));
      await this.#renderFresh();
    } catch (error) {
      console.error(`${MODULE_ID} | Duplicating encounter blueprint failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.SaveFailed", "Encounter could not be saved."));
    }
  }

  static async deleteBlueprint() {
    if (!this.selectedBlueprintId) return;
    const confirmed = await confirmDialog(
      "PF2E_ENCOUNTER_FORGE.Dialogs.DeleteTitle",
      "PF2E_ENCOUNTER_FORGE.Dialogs.DeletePrompt"
    );
    if (!confirmed) return;

    const api = getApi();
    try {
      await api?.blueprints?.delete?.(this.selectedBlueprintId);
      await this.#reloadBlueprints();
      if (this.blueprints.length > 0) this.#loadBlueprint(this.blueprints[0].id);
      else this.#resetDraft();
      ui.notifications.info(localize("PF2E_ENCOUNTER_FORGE.Notifications.Deleted", "Encounter deleted."));
      await this.#renderFresh();
    } catch (error) {
      console.error(`${MODULE_ID} | Deleting encounter blueprint failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.DeleteFailed", "Encounter could not be deleted."));
    }
  }

  static async refreshBlueprints() {
    if (!await this.#confirmDiscardIfNeeded()) return;
    const selected = this.selectedBlueprintId;
    await this.#reloadBlueprints();
    if (selected && this.#loadBlueprint(selected)) {
      // keep selected encounter after refresh
    } else if (this.blueprints.length > 0) this.#loadBlueprint(this.blueprints[0].id);
    else this.#resetDraft();
    await this.#renderFresh();
  }
}
