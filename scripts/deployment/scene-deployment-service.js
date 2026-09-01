import { MODULE_ID } from "../constants.js";
import { collectionContents, deepClone, nowIso } from "../utils/data.js";
import { EncounterForgeError } from "../utils/errors.js";
import { InteractiveTokenPlacementService } from "./interactive-token-placement-service.js";


const FALLBACK_TOKEN_DISPLAY_MODES = Object.freeze({
  NONE: 0,
  CONTROL: 10,
  OWNER_HOVER: 20,
  HOVER: 30,
  OWNER: 40,
  ALWAYS: 50
});

function tokenDisplayModeValue(mode) {
  const key = String(mode ?? "").trim();
  if (!key) return null;
  const foundryModes = globalThis.CONST?.TOKEN_DISPLAY_MODES ?? FALLBACK_TOKEN_DISPLAY_MODES;
  const value = foundryModes?.[key];
  return Number.isFinite(Number(value)) ? Number(value) : (FALLBACK_TOKEN_DISPLAY_MODES[key] ?? null);
}

function applyParticipantTokenDisplay(source, participant) {
  const display = participant?.tokenDisplay ?? {};
  const displayName = tokenDisplayModeValue(display.displayName);
  const displayBars = tokenDisplayModeValue(display.displayBars);
  if (displayName !== null) source.displayName = displayName;
  if (displayBars !== null) {
    source.displayBars = displayBars;
    source.bar1 ??= {};
    source.bar1.attribute = String(display.hpBarAttribute ?? "attributes.hp").trim() || "attributes.hp";
  }
  return source;
}

function documentUuid(document, fallback = null) {
  if (document?.uuid) return document.uuid;
  if (document?.documentName === "Token" && document?.parent?.id && document?.id) return `Scene.${document.parent.id}.Token.${document.id}`;
  if (document?.id && fallback) return `${fallback}.${document.id}`;
  return null;
}

function actorUuid(actor) {
  if (actor?.uuid) return actor.uuid;
  return actor?.id ? `Actor.${actor.id}` : null;
}

function tokenSizeSquares(actor) {
  const prototype = actor?.prototypeToken;
  const width = Number(prototype?.width ?? prototype?.toObject?.()?.width ?? 1);
  const height = Number(prototype?.height ?? prototype?.toObject?.()?.height ?? 1);
  return {
    width: Number.isFinite(width) && width > 0 ? width : 1,
    height: Number.isFinite(height) && height > 0 ? height : 1
  };
}

function sceneGridSize(scene) {
  const size = Number(scene?.grid?.size ?? scene?.dimensions?.size ?? 100);
  return Number.isFinite(size) && size > 0 ? size : 100;
}

