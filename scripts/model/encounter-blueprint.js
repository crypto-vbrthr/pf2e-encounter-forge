import { BLUEPRINT_SCHEMA_VERSION, TOKEN_DISPLAY_MODE_KEYS } from "../constants.js";
import { asArray, asId, deepClone, nowIso, randomId, uniqueStrings } from "../utils/data.js";
import { EncounterValidationError } from "../utils/errors.js";
import { analyzeEncounterFlow } from "../engine/encounter-flow.js";


function normalizeTokenDisplay(value = {}) {
  const normalizeMode = (mode) => TOKEN_DISPLAY_MODE_KEYS.includes(String(mode ?? "")) ? String(mode) : null;
  return {
    displayName: normalizeMode(value?.displayName),
    displayBars: normalizeMode(value?.displayBars),
    hpBarAttribute: String(value?.hpBarAttribute ?? "attributes.hp").trim() || "attributes.hp"
  };
}

function normalizeSceneBinding(value = null) {
  if (!value || typeof value !== "object") return null;
  const uuid = String(value.sceneUuid ?? "").trim();
  const uuidMatch = /^Scene\.([^.]+)(?:\.|$)/.exec(uuid);
  const sceneId = String(value.sceneId ?? uuidMatch?.[1] ?? "").trim();
  if (!sceneId) return null;
  return {
    sceneId,
    sceneUuid: uuid || `Scene.${sceneId}`,
    sceneName: String(value.sceneName ?? "").trim() || null
  };
}

function normalizeParticipant(participant = {}, index = 0) {
  const id = asId(participant.id, `participant-${index + 1}`);
  return {
    id,
    name: String(participant.name ?? id),
    img: participant.img ? String(participant.img) : null,
    level: participant.level !== null && participant.level !== "" && Number.isInteger(Number(participant.level)) ? Number(participant.level) : null,
    source: deepClone(participant.source ?? { type: "document", uuid: null }),
    quantity: Math.max(1, Number.parseInt(participant.quantity ?? 1, 10) || 1),
    role: participant.role ? String(participant.role) : null,
    groupId: participant.groupId ? String(participant.groupId) : null,
    tacticsProfileId: participant.tacticsProfileId ? String(participant.tacticsProfileId) : null,
    tokenDisplay: normalizeTokenDisplay(participant.tokenDisplay),
    adjustments: deepClone(asArray(participant.adjustments)),
    overrides: deepClone(participant.overrides ?? {})
  };
}

function normalizeIdRecord(value = {}, fallback) {
  return { ...deepClone(value), id: asId(value.id, fallback) };
}

export function createEncounterBlueprint(input = {}) {
  const timestamp = nowIso();
  const blueprint = {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    id: asId(input.id, randomId("blueprint")),
    name: String(input.name ?? "New Encounter").trim() || "New Encounter",
    description: String(input.description ?? ""),
    sceneBinding: normalizeSceneBinding(input.sceneBinding),
    party: {
      level: Number.isInteger(input.party?.level) ? input.party.level : 1,
      size: Number.isInteger(input.party?.size) ? Math.max(1, input.party.size) : 4
    },
    threat: {
      target: String(input.threat?.target ?? "moderate"),
      budget: input.threat?.budget !== null && input.threat?.budget !== "" && Number.isFinite(Number(input.threat?.budget)) ? Number(input.threat.budget) : null
    },
    participants: asArray(input.participants).map(normalizeParticipant),
    groups: asArray(input.groups).map((entry, index) => normalizeIdRecord(entry, `group-${index + 1}`)),
    objectives: asArray(input.objectives).map((entry, index) => normalizeIdRecord(entry, `objective-${index + 1}`)),
    phases: asArray(input.phases).map((entry, index) => normalizeIdRecord(entry, `phase-${index + 1}`)),
    triggers: asArray(input.triggers).map((entry, index) => normalizeIdRecord(entry, `trigger-${index + 1}`)),
    actions: asArray(input.actions).map((entry, index) => normalizeIdRecord(entry, `action-${index + 1}`)),
    zones: asArray(input.zones).map((entry, index) => normalizeIdRecord(entry, `zone-${index + 1}`)),
    rewards: deepClone(asArray(input.rewards)),
    environment: deepClone(input.environment ?? {}),
    tactics: {
      profiles: asArray(input.tactics?.profiles).map((entry, index) => normalizeIdRecord(entry, `tactics-${index + 1}`)),
      tags: uniqueStrings(input.tactics?.tags)
    },
    metadata: {
      createdAt: input.metadata?.createdAt ?? timestamp,
      modifiedAt: timestamp,
      archivedAt: input.metadata?.archivedAt ?? null,
      sourceModule: input.metadata?.sourceModule ?? null,
      notes: deepClone(input.metadata?.notes ?? {})
    }
  };
  return blueprint;
}

function pushDuplicateErrors(errors, items, path) {
  const seen = new Set();
  for (const item of items) {
    const id = String(item?.id ?? "").trim();
    if (!id) {
      errors.push({ code: "MISSING_ID", path, message: `${path} contains an entry without an id.` });
      continue;
    }
    if (seen.has(id)) errors.push({ code: "DUPLICATE_ID", path, message: `${path} contains duplicate id '${id}'.` });
    seen.add(id);
  }
}

