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

function actorLevel(actor) {
  const value = actor?.system?.details?.level?.value ?? actor?.system?.details?.level ?? null;
  const level = Number(value);
  return Number.isInteger(level) ? level : null;
}

function normalizeIndex(index) {
  if (!index) return [];
  if (Array.isArray(index)) return index;
  if (Array.isArray(index.contents)) return index.contents;
  if (typeof index.values === "function") return [...index.values()];
  return [];
}

export class ParticipantBrowserApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pf2e-encounter-forge-participant-browser",
    classes: ["pf2e-encounter-forge", "encounter-participant-browser"],
    window: {
      title: "PF2E_ENCOUNTER_FORGE.Participants.BrowserTitle",
      icon: "fa-solid fa-book-open",
      resizable: true
    },
    position: { width: 760, height: 680 },
    actions: {
      selectActor: ParticipantBrowserApp.selectActor
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/participant-browser-app.hbs` }
  };

  constructor({ onSelect = null, ...options } = {}) {
    super(options);
    this.onSelect = onSelect;
    this.sourceId = "world";
    this.rows = [];
    this.loading = false;
  }

  async initialize() {
    await this.#loadSource("world");
    return this;
  }

  async _prepareContext() {
    const packs = (game.packs ?? []).filter?.((pack) => pack?.documentName === "Actor") ?? [];
    const sourceOptions = [
      { id: "world", label: localize("PF2E_ENCOUNTER_FORGE.Participants.WorldActors", "World Actors"), selected: this.sourceId === "world" },
      ...packs.map((pack) => ({
        id: pack.collection,
        label: pack.metadata?.label ?? pack.title ?? pack.collection,
        selected: this.sourceId === pack.collection
      })).sort((a, b) => a.label.localeCompare(b.label, game.i18n?.lang))
    ];
    return {
      sourceOptions,
      rows: this.rows,
      loading: this.loading,
      empty: !this.loading && this.rows.length === 0
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!(root instanceof HTMLElement)) return;

    const source = root.querySelector("[data-participant-browser-source]");
    source?.addEventListener("change", async (event) => {
      const id = event.currentTarget?.value ?? "world";
      await this.#loadSource(id);
      await this.render({ force: true });
    });

    const search = root.querySelector("[data-participant-browser-search]");
    search?.addEventListener("input", () => this.#applyFilter(search.value));
  }

  #applyFilter(value) {
    const needle = String(value ?? "").trim().toLocaleLowerCase(game.i18n?.lang);
    for (const row of this.element?.querySelectorAll?.("[data-actor-row]") ?? []) {
      const haystack = String(row.dataset.search ?? "").toLocaleLowerCase(game.i18n?.lang);
      row.hidden = Boolean(needle) && !haystack.includes(needle);
    }
  }

  async #loadSource(sourceId) {
    this.sourceId = sourceId || "world";
    this.loading = true;
    try {
      if (this.sourceId === "world") {
        this.rows = (game.actors?.contents ?? game.actors ?? [])
          .filter((actor) => actor?.type === "npc")
          .map((actor) => ({
            uuid: actor.uuid,
            name: actor.name,
            img: actor.img,
            level: actorLevel(actor),
            levelText: Number.isInteger(actorLevel(actor)) ? String(actorLevel(actor)) : "—",
            source: localize("PF2E_ENCOUNTER_FORGE.Participants.WorldActors", "World Actors"),
            search: `${actor.name ?? ""} ${actorLevel(actor) ?? ""}`
          }))
          .sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n?.lang));
        return;
      }

      const pack = game.packs?.get?.(this.sourceId) ?? [...(game.packs ?? [])].find((entry) => entry.collection === this.sourceId);
      if (!pack) {
        this.rows = [];
        return;
      }
      const index = await pack.getIndex({ fields: ["name", "img", "type", "system.details.level.value"] });
      const label = pack.metadata?.label ?? pack.title ?? pack.collection;
      this.rows = normalizeIndex(index)
        .filter((entry) => !entry?.type || entry.type === "npc")
        .map((entry) => {
          const levelValue = entry?.system?.details?.level?.value ?? entry?.system?.details?.level ?? null;
          const level = Number(levelValue);
          const id = entry._id ?? entry.id;
          return {
            uuid: entry.uuid ?? `Compendium.${pack.collection}.Actor.${id}`,
            name: entry.name ?? localize("PF2E_ENCOUNTER_FORGE.Editor.Untitled", "Untitled"),
            img: entry.img ?? null,
            level: Number.isInteger(level) ? level : null,
            levelText: Number.isInteger(level) ? String(level) : "—",
            source: label,
            search: `${entry.name ?? ""} ${Number.isInteger(level) ? level : ""}`
          };
        })
        .sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n?.lang));
    } catch (error) {
      console.error(`${MODULE_ID} | Loading participant source failed.`, error);
      this.rows = [];
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.SourceLoadFailed", "Actor source could not be loaded."));
    } finally {
      this.loading = false;
    }
  }

  static async selectActor(_event, target) {
    const uuid = target?.dataset?.uuid;
    if (!uuid) return;
    try {
      await this.onSelect?.(uuid);
      await this.close();
    } catch (error) {
      console.error(`${MODULE_ID} | Selecting participant Actor failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.ParticipantAddFailed", "Participant could not be added."));
    }
  }
}
