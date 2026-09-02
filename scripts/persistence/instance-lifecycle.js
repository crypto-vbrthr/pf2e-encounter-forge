import { MODULE_ID } from "../constants.js";
import { deepClone } from "../utils/data.js";

function idFromUuid(value, prefix) {
  const text = String(value ?? "").trim();
  const match = new RegExp(`^${prefix}\\.([^.]+)(?:\\.|$)`).exec(text);
  return match?.[1] ?? null;
}

async function resolveDocument(uuid, { gameRef = globalThis.game, fromUuidRef = globalThis.fromUuid } = {}) {
  const value = String(uuid ?? "").trim();
  if (!value) return null;
  if (typeof fromUuidRef === "function") {
    try {
      const document = await fromUuidRef(value);
      if (document) return document;
    } catch {}
  }
  const sceneId = idFromUuid(value, "Scene");
  if (sceneId) return gameRef?.scenes?.get?.(sceneId) ?? null;
  const combatId = idFromUuid(value, "Combat");
  if (combatId) return gameRef?.combats?.get?.(combatId) ?? null;
  return null;
}

export async function cleanupEncounterInstanceRouting(instance, {
  instanceDocumentUuid = null,
  gameRef = globalThis.game,
  fromUuidRef = globalThis.fromUuid
} = {}) {
  const id = String(instance?.id ?? "").trim();
  if (!id) return { scene: false, combat: false };
  let sceneCleaned = false;
  let combatCleaned = false;

  const scene = await resolveDocument(instance?.deployment?.sceneUuid, { gameRef, fromUuidRef });
  if (scene?.update) {
    try {
      const instances = deepClone(scene.flags?.[MODULE_ID]?.instances ?? {});
      if (Object.prototype.hasOwnProperty.call(instances, id)) {
        delete instances[id];
        await scene.update({ [`flags.${MODULE_ID}.instances`]: instances }, { render: false });
        sceneCleaned = true;
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not remove deleted Encounter Instance routing from Scene '${scene?.name ?? scene?.id ?? "unknown"}'.`, error);
    }
  }

  const combat = await resolveDocument(instance?.deployment?.combatUuid, { gameRef, fromUuidRef });
  const encounterFlag = combat?.flags?.[MODULE_ID]?.encounter ?? null;
  const matchesCombat = encounterFlag && (
    String(encounterFlag.instanceId ?? "") === id
    || (instanceDocumentUuid && String(encounterFlag.instanceUuid ?? "") === String(instanceDocumentUuid))
  );
  if (matchesCombat) {
    try {
      if (typeof combat.unsetFlag === "function") await combat.unsetFlag(MODULE_ID, "encounter");
      else if (combat?.update) await combat.update({ [`flags.${MODULE_ID}.-=encounter`]: null }, { render: false });
      combatCleaned = true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not remove deleted Encounter Instance routing from Combat '${combat?.id ?? "unknown"}'.`, error);
    }
  }

  return { scene: sceneCleaned, combat: combatCleaned };
}

export async function deleteEncounterInstance(idOrUuid, {
  instanceRepository,
  runtime = null,
  gameRef = globalThis.game,
  fromUuidRef = globalThis.fromUuid
} = {}) {
  const entry = instanceRepository?.get?.(idOrUuid) ?? null;
  if (!entry?.data) return false;
  const instanceId = String(entry.data.id ?? "").trim();
  const runtimeStatus = runtime?.status?.() ?? {};
  if (instanceId && String(runtimeStatus.activeInstanceId ?? "") === instanceId) {
    await runtime.stop?.({ clear: true });
  }
  await cleanupEncounterInstanceRouting(entry.data, {
    instanceDocumentUuid: entry.document?.uuid ?? null,
    gameRef,
    fromUuidRef
  });
  return instanceRepository.delete(idOrUuid);
}
