import { MODULE_ID, ACTOR_MODES } from "../constants.js";
import { createEncounterInstance } from "../model/encounter-instance.js";
import { assertEncounterBlueprint } from "../model/encounter-blueprint.js";
import { deepClone, nowIso } from "../utils/data.js";
import { EncounterForgeError } from "../utils/errors.js";
import { ActorFolderService } from "./folder-service.js";

function actorUuid(actor) {
  if (actor?.uuid) return actor.uuid;
  if (actor?.id) return `Actor.${actor.id}`;
  return null;
}

async function resolveScene(sceneUuid) {
  if (!sceneUuid) return null;
  if (typeof globalThis.fromUuid === "function") {
    const scene = await globalThis.fromUuid(sceneUuid);
    if (scene?.documentName === "Scene") return scene;
  }
  const id = String(sceneUuid).replace(/^Scene\./, "");
  const scene = globalThis.game?.scenes?.get?.(id) ?? null;
  if (scene?.documentName === "Scene" || scene) return scene;
  throw new EncounterForgeError(`Scene '${sceneUuid}' was not found.`, { code: "SCENE_NOT_FOUND" });
}

function runtimeParticipantsForTemplate(instance, templateId) {
  return (instance.participants ?? []).filter((participant) => participant.templateId === templateId);
}

function participantDisplayName(template, runtimeParticipant, index, actorMode) {
  const base = String(template?.name ?? "Encounter Participant").trim() || "Encounter Participant";
  if (actorMode !== "per-participant") return base;
  const quantity = Math.max(1, Number.parseInt(template?.quantity ?? 1, 10) || 1);
  if (quantity <= 1) return base;
  return `${base} ${index + 1}`;
}

async function updateActorDeploymentMetadata(actor, { name, blueprint, instance, template, runtimeParticipantIds, actorMode, folderId }) {
  if (!actor?.update) return actor;
  const participantFlag = deepClone(actor.flags?.[MODULE_ID]?.participant ?? {});
  const payload = {
    ...participantFlag,
    blueprintId: blueprint.id,
    participantTemplateId: template.id,
    createdForInstanceId: instance.id,
    deployment: {
      actorMode,
      runtimeParticipantIds: [...runtimeParticipantIds],
      actorFolderId: folderId ?? null,
      materializedAt: nowIso()
    }
  };
  const update = { [`flags.${MODULE_ID}.participant`]: payload };
  if (name && actor.name !== name) update.name = name;

  // Do not rely on provider-specific createActor() implementations to honor a
  // Foundry folder option. Creature Forge currently creates the Actor first and
  // intentionally owns only Creature materialization, so Encounter Forge enforces
  // its deployment destination on the resulting World Actor here.
  const currentFolderId = actor.folder?.id ?? actor.folder ?? null;
  if ((folderId ?? null) !== currentFolderId) update.folder = folderId ?? null;

  await actor.update(update, { render: false });
  return actor;
}

