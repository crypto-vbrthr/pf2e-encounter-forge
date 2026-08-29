export class EncounterEventBus {
  #listeners = new Map();

  on(type, listener) {
    if (typeof listener !== "function") throw new TypeError("Event listener must be a function.");
    const key = String(type);
    const set = this.#listeners.get(key) ?? new Set();
    set.add(listener);
    this.#listeners.set(key, set);
    return () => this.off(key, listener);
  }

  off(type, listener) {
    const set = this.#listeners.get(String(type));
    if (!set) return false;
    const removed = set.delete(listener);
    if (set.size === 0) this.#listeners.delete(String(type));
    return removed;
  }

  async emit(type, payload) {
    const listeners = [...(this.#listeners.get(String(type)) ?? [])];
    const results = [];
    for (const listener of listeners) results.push(await listener(payload));
    return results;
  }

  clear() { this.#listeners.clear(); }
  listenerCount(type) { return this.#listeners.get(String(type))?.size ?? 0; }
}
