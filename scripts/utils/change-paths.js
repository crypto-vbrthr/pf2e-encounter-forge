function splitKey(key) {
  return String(key ?? "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
}

function collectChangedLeafPaths(value, prefix = [], result = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (prefix.length) result.push(prefix.join(".").toLowerCase());
    return result;
  }

  const entries = Object.entries(value);
  if (!entries.length) {
    if (prefix.length) result.push(prefix.join(".").toLowerCase());
    return result;
  }

  for (const [key, child] of entries) {
    const next = [...prefix, ...splitKey(key)];
    collectChangedLeafPaths(child, next, result);
  }
  return result;
}

/**
 * Return true when a Foundry update payload touches any of the supplied document paths.
 * Foundry hooks can expose changes either as flattened keys ("system.attributes.hp.value")
 * or as nested objects ({ system: { attributes: { hp: { value: 12 }}}}).
 */
export function changeTouchesPath(change, paths = []) {
  const targets = paths
    .map((path) => String(path ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (!targets.length) return false;

  const leaves = collectChangedLeafPaths(change ?? {});
  return leaves.some((leaf) => targets.some((target) =>
    leaf === target ||
    leaf.startsWith(`${target}.`) ||
    leaf.endsWith(`.${target}`) ||
    leaf.includes(`.${target}.`)
  ));
}

export function hpChangeDetected(change) {
  return changeTouchesPath(change, ["system.attributes.hp", "attributes.hp"]);
}
