import { MODULE_ID, TOKEN_DISPLAY_MODE_KEYS } from "../constants.js";
import { createEncounterBlueprint } from "../model/encounter-blueprint.js";
import { analyzeEncounterBudget } from "../engine/encounter-budget.js";
import { randomId } from "../utils/data.js";
import { ParticipantBrowserApp } from "./participant-browser-app.js";
import { ForgeParticipantEditorApp } from "./forge-participant-editor-app.js";
import { EncounterDeploymentDialogApp } from "./deployment-dialog-app.js";

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


const ENCOUNTER_ROLES = Object.freeze([
  "leader",
  "frontliner",
  "defender",
  "skirmisher",
  "ranged",
  "controller",
  "support",
  "spellcaster",
  "artillery",
  "minion"
]);

function actorLevel(actor) {
  const value = actor?.system?.details?.level?.value ?? actor?.system?.details?.level ?? null;
  const level = Number(value);
  return Number.isInteger(level) ? level : null;
}

function normalizeSuggestedRole(value) {
  const role = String(value ?? "").toLowerCase();
  const direct = {
    brute: "frontliner", soldier: "defender", skirmisher: "skirmisher", sniper: "ranged",
    spellcaster: "spellcaster", controller: "controller", support: "support", artillery: "artillery", leader: "leader"
  };
  return direct[role] ?? (ENCOUNTER_ROLES.includes(role) ? role : null);
}