function scenePixelSize(scene, gridSize) {
  const width = Number(scene?.width ?? scene?.dimensions?.sceneWidth ?? gridSize * 30);
  const height = Number(scene?.height ?? scene?.dimensions?.sceneHeight ?? gridSize * 20);
  return {
    width: Number.isFinite(width) && width > 0 ? width : gridSize * 30,
    height: Number.isFinite(height) && height > 0 ? height : gridSize * 20
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function orderedParticipants(instance) {
  const participants = [...(instance?.participants ?? [])];
  // Keep tactical groups together without changing the stable order inside a group.
  const order = new Map();
  let next = 0;
  for (const participant of participants) {
    const key = participant.groupId || participant.templateId || participant.id;
    if (!order.has(key)) order.set(key, next++);
  }
  return participants.sort((a, b) => {
    const aKey = a.groupId || a.templateId || a.id;
    const bKey = b.groupId || b.templateId || b.id;
    return (order.get(aKey) ?? 0) - (order.get(bKey) ?? 0);
  });
}

function buildStagingPositions(instance, actorsByUuid, scene) {
  const participants = orderedParticipants(instance);
  const grid = sceneGridSize(scene);
  const sceneSize = scenePixelSize(scene, grid);
  const maxTokenSquares = participants.reduce((max, participant) => {
    const size = tokenSizeSquares(actorsByUuid.get(participant.actorUuid));
    return Math.max(max, size.width, size.height);
  }, 1);
  const stride = Math.max(grid, Math.ceil((maxTokenSquares + 0.5) * grid));
  const desiredColumns = Math.max(1, Math.ceil(Math.sqrt(participants.length || 1)));
  const availableColumns = Math.max(1, Math.floor((sceneSize.width - grid) / stride));
  const columns = Math.max(1, Math.min(desiredColumns, availableColumns));
  const rows = Math.max(1, Math.ceil((participants.length || 1) / columns));
  const formationWidth = Math.max(stride, columns * stride);
  const formationHeight = Math.max(stride, rows * stride);
  const originX = Math.max(0, Math.round((sceneSize.width - formationWidth) / 2));
  const originY = Math.max(0, Math.round((sceneSize.height - formationHeight) / 2));

  return participants.map((participant, index) => {
    const actor = actorsByUuid.get(participant.actorUuid);
    const size = tokenSizeSquares(actor);
    const col = index % columns;
    const row = Math.floor(index / columns);
    const widthPx = size.width * grid;
    const heightPx = size.height * grid;
    return {
      participant,
      actor,
      x: clamp(originX + col * stride, 0, Math.max(0, sceneSize.width - widthPx)),
      y: clamp(originY + row * stride, 0, Math.max(0, sceneSize.height - heightPx))
    };
  });
}

async function tokenSourceForActor(actor, { participant, instance, scene = null, x, y }) {
  if (!actor) throw new EncounterForgeError(`Actor for participant '${participant?.id ?? "unknown"}' is unavailable.`, { code: "SCENE_ACTOR_MISSING" });
  const actorLink = instance?.deployment?.actorMode === "per-participant";
  let source = null;

  if (typeof actor.getTokenDocument === "function") {
    let tokenDocument = null;
    try {
      tokenDocument = await actor.getTokenDocument({ x, y, actorLink }, scene ? { parent: scene } : {});
    } catch (error) {
      // Preserve compatibility with providers/mocks exposing the older single-argument shape.
      tokenDocument = await actor.getTokenDocument({ x, y, actorLink });
    }
    source = tokenDocument?.toObject?.() ?? deepClone(tokenDocument ?? {});
  } else {
    const prototype = actor.prototypeToken?.toObject?.() ?? deepClone(actor.prototypeToken ?? {});
    source = prototype && typeof prototype === "object" ? prototype : {};
  }

  source = deepClone(source ?? {});
  delete source._id;
  source.actorId = actor.id;
  source.actorLink = actorLink;
  source.x = x;
  source.y = y;
  applyParticipantTokenDisplay(source, participant);
  source.flags ??= {};
  source.flags[MODULE_ID] = {
    ...(source.flags[MODULE_ID] ?? {}),
    participant: {
      ...(source.flags[MODULE_ID]?.participant ?? {}),
      instanceId: instance.id,
      instanceUuid: null,
      participantId: participant.id,
      participantTemplateId: participant.templateId,
      groupId: participant.groupId ?? null,
      placedAt: nowIso()
    }
  };
  return source;
}


function tokenParticipantId(token) {
  return token?.flags?.[MODULE_ID]?.participant?.participantId
    ?? token?._source?.flags?.[MODULE_ID]?.participant?.participantId
    ?? null;
}

function tokensByParticipantId(tokens = [], placements = []) {
  const expectedIds = new Set(placements.map((entry) => String(entry?.participant?.id ?? "")).filter(Boolean));
  const mapped = new Map();
  for (const token of tokens) {
    const participantId = String(tokenParticipantId(token) ?? "").trim();
    if (!participantId || !expectedIds.has(participantId) || mapped.has(participantId)) continue;
    mapped.set(participantId, token);
  }
  return mapped;
}

function playerCharacterTokens(scene, excludedIds = new Set()) {
  return collectionContents(scene?.tokens).filter((token) => {
    if (!token?.id || excludedIds.has(token.id)) return false;
    const actor = token.actor ?? globalThis.game?.actors?.get?.(token.actorId) ?? null;
    return actor?.type === "character";
  });
}

function combatantSource(token, scene) {
  return {
    tokenId: token.id,
    sceneId: scene.id,
    actorId: token.actorId ?? token.actor?.id ?? null,
    hidden: Boolean(token.hidden)
  };
}

export class SceneDeploymentService {
  constructor({ CombatClass = null, interactivePlacement = null } = {}) {
    this.CombatClass = CombatClass;
    this.interactivePlacement = interactivePlacement ?? new InteractiveTokenPlacementService();
  }

  #combatClass() {
    return this.CombatClass ?? globalThis.CONFIG?.Combat?.documentClass ?? globalThis.Combat ?? null;
  }

  async deploy(instance, { scene, actors = [], placementMode = "staging-center", createCombat = false, includePlayerTokens = true } = {}) {
    if (!scene) throw new EncounterForgeError("Scene deployment requires a Scene.", { code: "SCENE_REQUIRED" });
    if (!["staging-center", "interactive"].includes(placementMode)) throw new EncounterForgeError(`Unknown Scene placement mode '${placementMode}'.`, { code: "SCENE_PLACEMENT_MODE" });
    if (typeof scene.createEmbeddedDocuments !== "function") {
      throw new EncounterForgeError("The selected Scene cannot create embedded Token documents.", { code: "SCENE_TOKEN_CREATE_UNAVAILABLE" });
    }

    const actorsByUuid = new Map(actors.map((actor) => [actorUuid(actor), actor]).filter(([uuid]) => Boolean(uuid)));
    const placements = buildStagingPositions(instance, actorsByUuid, scene);
    const sources = [];
    for (const placement of placements) sources.push(await tokenSourceForActor(placement.actor, {
      participant: placement.participant,
      instance,
      scene,
      x: placement.x,
      y: placement.y
    }));

    let tokens = [];
    let combat = null;
    try {
      if (placementMode === "interactive") {
        tokens = await this.interactivePlacement.place({ scene, sources, placements, instance });
      } else {
        tokens = await scene.createEmbeddedDocuments("Token", sources, { render: false });
      }
      if (!Array.isArray(tokens) || tokens.length !== placements.length) {
        throw new EncounterForgeError("Scene token creation returned an unexpected number of Tokens.", { code: "SCENE_TOKEN_COUNT_MISMATCH" });
      }

      // Foundry's interactive TokenLayer is not required to return created Token
      // documents in the same order as the submitted sources. Every source is stamped
      // with the Encounter participant id, so reconcile by that stable flag first.
      // Falling back to array order preserves compatibility with lightweight mocks and
      // older Foundry/provider implementations that do not expose flags on the result.
      const tokenMap = tokensByParticipantId(tokens, placements);
      for (let index = 0; index < placements.length; index += 1) {
        const participant = placements[index].participant;
        const token = tokenMap.get(String(participant.id)) ?? tokens[index];
        participant.tokenUuid = documentUuid(token, `Scene.${scene.id}.Token`);
        participant.state = "ready";
        participant.runtime ??= {};
        participant.runtime.placement = {
          mode: placementMode,
          x: token.x ?? sources[index].x,
          y: token.y ?? sources[index].y,
          rotation: Number.isFinite(Number(token.rotation)) ? Number(token.rotation) : null
        };
      }

      instance.deployment.tokenUuids = tokens.map((token) => documentUuid(token, `Scene.${scene.id}.Token`)).filter(Boolean);
      instance.deployment.tokensPlacedAt = nowIso();
      instance.deployment.placementMode = placementMode;

      if (createCombat) {
        const CombatClass = this.#combatClass();
        if (!CombatClass?.create) throw new EncounterForgeError("Foundry Combat.create() is unavailable.", { code: "COMBAT_CREATE_UNAVAILABLE" });
        combat = await CombatClass.create({
          scene: scene.id,
          active: false,
          flags: {
            [MODULE_ID]: {
              encounter: {
                instanceId: instance.id,
                instanceUuid: null,
                blueprintId: instance.blueprint?.id ?? null,
                preparedAt: nowIso()
              }
            }
          }
        }, { renderSheet: false });

        const combatTokens = [...tokens];
        if (includePlayerTokens) {
          const enemyIds = new Set(tokens.map((token) => token.id).filter(Boolean));
          combatTokens.push(...playerCharacterTokens(scene, enemyIds));
        }
        if (combatTokens.length && typeof combat.createEmbeddedDocuments === "function") {
          await combat.createEmbeddedDocuments("Combatant", combatTokens.map((token) => combatantSource(token, scene)), { render: false });
        }
        instance.deployment.combatUuid = documentUuid(combat, "Combat");
        instance.deployment.combatPreparedAt = nowIso();
        instance.deployment.includePlayerTokensInCombat = Boolean(includePlayerTokens);
      }

      return { scene, tokens, combat };
    } catch (error) {
      await this.rollback({ scene, tokens, combat });
      throw error;
    }
  }

  async stampReferences({ instance, instanceUuid, scene, tokens = [], combat = null } = {}) {
    if (!instanceUuid) return;
    for (const token of tokens) {
      try {
        await token?.update?.({ [`flags.${MODULE_ID}.participant.instanceUuid`]: instanceUuid }, { render: false });
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not stamp Encounter Instance UUID on Token '${token?.id ?? "unknown"}'.`, error);
      }
    }

    if (scene?.update) {
      try {
        const instances = deepClone(scene.flags?.[MODULE_ID]?.instances ?? {});
        instances[instance.id] = {
          instanceUuid,
          blueprintId: instance.blueprint?.id ?? null,
          combatUuid: instance.deployment?.combatUuid ?? null,
          preparedAt: nowIso()
        };
        await scene.update({ [`flags.${MODULE_ID}.instances`]: instances }, { render: false });
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not stamp Encounter Instance reference on Scene '${scene?.name ?? scene?.id ?? "unknown"}'.`, error);
      }
    }

    if (combat?.update) {
      try {
        await combat.update({ [`flags.${MODULE_ID}.encounter.instanceUuid`]: instanceUuid }, { render: false });
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not stamp Encounter Instance UUID on Combat '${combat?.id ?? "unknown"}'.`, error);
      }
    }
  }

  async rollback({ scene, tokens = [], combat = null } = {}) {
    try { await combat?.delete?.({ render: false }); } catch {}
    const tokenIds = tokens.map((token) => token?.id).filter(Boolean);
    if (!tokenIds.length) return;
    if (typeof scene?.deleteEmbeddedDocuments === "function") {
      try {
        await scene.deleteEmbeddedDocuments("Token", tokenIds, { render: false });
        return;
      } catch {}
    }
    for (const token of [...tokens].reverse()) {
      try { await token?.delete?.({ render: false }); } catch {}
    }
  }
}
