function fallbackClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function deepClone(value) {
  const foundryClone = globalThis.foundry?.utils?.deepClone;
  if (typeof foundryClone === "function") return foundryClone(value);
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return fallbackClone(value);
}

export function randomId(prefix = "ef") {
  const foundryRandom = globalThis.foundry?.utils?.randomID;
  if (typeof foundryRandom === "function") return `${prefix}-${foundryRandom()}`;
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function asId(value, fallback = null) {
  const id = String(value ?? "").trim();
  return id || fallback;
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function uniqueStrings(values) {
  return [...new Set(asArray(values).map((value) => String(value ?? "").trim()).filter(Boolean))];
}

export function nowIso() {
  return new Date().toISOString();
}

export function collectionContents(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return [...collection.values()];
  return [];
}
