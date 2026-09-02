function sceneIdFromUuid(value) {
  const text = String(value ?? "").trim();
  const match = /^Scene\.([^.]+)(?:\.|$)/.exec(text);
  return match?.[1] ?? null;
}

export function currentSceneId({ canvasRef = globalThis.canvas, gameRef = globalThis.game } = {}) {
  return String(
    canvasRef?.scene?.id
      ?? gameRef?.scenes?.current?.id
      ?? gameRef?.scenes?.active?.id
      ?? ""
  ).trim() || null;
}

export function currentSceneName({ canvasRef = globalThis.canvas, gameRef = globalThis.game } = {}) {
  return String(
    canvasRef?.scene?.name
      ?? gameRef?.scenes?.current?.name
      ?? gameRef?.scenes?.active?.name
      ?? ""
  ).trim() || null;
}

export function blueprintBoundSceneId(blueprint = {}) {
  const binding = blueprint?.sceneBinding;
  return String(binding?.sceneId ?? "").trim()
    || sceneIdFromUuid(binding?.sceneUuid)
    || null;
}

export function blueprintVisibleOnScene(blueprint = {}, sceneId = currentSceneId()) {
  const boundSceneId = blueprintBoundSceneId(blueprint);
  if (!boundSceneId) return true;
  return Boolean(sceneId) && String(sceneId) === boundSceneId;
}

export function instanceBlueprintForSceneFilter(instance = {}, api = null) {
  const reference = instance?.blueprint ?? {};
  if (reference.snapshot && typeof reference.snapshot === "object") return reference.snapshot;
  const entry = api?.blueprints?.get?.(reference.uuid ?? reference.id)
    ?? api?.blueprints?.get?.(reference.id)
    ?? null;
  return entry?.data ?? entry ?? null;
}

export function instanceVisibleOnScene(entryOrInstance = {}, { api = null, sceneId = currentSceneId() } = {}) {
  const instance = entryOrInstance?.data ?? entryOrInstance ?? {};
  const blueprint = instanceBlueprintForSceneFilter(instance, api);
  if (!blueprint) return true;
  return blueprintVisibleOnScene(blueprint, sceneId);
}
