function sceneId(value) {
  if (!value) return null;
  if (typeof value === "string") return value.replace(/^Scene\./, "");
  return value.id ?? value._id ?? null;
}

function sceneIdFromTokenUuid(value) {
  const match = String(value ?? "").match(/^Scene\.([^.]+)\.Token\./);
  return match?.[1] ?? null;
}

function tokenIdFromTokenUuid(value) {
  const match = String(value ?? "").match(/^Scene\.[^.]+\.Token\.([^.]+)$/);
  return match?.[1] ?? null;
}

function combatantsOf(combat) {
  const collection = combat?.combatants;
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return Array.from(collection.values());
  return [];
}

export function directCombatSceneId(combat) {
  return sceneId(combat?.scene) ?? sceneId(combat?.sceneId) ?? sceneId(combat?._source?.scene) ?? sceneId(combat?._source?.sceneId);
}

export function combatantSceneIds(combat) {
  const ids = new Set();
  for (const combatant of combatantsOf(combat)) {
    const direct = sceneId(combatant?.sceneId)
      ?? sceneId(combatant?.scene)
      ?? sceneId(combatant?._source?.sceneId)
      ?? sceneId(combatant?._source?.scene)
      ?? sceneId(combatant?.token?.parent)
      ?? sceneId(combatant?.token?.scene);
    if (direct) ids.add(direct);
    const fromUuid = sceneIdFromTokenUuid(combatant?.token?.uuid ?? combatant?.tokenUuid);
    if (fromUuid) ids.add(fromUuid);
  }
  return ids;
}

export function combatTokenIds(combat) {
  const ids = new Set();
  for (const combatant of combatantsOf(combat)) {
    const id = combatant?.tokenId
      ?? combatant?.token?.id
      ?? combatant?._source?.tokenId
      ?? tokenIdFromTokenUuid(combatant?.token?.uuid ?? combatant?.tokenUuid);
    if (id) ids.add(String(id));
  }
  return ids;
}

export function instanceTokenIds(instance) {
  const ids = new Set();
  for (const uuid of instance?.deployment?.tokenUuids ?? []) {
    const id = tokenIdFromTokenUuid(uuid);
    if (id) ids.add(id);
  }
  for (const participant of instance?.participants ?? []) {
    const values = [participant?.tokenUuid, ...(participant?.tokenUuids ?? [])];
    for (const uuid of values) {
      const id = tokenIdFromTokenUuid(uuid);
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function combatOverlapsInstanceTokens(combat, instance) {
  const combatIds = combatTokenIds(combat);
  const encounterIds = instanceTokenIds(instance);
  if (!combatIds.size || !encounterIds.size) return false;
  for (const id of combatIds) if (encounterIds.has(id)) return true;
  return false;
}

export function canvasSceneId(gameRef = globalThis.game) {
  return sceneId(globalThis.canvas?.scene)
    ?? sceneId(gameRef?.scenes?.current)
    ?? sceneId(gameRef?.scenes?.active);
}

export function combatSceneContext(combat, { instance = null, gameRef = globalThis.game } = {}) {
  const directSceneId = directCombatSceneId(combat);
  const combatantScenes = combatantSceneIds(combat);
  const encounterSceneId = sceneId(instance?.deployment?.sceneUuid);
  const tokenOverlap = Boolean(instance && combatOverlapsInstanceTokens(combat, instance));
  const current = gameRef?.combat ?? null;
  const currentMatches = !current || current === combat || current?.id === combat?.id;
  const viewedSceneId = canvasSceneId(gameRef);

  let inferredSceneId = directSceneId;
  let sceneReason = directSceneId ? "combat-document" : null;
  if (!inferredSceneId && combatantScenes.size === 1) {
    inferredSceneId = [...combatantScenes][0];
    sceneReason = "combatant-scene";
  } else if (!inferredSceneId && tokenOverlap && encounterSceneId) {
    inferredSceneId = encounterSceneId;
    sceneReason = "encounter-token-overlap";
  } else if (!inferredSceneId && currentMatches && viewedSceneId) {
    inferredSceneId = viewedSceneId;
    sceneReason = "current-canvas-scene";
  }

  return {
    sceneId: inferredSceneId ?? null,
    directSceneId,
    combatantSceneIds: [...combatantScenes],
    tokenOverlap,
    viewedSceneId,
    sceneReason,
    currentMatches
  };
}

export { sceneId };
