import { ACTOR_MODES, INSTANCE_SCHEMA_VERSION, INSTANCE_STATUSES } from "../constants.js";
import { asId, deepClone, nowIso, randomId } from "../utils/data.js";
import { EncounterValidationError } from "../utils/errors.js";
import { assertEncounterBlueprint } from "./encounter-blueprint.js";

function expandParticipants(blueprint) {
  const result = [];
  for (const template of blueprint.participants ?? []) {
    const quantity = Math.max(1, Number.parseInt(template.quantity ?? 1, 10) || 1);
    for (let i = 0; i < quantity; i += 1) {
      result.push({
        id: quantity === 1 ? template.id : `${template.id}-${i + 1}`,
        templateId: template.id,
        actorUuid: null,
        tokenUuid: null,
        state: "pending",
        groupId: template.groupId ?? null,
        tacticsProfileId: template.tacticsProfileId ?? null,
        tokenDisplay: deepClone(template.tokenDisplay ?? {}),
        runtime: {}
      });
    }
  }
  return result;
}

export function createEncounterInstance(blueprint, options = {}) {
  assertEncounterBlueprint(blueprint);
  const timestamp = nowIso();
  return {
    schemaVersion: INSTANCE_SCHEMA_VERSION,
    id: asId(options.id, randomId("instance")),
    name: String(options.name ?? blueprint.name),
    blueprint: {
      id: blueprint.id,
      uuid: options.blueprintUuid ?? null,
      schemaVersion: blueprint.schemaVersion
    },
    status: "prepared",
    deployment: {
      sceneUuid: options.sceneUuid ?? null,
      combatUuid: options.combatUuid ?? null,
      actorFolderId: options.actorFolderId ?? null,
      actorMode: ACTOR_MODES.includes(options.actorMode) ? options.actorMode : "per-type",
      sceneName: options.sceneName ?? null,
      actorFolderName: options.actorFolderName ?? null,
      materializedActorUuids: [],
      materializedAt: null,
      tokenUuids: [],
      tokensPlacedAt: null,
      placementMode: null,
      combatPreparedAt: null,
      includePlayerTokensInCombat: false
    },
    participants: expandParticipants(blueprint),
    currentPhaseId: options.currentPhaseId ?? blueprint.phases?.[0]?.id ?? null,
    objectives: Object.fromEntries((blueprint.objectives ?? []).map((objective) => [objective.id, {
      state: "active",
      progress: 0,
      target: Number.isFinite(Number(objective.target)) ? Number(objective.target) : null,
      data: {}
    }])),
    triggeredEvents: [],
    suppressedEvents: [],
    decisions: [],
    runtimeVariables: deepClone(options.runtimeVariables ?? {}),
    log: [],
    metadata: {
      createdAt: timestamp,
      modifiedAt: timestamp,
      completedAt: null
    }
  };
}

export function validateEncounterInstance(value) {
  const errors = [];
  const warnings = [];
  if (!value || typeof value !== "object") return { valid: false, errors: [{ code: "NOT_OBJECT", path: "", message: "Encounter instance must be an object." }], warnings };
  if (value.schemaVersion !== INSTANCE_SCHEMA_VERSION) errors.push({ code: "SCHEMA_VERSION", path: "schemaVersion", message: `Expected instance schema ${INSTANCE_SCHEMA_VERSION}.` });
  if (!String(value.id ?? "").trim()) errors.push({ code: "MISSING_ID", path: "id", message: "Instance id is required." });
  if (!INSTANCE_STATUSES.includes(value.status)) errors.push({ code: "STATUS", path: "status", message: `Unknown instance status '${value.status}'.` });
  if (!Array.isArray(value.participants)) errors.push({ code: "PARTICIPANTS", path: "participants", message: "Instance participants must be an array." });
  if (!ACTOR_MODES.includes(value.deployment?.actorMode)) errors.push({ code: "ACTOR_MODE", path: "deployment.actorMode", message: `Unknown Actor mode '${value.deployment?.actorMode}'.` });
  if (value.deployment?.tokenUuids !== undefined && !Array.isArray(value.deployment.tokenUuids)) errors.push({ code: "TOKEN_UUIDS", path: "deployment.tokenUuids", message: "deployment.tokenUuids must be an array when present." });
  const ids = new Set();
  for (const participant of value.participants ?? []) {
    if (!participant?.id) errors.push({ code: "PARTICIPANT_ID", path: "participants", message: "Runtime participant id is required." });
    else if (ids.has(participant.id)) errors.push({ code: "DUPLICATE_PARTICIPANT", path: "participants", message: `Duplicate runtime participant '${participant.id}'.` });
    else ids.add(participant.id);
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function assertEncounterInstance(value) {
  const report = validateEncounterInstance(value);
  if (!report.valid) throw new EncounterValidationError(report.errors.map((entry) => entry.message).join("; ") || "Encounter instance is invalid.", report);
  return value;
}