export function validateEncounterBlueprint(value) {
  const errors = [];
  const warnings = [];
  if (!value || typeof value !== "object") {
    return { valid: false, errors: [{ code: "NOT_OBJECT", path: "", message: "Encounter blueprint must be an object." }], warnings };
  }
  if (value.schemaVersion !== BLUEPRINT_SCHEMA_VERSION) errors.push({ code: "SCHEMA_VERSION", path: "schemaVersion", message: `Expected blueprint schema ${BLUEPRINT_SCHEMA_VERSION}.` });
  if (!String(value.id ?? "").trim()) errors.push({ code: "MISSING_ID", path: "id", message: "Blueprint id is required." });
  if (!String(value.name ?? "").trim()) errors.push({ code: "MISSING_NAME", path: "name", message: "Blueprint name is required." });
  if (value.sceneBinding !== null && value.sceneBinding !== undefined && !String(value.sceneBinding?.sceneId ?? "").trim()) errors.push({ code: "SCENE_BINDING", path: "sceneBinding.sceneId", message: "Scene-bound Blueprints require a Scene id." });
  if (!Number.isInteger(value.party?.level)) errors.push({ code: "PARTY_LEVEL", path: "party.level", message: "Party level must be an integer." });
  if (!Number.isInteger(value.party?.size) || value.party.size < 1) errors.push({ code: "PARTY_SIZE", path: "party.size", message: "Party size must be a positive integer." });

  const sections = ["participants", "groups", "objectives", "phases", "triggers", "actions", "zones"];
  for (const section of sections) {
    if (!Array.isArray(value[section])) errors.push({ code: "NOT_ARRAY", path: section, message: `${section} must be an array.` });
    else pushDuplicateErrors(errors, value[section], section);
  }
  if (!Array.isArray(value.tactics?.profiles)) errors.push({ code: "NOT_ARRAY", path: "tactics.profiles", message: "tactics.profiles must be an array." });
  else pushDuplicateErrors(errors, value.tactics.profiles, "tactics.profiles");

  const groupIds = new Set((value.groups ?? []).map((entry) => entry.id));
  const tacticsIds = new Set((value.tactics?.profiles ?? []).map((entry) => entry.id));
  const actionIds = new Set((value.actions ?? []).map((entry) => entry.id));
  for (const participant of value.participants ?? []) {
    if (!participant?.source || typeof participant.source !== "object" || !String(participant.source.type ?? "").trim()) {
      errors.push({ code: "PARTICIPANT_SOURCE", path: `participants.${participant?.id ?? "?"}.source`, message: "Participant source.type is required." });
    }
    if (!Number.isInteger(participant.quantity) || participant.quantity < 1) {
      errors.push({ code: "PARTICIPANT_QUANTITY", path: `participants.${participant?.id ?? "?"}.quantity`, message: "Participant quantity must be a positive integer." });
    }
    if (participant.level !== null && (!Number.isInteger(participant.level) || participant.level < -1 || participant.level > 24)) {
      errors.push({ code: "PARTICIPANT_LEVEL", path: `participants.${participant?.id ?? "?"}.level`, message: "Participant level must be an integer from -1 to 24 or null." });
    }
    for (const field of ["displayName", "displayBars"]) {
      const mode = participant.tokenDisplay?.[field] ?? null;
      if (mode !== null && !TOKEN_DISPLAY_MODE_KEYS.includes(mode)) {
        errors.push({ code: "PARTICIPANT_TOKEN_DISPLAY", path: `participants.${participant?.id ?? "?"}.tokenDisplay.${field}`, message: `Unknown Token display mode '${mode}'.` });
      }
    }
    if (participant.groupId && !groupIds.has(participant.groupId)) warnings.push({ code: "UNKNOWN_GROUP", path: `participants.${participant.id}.groupId`, message: `Unknown group '${participant.groupId}'.` });
    if (participant.tacticsProfileId && !tacticsIds.has(participant.tacticsProfileId)) warnings.push({ code: "UNKNOWN_TACTICS", path: `participants.${participant.id}.tacticsProfileId`, message: `Unknown tactics profile '${participant.tacticsProfileId}'.` });
  }
  for (const trigger of value.triggers ?? []) {
    const refs = asArray(trigger.actions ?? trigger.actionIds);
    for (const actionId of refs) if (!actionIds.has(actionId)) warnings.push({ code: "UNKNOWN_ACTION", path: `triggers.${trigger.id}`, message: `Trigger references unknown action '${actionId}'.` });
  }
  const flow = analyzeEncounterFlow(value);
  errors.push(...flow.errors);
  warnings.push(...flow.warnings);
  return { valid: errors.length === 0, errors, warnings };
}

export function assertEncounterBlueprint(value) {
  const report = validateEncounterBlueprint(value);
  if (!report.valid) throw new EncounterValidationError(report.errors.map((entry) => entry.message).join("; ") || "Encounter blueprint is invalid.", report);
  return value;
}
