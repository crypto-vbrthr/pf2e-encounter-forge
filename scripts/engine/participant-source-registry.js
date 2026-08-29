import { deepClone } from "../utils/data.js";
import { EncounterForgeError } from "../utils/errors.js";

export class ParticipantSourceRegistry {
  #handlers = new Map();

  register(type, handler, { replace = false, priority = 0 } = {}) {
    const key = String(type ?? "").trim();
    if (!key) throw new TypeError("Participant source type is required.");
    if (!handler || typeof handler.materialize !== "function") throw new TypeError(`Participant source '${key}' requires materialize().`);
    if (this.#handlers.has(key) && !replace) throw new EncounterForgeError(`Participant source '${key}' is already registered.`, { code: "PARTICIPANT_SOURCE_DUPLICATE" });
    const entry = Object.freeze({
      type: key,
      priority: Number(priority) || 0,
      canHandle: typeof handler.canHandle === "function" ? handler.canHandle : ((source) => source?.type === key),
      validate: typeof handler.validate === "function" ? handler.validate : (() => ({ valid: true, errors: [], warnings: [] })),
      preview: typeof handler.preview === "function" ? handler.preview : null,
      materialize: handler.materialize
    });
    this.#handlers.set(key, entry);
    return entry;
  }

  unregister(type) { return this.#handlers.delete(String(type)); }
  get(type) { return this.#handlers.get(String(type)) ?? null; }
  list() { return [...this.#handlers.values()].sort((a, b) => b.priority - a.priority || a.type.localeCompare(b.type)); }

  resolve(source) {
    if (source?.type && this.#handlers.has(String(source.type))) return this.#handlers.get(String(source.type));
    return this.list().find((entry) => {
      try { return entry.canHandle(source); } catch { return false; }
    }) ?? null;
  }

  validate(source) {
    const handler = this.resolve(source);
    if (!handler) return { valid: false, errors: [{ code: "SOURCE_UNSUPPORTED", message: `No participant source handler for '${source?.type ?? "unknown"}'.` }], warnings: [] };
    return handler.validate(deepClone(source));
  }

  async preview(source, context = {}) {
    const handler = this.resolve(source);
    if (!handler) throw new EncounterForgeError(`No participant source handler for '${source?.type ?? "unknown"}'.`, { code: "PARTICIPANT_SOURCE_UNSUPPORTED" });
    return handler.preview ? handler.preview(deepClone(source), context) : null;
  }

  async materialize(source, context = {}) {
    const handler = this.resolve(source);
    if (!handler) throw new EncounterForgeError(`No participant source handler for '${source?.type ?? "unknown"}'.`, { code: "PARTICIPANT_SOURCE_UNSUPPORTED" });
    const report = handler.validate(deepClone(source));
    if (report?.valid === false) throw new EncounterForgeError(report.errors?.map((entry) => entry.message).join("; ") || "Participant source is invalid.", { code: "PARTICIPANT_SOURCE_INVALID", details: report });
    return handler.materialize(deepClone(source), context);
  }
}