async function stampInstanceUuidOnActor(actor, instanceUuid) {
  if (!actor?.update || !instanceUuid) return;
  try {
    await actor.update({ [`flags.${MODULE_ID}.participant.instanceUuid`]: instanceUuid }, { render: false });
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not stamp Encounter Instance UUID on Actor '${actor?.name ?? actor?.id ?? "unknown"}'.`, error);
  }
}

export class EncounterDeploymentService {
  constructor({ participantSources, instanceRepository, folderService = null, gameRef = globalThis.game } = {}) {
    this.participantSources = participantSources;
    this.instanceRepository = instanceRepository;
    this.folderService = folderService ?? new ActorFolderService({ gameRef });
    this.gameRef = gameRef;
  }

  #assertGm() {
    if (!this.gameRef?.user?.isGM) throw new EncounterForgeError("Only a GM may deploy an Encounter.", { code: "GM_ONLY" });
  }

  async deploy(blueprint, options = {}) {
    this.#assertGm();
    assertEncounterBlueprint(blueprint);
    if (!(blueprint.participants ?? []).length) {
      throw new EncounterForgeError("An Encounter requires at least one participant before deployment.", { code: "DEPLOYMENT_NO_PARTICIPANTS" });
    }

    const actorMode = ACTOR_MODES.includes(options.actorMode) ? options.actorMode : "per-type";
    const scene = await resolveScene(options.sceneUuid ?? null);
    const folderTarget = await this.folderService.resolveTarget({
      folderId: options.actorFolderId ?? null,
      createSubfolder: options.createSubfolder !== false,
      subfolderName: options.subfolderName ?? blueprint.name
    });
    const folder = folderTarget.folder;

    const instance = createEncounterInstance(blueprint, {
      id: options.instanceId,
      name: options.instanceName ?? blueprint.name,
      blueprintUuid: options.blueprintUuid ?? null,
      sceneUuid: scene?.uuid ?? null,
      combatUuid: null,
      actorFolderId: folder?.id ?? null,
      actorMode
    });
    instance.deployment.sceneName = scene?.name ?? null;
    instance.deployment.actorFolderName = folder?.name ?? null;
    instance.deployment.materializedActorUuids = [];
    instance.deployment.materializedAt = null;

    const createdActors = [];
    try {
      if (actorMode === "per-participant") {
        for (const template of blueprint.participants ?? []) {
          const runtimeParticipants = runtimeParticipantsForTemplate(instance, template.id);
          for (let index = 0; index < runtimeParticipants.length; index += 1) {
            const runtimeParticipant = runtimeParticipants[index];
            const actor = await this.participantSources.materialize(template.source, {
              actorFolderId: folder?.id ?? null,
              blueprintId: blueprint.id,
              participantTemplateId: template.id,
              runtimeParticipantId: runtimeParticipant.id,
              instanceId: instance.id,
              actorMode
            });
            if (!actor) throw new EncounterForgeError(`Participant '${template.name ?? template.id}' did not materialize an Actor.`, { code: "DEPLOYMENT_ACTOR_MISSING" });
            createdActors.push(actor);
            const name = participantDisplayName(template, runtimeParticipant, index, actorMode);
            await updateActorDeploymentMetadata(actor, {
              name,
              blueprint,
              instance,
              template,
              runtimeParticipantIds: [runtimeParticipant.id],
              actorMode,
              folderId: folder?.id ?? null
            });
            runtimeParticipant.actorUuid = actorUuid(actor);
          }
        }
      } else {
        for (const template of blueprint.participants ?? []) {
          const runtimeParticipants = runtimeParticipantsForTemplate(instance, template.id);
          const actor = await this.participantSources.materialize(template.source, {
            actorFolderId: folder?.id ?? null,
            blueprintId: blueprint.id,
            participantTemplateId: template.id,
            instanceId: instance.id,
            actorMode,
            runtimeParticipantIds: runtimeParticipants.map((participant) => participant.id)
          });
          if (!actor) throw new EncounterForgeError(`Participant '${template.name ?? template.id}' did not materialize an Actor.`, { code: "DEPLOYMENT_ACTOR_MISSING" });
          createdActors.push(actor);
          await updateActorDeploymentMetadata(actor, {
            name: participantDisplayName(template, runtimeParticipants[0], 0, actorMode),
            blueprint,
            instance,
            template,
            runtimeParticipantIds: runtimeParticipants.map((participant) => participant.id),
            actorMode,
            folderId: folder?.id ?? null
          });
          const uuid = actorUuid(actor);
          for (const runtimeParticipant of runtimeParticipants) runtimeParticipant.actorUuid = uuid;
        }
      }

      instance.deployment.materializedActorUuids = [...new Set(createdActors.map(actorUuid).filter(Boolean))];
      instance.deployment.materializedAt = nowIso();
      instance.metadata.modifiedAt = nowIso();
      const saved = await this.instanceRepository.save(instance);
      const instanceUuid = saved?.document?.uuid ?? null;

      await Promise.all(createdActors.map((actor) => stampInstanceUuidOnActor(actor, instanceUuid)));
      if (folderTarget.created && folder?.update) {
        try {
          await folder.update({
            [`flags.${MODULE_ID}.deployment`]: {
              instanceId: instance.id,
              instanceUuid,
              blueprintId: blueprint.id,
              createdAt: nowIso()
            }
          }, { render: false });
        } catch (error) {
          console.warn(`${MODULE_ID} | Could not stamp Encounter deployment folder.`, error);
        }
      }

      return {
        instance: saved?.data ?? instance,
        document: saved?.document ?? null,
        actors: createdActors,
        folder,
        folderCreated: folderTarget.created,
        scene
      };
    } catch (error) {
      for (const actor of [...createdActors].reverse()) {
        try { await actor?.delete?.({ render: false }); } catch {}
      }
      if (folderTarget.created) {
        try { await folder?.delete?.({ deleteSubfolders: false, deleteContents: false }); } catch {}
      }
      throw error;
    }
  }
}