function tokenDisplayOptions(selected) {
  return [
    { value: "", label: localize("PF2E_ENCOUNTER_FORGE.Participants.TokenDisplay.Inherit", "Use Actor token setting"), selected: !selected },
    ...TOKEN_DISPLAY_MODE_KEYS.map((value) => ({
      value,
      label: localize(`PF2E_ENCOUNTER_FORGE.Participants.TokenDisplay.${value}`, value),
      selected: selected === value
    }))
  ];
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
    position: { width: 1280, height: 800 },
    actions: {
      newBlueprint: EncounterForgeApp.newBlueprint,
      selectBlueprint: EncounterForgeApp.selectBlueprint,
      saveBlueprint: EncounterForgeApp.saveBlueprint,
      duplicateBlueprint: EncounterForgeApp.duplicateBlueprint,
      deleteBlueprint: EncounterForgeApp.deleteBlueprint,
      refreshBlueprints: EncounterForgeApp.refreshBlueprints,
      detectParty: EncounterForgeApp.detectParty,
      browseParticipant: EncounterForgeApp.browseParticipant,
      addCreatureForgeParticipant: EncounterForgeApp.addCreatureForgeParticipant,
      addNpcForgeParticipant: EncounterForgeApp.addNpcForgeParticipant,
      editParticipant: EncounterForgeApp.editParticipant,
      removeParticipant: EncounterForgeApp.removeParticipant,
      addGroup: EncounterForgeApp.addGroup,
      removeGroup: EncounterForgeApp.removeGroup,
      toggleIntegrations: EncounterForgeApp.toggleIntegrations,
      toggleIntegration: EncounterForgeApp.toggleIntegration,
      deployEncounter: EncounterForgeApp.deployEncounter
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
    this.partyDetection = null;
    this.childApps = new Set();
    this.integrationsExpanded = false;
    this.pendingScrollState = null;
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
    const rawIntegrationRows = Array.isArray(integrationStatus) ? integrationStatus : Object.values(integrationStatus ?? {});
    const integrationRows = rawIntegrationRows.map((entry) => {
      let state = "missing";
      if (entry?.installed && !entry?.active) state = "inactive";
      else if (entry?.active && !entry?.ready) state = "notReady";
      else if (entry?.ready && !entry?.enabled) state = "disabled";
      else if (entry?.usable) state = "integrated";
      return {
        ...entry,
        state,
        statusLabel: localize(`PF2E_ENCOUNTER_FORGE.Integrations.Status.${state}`, state),
        versionText: entry?.moduleVersion ? `v${entry.moduleVersion}` : "",
        canToggle: Boolean(entry?.ready),
        toggleLabel: localize(
          entry?.enabled ? "PF2E_ENCOUNTER_FORGE.Integrations.Disable" : "PF2E_ENCOUNTER_FORGE.Integrations.Enable",
          entry?.enabled ? "Disable" : "Enable"
        )
      };
    });
    const readyIntegrations = integrationRows.filter((entry) => entry?.usable).length;

    const draft = this.draft ?? createEncounterBlueprint({});
    const partyDetection = this.partyDetection ?? api?.party?.detect?.() ?? null;
    const averageLevelText = Number.isFinite(partyDetection?.averageLevel)
      ? new Intl.NumberFormat(game.i18n?.lang ?? undefined, { maximumFractionDigits: 2 }).format(partyDetection.averageLevel)
      : null;

    const budget = analyzeEncounterBudget({
      participants: draft.participants,
      partyLevel: draft.party?.level ?? 1,
      partySize: draft.party?.size ?? 4,
      threat: draft.threat?.target ?? "moderate",
      budgetOverride: draft.threat?.budget
    });
    const budgetRows = new Map(budget.rows.map((row) => [row.id, row]));
    const groups = (draft.groups ?? []).map((group) => ({ id: group.id, name: group.name || group.id }));
    const participants = (draft.participants ?? []).map((participant) => {
      const row = budgetRows.get(participant.id);
      const sourceType = participant.source?.type ?? "document";
      const sourceLabel = participant.source?.label || localize(`PF2E_ENCOUNTER_FORGE.Participants.SourceType.${sourceType}`, sourceType);
      return {
        ...participant,
        levelText: Number.isInteger(participant.level) ? String(participant.level) : "—",
        levelValue: Number.isInteger(participant.level) ? String(participant.level) : "",
        sourceLabel,
        xpText: Number.isFinite(row?.totalXp) ? String(row.totalXp) : "—",
        xpEachText: Number.isFinite(row?.xpEach) ? String(row.xpEach) : "—",
        budgetSupported: Boolean(row?.supported),
        canEditSource: ["document", "creatureForge", "npcForge"].includes(sourceType),
        roleOptions: [
          { value: "", label: localize("PF2E_ENCOUNTER_FORGE.Participants.RoleNone", "No role"), selected: !participant.role },
          ...ENCOUNTER_ROLES.map((value) => ({
            value,
            label: localize(`PF2E_ENCOUNTER_FORGE.Participants.Role.${value}`, value),
            selected: participant.role === value
          }))
        ],
        groupOptions: [
          { value: "", label: localize("PF2E_ENCOUNTER_FORGE.Participants.GroupNone", "No group"), selected: !participant.groupId },
          ...groups.map((group) => ({ ...group, value: group.id, label: group.name, selected: participant.groupId === group.id }))
        ],
        tokenNameDisplayOptions: tokenDisplayOptions(participant.tokenDisplay?.displayName),
        hpBarDisplayOptions: tokenDisplayOptions(participant.tokenDisplay?.displayBars)
      };
    });

    const creatureApi = api?.integrations?.api?.("creatureForge");
    const npcApi = api?.integrations?.api?.("npcForge");
    const creatureForgeReady = Boolean(api?.integrations?.status?.("creatureForge")?.usable && creatureApi?.ui?.creatureEditor?.create);
    const npcForgeReady = Boolean(api?.integrations?.status?.("npcForge")?.usable && npcApi?.ui?.createEditor);

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
      integrationRows,
      integrationsExpanded: this.integrationsExpanded,
      participants,
      groups,
      hasParticipants: participants.length > 0,
      canDeploy: participants.length > 0,
      hasGroups: groups.length > 0,
      creatureForgeReady,
      npcForgeReady,
      budget: {
        ...budget,
        statusLabel: localize(`PF2E_ENCOUNTER_FORGE.Budget.Status.${budget.status}`, budget.status),
        remainingLabel: budget.remainingXp >= 0
          ? localize("PF2E_ENCOUNTER_FORGE.Budget.Remaining", "Remaining")
          : localize("PF2E_ENCOUNTER_FORGE.Budget.Over", "Over budget"),
        remainingAbs: Math.abs(budget.remainingXp)
      },
      partyDetection: partyDetection ? {
        ...partyDetection,
        averageLevelText,
        memberLevels: partyDetection.members?.map?.((member) => member.level).filter(Number.isFinite).join(", ") ?? "",
        sourceLabel: localize(`PF2E_ENCOUNTER_FORGE.Party.Source.${partyDetection.source}`, partyDetection.source ?? "")
      } : null,
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

    for (const input of root.querySelectorAll("[data-blueprint-field], [data-participant-field], [data-group-field]")) {
      input.addEventListener("input", () => this.#syncDraftFromForm());
      input.addEventListener("change", () => this.#syncDraftFromForm());
    }

    const dropZone = root.querySelector("[data-participant-drop]");
    dropZone?.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("dragover"); });
    dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone?.addEventListener("drop", async (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragover");
      await this.#handleParticipantDrop(event);
    });
    this.#updateDirtyIndicator();
    this.#updateBudgetDisplay();
    this.#restoreScrollState();
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
    for (const app of [...this.childApps]) {
      try { await app.close?.({ animate: false }); } catch {}
    }
    this.childApps.clear();
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
    const detection = getApi()?.party?.detect?.() ?? null;
    this.partyDetection = detection;
    const party = detection?.available
      ? { level: detection.partyLevel, size: detection.size }
      : undefined;
    this.draft = createEncounterBlueprint({
      name: localize("PF2E_ENCOUNTER_FORGE.Editor.NewEncounter", "New Encounter"),
      party
    });
    this.savedSnapshot = JSON.stringify(this.draft);
  }

  #loadBlueprint(id) {
    const found = this.blueprints.find((entry) => entry.id === id);
    if (!found) return false;
    this.selectedBlueprintId = found.id;
    this.draft = clone(found);
    this.partyDetection = getApi()?.party?.detect?.() ?? null;
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

    const participantById = new Map((next.participants ?? []).map((participant) => [participant.id, participant]));
    for (const card of root.querySelectorAll(".encounter-forge-participant[data-participant-id]")) {
      const participant = participantById.get(card.dataset.participantId);
      if (!participant) continue;
      const read = (field) => card.querySelector(`[data-participant-field="${field}"]`)?.value;
      participant.name = String(read("name") ?? participant.name ?? "").trim() || participant.name;
      const levelText = String(read("level") ?? "").trim();
      participant.level = levelText === "" ? null : asInteger(levelText, participant.level ?? 0, { min: -1, max: 24 });
      participant.quantity = asInteger(read("quantity"), participant.quantity ?? 1, { min: 1, max: 99 });
      participant.role = String(read("role") ?? "").trim() || null;
      participant.groupId = String(read("groupId") ?? "").trim() || null;
      participant.tokenDisplay ??= {};
      const displayName = String(read("tokenDisplayName") ?? "").trim();
      const displayBars = String(read("tokenDisplayBars") ?? "").trim();
      participant.tokenDisplay.displayName = TOKEN_DISPLAY_MODE_KEYS.includes(displayName) ? displayName : null;
      participant.tokenDisplay.displayBars = TOKEN_DISPLAY_MODE_KEYS.includes(displayBars) ? displayBars : null;
      participant.tokenDisplay.hpBarAttribute = "attributes.hp";
    }

    const groupById = new Map((next.groups ?? []).map((group) => [group.id, group]));
    for (const row of root.querySelectorAll(".encounter-forge-group-row[data-group-id]")) {
      const group = groupById.get(row.dataset.groupId);
      if (!group) continue;
      const name = row.querySelector('[data-group-field="name"]')?.value;
      group.name = String(name ?? group.name ?? group.id).trim() || group.id;
    }

    this.draft = next;
    this.#updateDirtyIndicator();
    this.#updateBudgetDisplay();
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

  #updateBudgetDisplay() {
    const root = this.element;
    if (!(root instanceof HTMLElement)) return;
    const budget = analyzeEncounterBudget({
      participants: this.draft?.participants ?? [],
      partyLevel: this.draft?.party?.level ?? 1,
      partySize: this.draft?.party?.size ?? 4,
      threat: this.draft?.threat?.target ?? "moderate",
      budgetOverride: this.draft?.threat?.budget
    });
    const set = (selector, value) => { const el = root.querySelector(selector); if (el) el.textContent = value; };
    set("[data-budget-used]", String(budget.usedXp));
    set("[data-budget-target]", String(budget.targetXp));
    set("[data-budget-automatic]", String(budget.automaticTarget));
    set("[data-structure-participant-count]", String((this.draft?.participants ?? []).reduce((sum, participant) => sum + (Number(participant.quantity) || 1), 0)));
    set("[data-budget-status]", localize(`PF2E_ENCOUNTER_FORGE.Budget.Status.${budget.status}`, budget.status));
    set("[data-budget-remaining]", String(Math.abs(budget.remainingXp)));
    set("[data-budget-remaining-label]", budget.remainingXp >= 0
      ? localize("PF2E_ENCOUNTER_FORGE.Budget.Remaining", "Remaining")
      : localize("PF2E_ENCOUNTER_FORGE.Budget.Over", "Over budget"));
    const box = root.querySelector("[data-budget-summary]");
    if (box) box.dataset.status = budget.status;
    const warning = root.querySelector("[data-budget-warning]");
    if (warning instanceof HTMLElement) warning.hidden = budget.unknownCount === 0;

    for (const row of budget.rows) {
      set(`[data-participant-xp="${row.id}"]`, Number.isFinite(row.totalXp) ? String(row.totalXp) : "—");
      set(`[data-participant-xp-each="${row.id}"]`, Number.isFinite(row.xpEach) ? String(row.xpEach) : "—");
      set(`[data-participant-xp-quantity="${row.id}"]`, String(row.quantity));
      const card = root.querySelector(`[data-participant-id="${row.id}"]`);
      const xpBox = card?.querySelector?.(".encounter-forge-participant-xp");
      xpBox?.classList?.toggle?.("unsupported", !row.supported);
      if (xpBox instanceof HTMLElement) {
        xpBox.dataset.delta = Number.isInteger(row.delta) ? String(row.delta) : "";
        xpBox.dataset.supported = String(Boolean(row.supported));
      }
    }
  }

  async #confirmDiscardIfNeeded() {
    this.#syncDraftFromForm();
    if (!this.isDirty) return true;
    return confirmDialog("PF2E_ENCOUNTER_FORGE.Dialogs.DiscardTitle", "PF2E_ENCOUNTER_FORGE.Dialogs.DiscardPrompt");
  }

  #captureScrollState() {
    const root = this.element;
    if (!(root instanceof HTMLElement)) return null;
    const editor = root.querySelector(".encounter-forge-editor");
    const library = root.querySelector(".encounter-forge-blueprint-list");
    const integrations = root.querySelector(".encounter-forge-integration-list");
    return {
      editorTop: editor instanceof HTMLElement ? editor.scrollTop : 0,
      editorLeft: editor instanceof HTMLElement ? editor.scrollLeft : 0,
      libraryTop: library instanceof HTMLElement ? library.scrollTop : 0,
      integrationsTop: integrations instanceof HTMLElement ? integrations.scrollTop : 0
    };
  }

  #restoreScrollState() {
    const state = this.pendingScrollState;
    this.pendingScrollState = null;
    if (!state) return;
    const root = this.element;
    if (!(root instanceof HTMLElement)) return;
    const editor = root.querySelector(".encounter-forge-editor");
    const library = root.querySelector(".encounter-forge-blueprint-list");
    const integrations = root.querySelector(".encounter-forge-integration-list");
    if (editor instanceof HTMLElement) {
      editor.scrollTop = state.editorTop;
      editor.scrollLeft = state.editorLeft;
    }
    if (library instanceof HTMLElement) library.scrollTop = state.libraryTop;
    if (integrations instanceof HTMLElement) integrations.scrollTop = state.integrationsTop;
  }

  async #renderFresh({ preserveScroll = true } = {}) {
    this.pendingScrollState = preserveScroll ? this.#captureScrollState() : null;
    await this.render({ force: true });
  }


  #addParticipant(payload = {}) {
    const participant = {
      id: randomId("participant"),
      name: String(payload.name ?? localize("PF2E_ENCOUNTER_FORGE.Participants.NewParticipant", "Participant")),
      img: payload.img ?? null,
      level: payload.level !== null && payload.level !== "" && Number.isInteger(Number(payload.level)) ? Number(payload.level) : null,
      source: clone(payload.source ?? { type: "document", uuid: null }),
      quantity: 1,
      role: normalizeSuggestedRole(payload.suggestedRole),
      groupId: null,
      tacticsProfileId: null,
      tokenDisplay: { displayName: null, displayBars: null, hpBarAttribute: "attributes.hp" },
      adjustments: [],
      overrides: {}
    };
    const next = clone(this.draft);
    next.participants ??= [];
    next.participants.push(participant);
    this.draft = next;
    return participant;
  }

  async #addActorFromUuid(uuid) {
    if (!uuid || typeof globalThis.fromUuid !== "function") return false;
    const actor = await globalThis.fromUuid(uuid);
    if (!actor || actor.documentName !== "Actor" || actor.type !== "npc") {
      ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.ActorMustBeNpc", "Only PF2e NPC Actors can be added as encounter participants."));
      return false;
    }
    const pack = actor.pack ? game.packs?.get?.(actor.pack) : null;
    this.#addParticipant({
      name: actor.name,
      img: actor.img,
      level: actorLevel(actor),
      source: {
        type: "document",
        uuid: actor.uuid,
        label: pack?.metadata?.label ?? (actor.pack ? actor.pack : localize("PF2E_ENCOUNTER_FORGE.Participants.WorldActors", "World Actors"))
      }
    });
    await this.#renderFresh();
    return true;
  }

  async #handleParticipantDrop(event) {
    this.#syncDraftFromForm();
    let data = null;
    try { data = globalThis.TextEditor?.getDragEventData?.(event) ?? null; } catch { data = null; }
    const uuid = data?.uuid ?? null;
    if (!uuid) {
      ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.ActorDropUnsupported", "Drop an Actor from the sidebar or an Actor compendium here."));
      return;
    }
    try { await this.#addActorFromUuid(uuid); }
    catch (error) {
      console.error(`${MODULE_ID} | Participant drop failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.ParticipantAddFailed", "Participant could not be added."));
    }
  }

  #trackChild(app) {
    if (app) this.childApps.add(app);
    return app;
  }

  async #openForgeParticipantEditor(kind, participant = null) {
    const source = participant?.source?.type === kind ? participant.source : null;
    const app = this.#trackChild(new ForgeParticipantEditorApp({
      kind,
      partyLevel: this.draft?.party?.level ?? 1,
      source,
      onCommit: async (payload) => {
        this.#syncDraftFromForm();
        if (participant) {
          const next = clone(this.draft);
          const target = next.participants?.find?.((entry) => entry.id === participant.id);
          if (target) {
            target.source = clone(payload.source);
            target.name = payload.name ?? target.name;
            target.level = payload.level !== null && payload.level !== "" && Number.isInteger(Number(payload.level)) ? Number(payload.level) : target.level;
            target.img = payload.img ?? target.img;
            target.role ??= normalizeSuggestedRole(payload.suggestedRole);
          }
          this.draft = next;
        } else {
          this.#addParticipant(payload);
        }
        await this.#renderFresh();
      }
    }));
    await app.render({ force: true });
  }



  static async browseParticipant() {
    this.#syncDraftFromForm();
    const app = this.#trackChild(new ParticipantBrowserApp({ onSelect: (uuid) => this.#addActorFromUuid(uuid) }));
    await app.initialize();
    await app.render({ force: true });
  }

  static async addCreatureForgeParticipant() {
    this.#syncDraftFromForm();
    await this.#openForgeParticipantEditor("creatureForge");
  }

  static async addNpcForgeParticipant() {
    this.#syncDraftFromForm();
    await this.#openForgeParticipantEditor("npcForge");
  }

  static async editParticipant(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.participantId;
    const participant = this.draft?.participants?.find?.((entry) => entry.id === id);
    if (!participant) return;
    if (participant.source?.type === "creatureForge" || participant.source?.type === "npcForge") {
      await this.#openForgeParticipantEditor(participant.source.type, participant);
      return;
    }
    if (participant.source?.type === "document" && participant.source?.uuid && typeof globalThis.fromUuid === "function") {
      const actor = await globalThis.fromUuid(participant.source.uuid);
      actor?.sheet?.render?.({ force: true });
    }
  }

  static async removeParticipant(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.participantId;
    if (!id) return;
    const next = clone(this.draft);
    next.participants = (next.participants ?? []).filter((entry) => entry.id !== id);
    this.draft = next;
    await this.#renderFresh();
  }

  static async addGroup() {
    this.#syncDraftFromForm();
    const next = clone(this.draft);
    next.groups ??= [];
    const number = next.groups.length + 1;
    next.groups.push({ id: randomId("group"), name: `${localize("PF2E_ENCOUNTER_FORGE.Participants.Group", "Group")} ${number}` });
    this.draft = next;
    await this.#renderFresh();
  }

  static async removeGroup(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.groupId;
    if (!id) return;
    const next = clone(this.draft);
    next.groups = (next.groups ?? []).filter((entry) => entry.id !== id);
    for (const participant of next.participants ?? []) if (participant.groupId === id) participant.groupId = null;
    this.draft = next;
    await this.#renderFresh();
  }

  static async toggleIntegrations() {
    this.#syncDraftFromForm();
    this.integrationsExpanded = !this.integrationsExpanded;
    await this.#renderFresh();
  }

  static async toggleIntegration(_event, target) {
    this.#syncDraftFromForm();
    const id = String(target?.dataset?.integrationId ?? "").trim();
    if (!id) return;
    const api = getApi();
    const status = api?.integrations?.status?.(id);
    if (!status?.ready || !api?.integrations?.setEnabled) return;
    const enabled = !status.enabled;
    await api.integrations.setEnabled(id, enabled);
    ui.notifications.info(localize(
      enabled ? "PF2E_ENCOUNTER_FORGE.Notifications.IntegrationEnabled" : "PF2E_ENCOUNTER_FORGE.Notifications.IntegrationDisabled",
      enabled ? "Integration enabled." : "Integration disabled."
    ));
    await this.#renderFresh();
  }

  static async detectParty() {
    this.#syncDraftFromForm();
    const detection = getApi()?.party?.detect?.() ?? null;
    this.partyDetection = detection;
    if (!detection?.available) {
      ui.notifications.warn(localize(
        "PF2E_ENCOUNTER_FORGE.Notifications.PartyNotDetected",
        "No player characters could be detected."
      ));
      await this.#renderFresh();
      return;
    }

    const next = clone(this.draft);
    next.party ??= {};
    next.party.size = detection.size;
    next.party.level = detection.partyLevel;
    this.draft = next;
    ui.notifications.info(localize(
      "PF2E_ENCOUNTER_FORGE.Notifications.PartyDetected",
      "Party size and level were updated from the current player characters."
    ));
    await this.#renderFresh();
  }

  static async newBlueprint() {
    if (!await this.#confirmDiscardIfNeeded()) return;
    this.#resetDraft();
    await this.#renderFresh({ preserveScroll: false });
  }

  static async selectBlueprint(_event, target) {
    const id = target?.dataset?.blueprintId;
    if (!id || id === this.selectedBlueprintId) return;
    if (!await this.#confirmDiscardIfNeeded()) return;
    if (this.#loadBlueprint(id)) await this.#renderFresh({ preserveScroll: false });
  }

  async #persistDraft({ notify = true } = {}) {
    const api = getApi();
    if (!api?.blueprints?.save) return null;
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
      return null;
    }

    try {
      const saved = await api.blueprints.save(normalized);
      this.draft = clone(normalized);
      this.selectedBlueprintId = normalized.id;
      this.savedSnapshot = JSON.stringify(this.draft);
      await this.#reloadBlueprints();
      if (notify) ui.notifications.info(localize("PF2E_ENCOUNTER_FORGE.Notifications.Saved", "Encounter saved."));
      return { saved, blueprint: normalized };
    } catch (error) {
      console.error(`${MODULE_ID} | Saving encounter blueprint failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.SaveFailed", "Encounter could not be saved."));
      return null;
    }
  }

  static async deployEncounter() {
    const persisted = await this.#persistDraft({ notify: false });
    if (!persisted) return;
    if (!(persisted.blueprint.participants ?? []).length) {
      ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.DeploymentNeedsParticipants", "Add at least one participant before deployment."));
      return;
    }

    const api = getApi();
    const blueprintUuid = persisted.saved?.document?.uuid ?? api?.blueprints?.get?.(persisted.blueprint.id)?.document?.uuid ?? null;

    // Refresh the parent before opening the modal-like child. Rendering the parent after
    // the deployment dialog would put the Encounter Forge back above its own child.
    await this.#renderFresh();

    const app = this.#trackChild(new EncounterDeploymentDialogApp({
      blueprint: clone(persisted.blueprint),
      blueprintUuid,
      onDeploy: async (options) => {
        const interactive = options.placeTokens && options.placementMode === "interactive";
        let completed = false;
        if (interactive) await this.minimize?.();
        try {
          const result = await api?.deployment?.deploy?.(persisted.blueprint, { ...options, blueprintUuid });
          if (!result) return false;
          completed = true;
          const actorCount = result.actors?.length ?? 0;
          const tokenCount = result.tokens?.length ?? 0;
          const folderName = result.folder?.name ?? localize("PF2E_ENCOUNTER_FORGE.Deployment.ActorRoot", "Actor Directory root");
          const combatPrepared = Boolean(result.combat);
          ui.notifications.info(game.i18n.format?.("PF2E_ENCOUNTER_FORGE.Notifications.DeploymentComplete", {
            actors: actorCount,
            tokens: tokenCount,
            folder: folderName,
            combat: combatPrepared ? localize("PF2E_ENCOUNTER_FORGE.Deployment.CombatYes", "Combat prepared") : localize("PF2E_ENCOUNTER_FORGE.Deployment.CombatNo", "no Combat")
          }) ?? `${actorCount} Actors and ${tokenCount} Tokens prepared in ${folderName}.`);
          if (!interactive && options.viewScene && result.scene?.view) await result.scene.view();
          return result;
        } finally {
          // Manual placement needs the map unobstructed. On success the Forge stays
          // minimized so the GM can inspect the staged Scene; on cancellation/failure
          // restore it immediately.
          if (interactive && !completed) await this.maximize?.();
        }
      }
    }));
    await app.render({ force: true });
    app.bringToFront?.();
  }

  static async saveBlueprint() {
    const persisted = await this.#persistDraft({ notify: true });
    if (!persisted) return;
    await this.#renderFresh();
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
      await this.#renderFresh({ preserveScroll: false });
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
      await this.#renderFresh({ preserveScroll: false });
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
