import { MODULE_ID } from "../constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function localize(key, fallback = key) {
  try {
    const value = game.i18n.localize(key);
    return value === key ? fallback : value;
  } catch {
    return fallback;
  }
}

function getEncounterApi() {
  return game.modules.get(MODULE_ID)?.api ?? null;
}

export class ForgeParticipantEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pf2e-encounter-forge-participant-forge-editor",
    classes: ["pf2e-encounter-forge", "encounter-participant-forge-editor"],
    window: {
      title: "PF2E_ENCOUNTER_FORGE.Participants.ForgeEditorTitle",
      icon: "fa-solid fa-hammer",
      resizable: true
    },
    position: { width: 1320, height: 860 },
    actions: {
      generateParticipant: ForgeParticipantEditorApp.generateParticipant,
      commitParticipant: ForgeParticipantEditorApp.commitParticipant,
      cancelParticipant: ForgeParticipantEditorApp.cancelParticipant
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/forge-participant-editor-app.hbs` }
  };

  constructor({ kind, partyLevel = 1, source = null, onCommit = null, ...options } = {}) {
    super(options);
    this.kind = kind;
    this.partyLevel = Number.isInteger(Number(partyLevel)) ? Number(partyLevel) : 1;
    this.source = source;
    this.onCommit = onCommit;
    this.editor = null;
    this.mounting = false;
  }

  async _prepareContext() {
    const isCreature = this.kind === "creatureForge";
    return {
      kind: this.kind,
      isNpc: this.kind === "npcForge",
      title: localize(
        isCreature ? "PF2E_ENCOUNTER_FORGE.Participants.CreatureForge" : "PF2E_ENCOUNTER_FORGE.Participants.NpcForge",
        isCreature ? "Creature Forge" : "NPC Forge"
      )
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#mountEditor().catch((error) => {
      console.error(`${MODULE_ID} | Embedded ${this.kind} editor mount failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.ForgeEditorFailed", "The Forge editor could not be opened."));
    });
  }

  async #mountEditor() {
    if (this.mounting || this.editor) return;
    this.mounting = true;
    try {
      const container = this.element?.querySelector?.("[data-forge-editor-mount]");
      if (!(container instanceof HTMLElement)) return;
      const api = getEncounterApi()?.integrations?.api?.(this.kind);
      if (!api) throw new Error(`${this.kind} API unavailable.`);

      if (this.kind === "creatureForge") {
        const factory = api.ui?.creatureEditor?.create;
        if (typeof factory !== "function") throw new Error("Creature Forge embedded editor API unavailable.");
        this.editor = factory({
          request: this.source?.request ?? { identity: { level: this.partyLevel } },
          blueprint: this.source?.blueprint ?? null,
          mode: this.source?.blueprint ? "edit" : "create",
          layout: "full",
          capabilities: {
            generation: true,
            actorCreation: false,
            sourceSelection: true,
            persistSourceSelection: false,
            advancedEditing: true,
            effectEditing: true,
            auraEditing: true,
            afflictionEditing: true
          }
        });
        await this.editor.mount(container, { layout: "full", minHeight: 660 });
        return;
      }

      if (this.kind === "npcForge") {
        const factory = api.ui?.createEditor;
        if (typeof factory !== "function") throw new Error("NPC Forge embedded editor API unavailable.");
        this.editor = factory({
          mode: "embedded",
          initialRequest: this.source?.request ?? { level: this.partyLevel },
          initialNpc: this.source?.npc ?? null,
          actionBar: "host",
          capabilities: { createActor: false, reroll: true, editInventory: true }
        });
        this.editor.mount(container);
        await this.editor.whenRendered?.();
        if (!this.editor.getNpc?.()) await this.editor.generate?.();
        return;
      }

      throw new Error(`Unsupported participant forge '${this.kind}'.`);
    } finally {
      this.mounting = false;
    }
  }

  async close(options = {}) {
    try { this.editor?.destroy?.(); } catch (error) { console.warn(`${MODULE_ID} | Embedded participant editor teardown failed.`, error); }
    this.editor = null;
    return super.close(options);
  }

  static async generateParticipant() {
    if (this.kind !== "npcForge" || !this.editor?.generate) return;
    try { await this.editor.generate(); }
    catch (error) {
      console.error(`${MODULE_ID} | NPC Forge generation failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.ForgeParticipantGenerateFailed", "The NPC could not be generated."));
    }
  }

  static async commitParticipant() {
    const api = getEncounterApi()?.integrations?.api?.(this.kind);
    if (!api || !this.editor) return;

    let payload = null;
    if (this.kind === "creatureForge") {
      const blueprint = this.editor.value;
      const validation = this.editor.validate?.();
      if (!blueprint || validation?.blueprint?.valid === false || validation?.request?.valid === false) {
        ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.ForgeParticipantInvalid", "Generate a valid creature before adding it."));
        return;
      }
      const request = this.editor.request ?? {};
      const rawLevel = blueprint.identity?.level ?? request.identity?.level ?? null;
      const resolvedLevel = rawLevel !== null && rawLevel !== "" && Number.isInteger(Number(rawLevel)) ? Number(rawLevel) : null;
      payload = {
        source: { type: "creatureForge", blueprint, request },
        name: blueprint.identity?.name || request.identity?.name || localize("PF2E_ENCOUNTER_FORGE.Participants.GeneratedCreature", "Generated Creature"),
        level: resolvedLevel,
        img: blueprint.identity?.img ?? request.identity?.img ?? null,
        suggestedRole: blueprint.identity?.role ?? request.identity?.role ?? null
      };
    } else if (this.kind === "npcForge") {
      const npc = this.editor.getNpc?.();
      const request = this.editor.getRequest?.();
      if (!npc) {
        ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.ForgeParticipantInvalid", "Generate a valid NPC before adding it."));
        return;
      }
      let actorSource = null;
      try { actorSource = api.documents?.toActorSource?.(npc) ?? null; } catch { actorSource = null; }
      payload = {
        source: { type: "npcForge", npc, request },
        name: actorSource?.name || npc.identity?.name || localize("PF2E_ENCOUNTER_FORGE.Participants.GeneratedNpc", "Generated NPC"),
        level: npc.build?.level !== null && npc.build?.level !== "" && Number.isInteger(Number(npc.build?.level)) ? Number(npc.build.level) : null,
        img: actorSource?.img ?? npc.identity?.img ?? null,
        suggestedRole: null
      };
    }

    if (!payload) return;
    await this.onCommit?.(payload);
    await this.close();
  }

  static async cancelParticipant() {
    await this.close();
  }
}
