import { collectionContents } from "../utils/data.js";
import { EncounterForgeError } from "../utils/errors.js";
import { isIntegrationEnabled } from "./integration-settings.js";

function moduleCollection(gameRef) {
  return gameRef?.modules ?? globalThis.game?.modules ?? null;
}

function findModule(collection, id) {
  if (!collection) return null;
  if (typeof collection.get === "function") return collection.get(id) ?? null;
  return collectionContents(collection).find((entry) => entry?.id === id) ?? null;
}

export class IntegrationRegistry {
  #entries = new Map();
  #gameRef;

  constructor({ gameRef = null } = {}) {
    this.#gameRef = gameRef;
  }

  register(descriptor, { replace = false } = {}) {
    const id = String(descriptor?.id ?? "").trim();
    const moduleId = String(descriptor?.moduleId ?? "").trim();
    if (!id || !moduleId) throw new TypeError("Integration descriptor requires id and moduleId.");
    if (this.#entries.has(id) && !replace) throw new EncounterForgeError(`Integration '${id}' is already registered.`, { code: "INTEGRATION_DUPLICATE" });
    const normalized = Object.freeze({
      id,
      moduleId,
      label: String(descriptor.label ?? id),
      optional: descriptor.optional !== false,
      capabilities: Object.freeze([...(descriptor.capabilities ?? [])].map(String)),
      ready: typeof descriptor.ready === "function" ? descriptor.ready : ((api) => Boolean(api)),
      inspect: typeof descriptor.inspect === "function" ? descriptor.inspect : null
    });
    this.#entries.set(id, normalized);
    return normalized;
  }

  unregister(id) {
    return this.#entries.delete(String(id));
  }

  get(id) {
    return this.#entries.get(String(id)) ?? null;
  }

  list() {
    return [...this.#entries.values()];
  }

  api(id) {
    const descriptor = this.get(id);
    if (!descriptor) return null;
    if (!isIntegrationEnabled(descriptor.id, { gameRef: this.#gameRef ?? globalThis.game })) return null;
    const module = findModule(moduleCollection(this.#gameRef), descriptor.moduleId);
    return module?.active ? (module.api ?? null) : null;
  }

  status(id) {
    const descriptor = this.get(id);
    if (!descriptor) return { id: String(id), registered: false, installed: false, active: false, available: false, ready: false, capabilities: [] };
    const module = findModule(moduleCollection(this.#gameRef), descriptor.moduleId);
    const api = module?.active ? (module.api ?? null) : null;
    const enabled = isIntegrationEnabled(descriptor.id, { gameRef: this.#gameRef ?? globalThis.game });
    let ready = false;
    try { ready = Boolean(module?.active && descriptor.ready(api, module)); } catch { ready = false; }
    const usable = Boolean(enabled && ready);
    let details = null;
    if (descriptor.inspect && api) {
      try { details = descriptor.inspect(api, module) ?? null; } catch (error) { details = { error: error?.message ?? String(error) }; }
    }
    return {
      id: descriptor.id,
      moduleId: descriptor.moduleId,
      label: descriptor.label,
      registered: true,
      optional: descriptor.optional,
      installed: Boolean(module),
      active: Boolean(module?.active),
      available: Boolean(api),
      enabled,
      ready,
      usable,
      moduleVersion: module?.version ?? null,
      apiVersion: api?.version ?? api?.apiVersion ?? null,
      capabilities: [...descriptor.capabilities],
      details
    };
  }

  statusAll() {
    return Object.fromEntries(this.list().map((entry) => [entry.id, this.status(entry.id)]));
  }
}
