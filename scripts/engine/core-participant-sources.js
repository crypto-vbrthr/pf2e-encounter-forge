import { MODULE_ID } from "../constants.js";
import { deepClone } from "../utils/data.js";
import { EncounterForgeError } from "../utils/errors.js";

async function resolveUuid(uuid) {
  if (typeof globalThis.fromUuid !== "function") throw new EncounterForgeError("Foundry fromUuid() is unavailable.", { code: "FOUNDRY_UUID_UNAVAILABLE" });
  return globalThis.fromUuid(uuid);
}

function actorResult(value) {
  return value?.actor ?? value ?? null;
}

async function stampActor(actor, context, source) {
  if (!actor?.update) return actor;
  const payload = {
    source: deepClone(source),
    blueprintId: context.blueprintId ?? null,
    participantTemplateId: context.participantTemplateId ?? null,
    createdForInstanceId: context.instanceId ?? null
  };
  await actor.update({ [`flags.${MODULE_ID}.participant`]: payload }, { render: false });
  return actor;
}

function folderId(context) {
  return context.actorFolderId ?? context.folder ?? null;
}

export function registerCoreParticipantSources(registry, integrations) {
  registry.register("document", {
    validate: (source) => ({
      valid: Boolean(source?.uuid),
      errors: source?.uuid ? [] : [{ code: "DOCUMENT_UUID", message: "Document participant source requires uuid." }],
      warnings: []
    }),
    preview: async (source) => {
      const document = await resolveUuid(source.uuid);
      return document ? { name: document.name, img: document.img, type: document.type, uuid: document.uuid } : null;
    },
    materialize: async (source, context = {}) => {
      const document = await resolveUuid(source.uuid);
      if (!document || document.documentName !== "Actor") throw new EncounterForgeError(`Participant source '${source.uuid}' is not an Actor.`, { code: "PARTICIPANT_DOCUMENT_NOT_ACTOR" });
      const data = document.toObject();
      delete data._id;
      data.folder = folderId(context);
      data.flags ??= {};
      const ActorClass = globalThis.Actor;
      if (!ActorClass?.create) throw new EncounterForgeError("Foundry Actor.create() is unavailable.", { code: "FOUNDRY_ACTOR_UNAVAILABLE" });
      const actor = await ActorClass.create(data, { renderSheet: false });
      return stampActor(actor, context, source);
    }
  });

  registry.register("creatureForge", {
    validate: (source) => ({
      valid: Boolean(source?.blueprint || source?.request),
      errors: source?.blueprint || source?.request ? [] : [{ code: "CREATURE_SOURCE", message: "Creature Forge source requires blueprint or request." }],
      warnings: []
    }),
    materialize: async (source, context = {}) => {
      const api = integrations.api("creatureForge");
      if (!api) throw new EncounterForgeError("Creature Forge API is unavailable.", { code: "CREATURE_FORGE_UNAVAILABLE" });
      const blueprint = source.blueprint ?? await api.generateAsync(source.request ?? {});
      const result = await api.createActor(blueprint, { folder: folderId(context), renderSheet: false });
      const actor = actorResult(result);
      if (!actor) throw new EncounterForgeError("Creature Forge did not return an Actor.", { code: "CREATURE_FORGE_ACTOR_MISSING" });
      return stampActor(actor, context, { type: "creatureForge", blueprintId: blueprint?.id ?? null, request: source.request ?? null });
    }
  });

  registry.register("npcForge", {
    validate: (source) => ({
      valid: Boolean(source?.npc || source?.request),
      errors: source?.npc || source?.request ? [] : [{ code: "NPC_SOURCE", message: "NPC Forge source requires npc or request." }],
      warnings: []
    }),
    materialize: async (source, context = {}) => {
      const api = integrations.api("npcForge");
      if (!api) throw new EncounterForgeError("NPC Forge API is unavailable.", { code: "NPC_FORGE_UNAVAILABLE" });
      const npc = source.npc ?? api.engine.generate(source.request ?? {});
      const result = await api.documents.createActor(npc, { folder: folderId(context), renderSheet: false });
      const actor = actorResult(result);
      if (!actor) throw new EncounterForgeError("NPC Forge did not return an Actor.", { code: "NPC_FORGE_ACTOR_MISSING" });
      return stampActor(actor, context, { type: "npcForge", generation: npc?.generation ?? null });
    }
  });

  return registry;
}
