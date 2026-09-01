import { asArray } from "../utils/data.js";

export const FLOW_EVENT_TYPES = Object.freeze([
  "combat.roundEnded",
  "combat.roundChanged",
  "combat.turnChanged",
  "combat.turnEnded",
  "participant.hpChanged",
  "participant.hpDecreased",
  "participant.hpIncreased",
  "participant.defeated",
  "participant.restored",
  "participant.tokenDeleted",
  "objective.progressChanged",
  "objective.completed"
]);

/**
 * Conditions deliberately distinguish event payload values from persistent
 * Encounter context. Event fields describe the signal which just arrived,
 * while context fields let an author ask about the current Encounter state
 * regardless of which event woke the trigger.
 */
export const FLOW_CONDITION_FIELDS = Object.freeze([
  // Event payload fields
  "round",
  "turn",
  "participantId",
  "hpValue",
  "hpMax",
  "hpPercent",
  "objectiveId",
  "progress",
  "previousProgress",
  "target",
  "objectiveState",
  "previousObjectiveState",
  // Encounter context
  "currentRound",
  "currentTurn",
  "currentPhaseId",
  "objectiveProgress",
  "objectiveTarget",
  "objectiveStateCurrent",
  "groupTotalCount",
  "groupDefeatedCount",
  "groupActiveCount",
  "groupRemainingCount",
  "participantTotalCount",
  "participantDefeatedCount",
  "participantActiveCount",
  "participantRemainingCount",
  "participantHpValue",
  "participantHpMax",
  "participantHpPercent",
  "participantHpBelowMax",
  "participantAtFullHp",
  "participantDefeated",
  "participantActive",
  "groupParticipantHpValue",
  "groupParticipantHpMax",
  "groupParticipantHpPercent",
  "groupParticipantHpBelowMax",
  "groupParticipantAtFullHp",
  "groupParticipantDefeated",
  "groupParticipantActive"
]);

export const FLOW_NUMERIC_CONDITION_FIELDS = Object.freeze([
  "round",
  "turn",
  "hpValue",
  "hpMax",
  "hpPercent",
  "progress",
  "previousProgress",
  "target",
  "currentRound",
  "currentTurn",
  "objectiveProgress",
  "objectiveTarget",
  "groupTotalCount",
  "groupDefeatedCount",
  "groupActiveCount",
  "groupRemainingCount",
  "participantTotalCount",
  "participantDefeatedCount",
  "participantActiveCount",
  "participantRemainingCount",
  "participantHpValue",
  "participantHpMax",
  "participantHpPercent",
  "groupParticipantHpValue",
  "groupParticipantHpMax",
  "groupParticipantHpPercent"
]);

export const FLOW_BOOLEAN_CONDITION_FIELDS = Object.freeze([
  "participantHpBelowMax",
  "participantAtFullHp",
  "participantDefeated",
  "participantActive",
  "groupParticipantHpBelowMax",
  "groupParticipantAtFullHp",
  "groupParticipantDefeated",
  "groupParticipantActive"
]);

export const FLOW_PARTICIPANT_CONTEXT_FIELDS = Object.freeze([
  "participantHpValue",
  "participantHpMax",
  "participantHpPercent",
  "participantHpBelowMax",
  "participantAtFullHp",
  "participantDefeated",
  "participantActive"
]);

export const FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS = Object.freeze([
  "groupParticipantHpValue",
  "groupParticipantHpMax",
  "groupParticipantHpPercent",
  "groupParticipantHpBelowMax",
  "groupParticipantAtFullHp",
  "groupParticipantDefeated",
  "groupParticipantActive"
]);

export const FLOW_GROUP_MATCH_MODES = Object.freeze(["any", "all", "atLeast"]);

export const FLOW_OBJECTIVE_CONTEXT_FIELDS = Object.freeze([
  "objectiveProgress",
  "objectiveTarget",
  "objectiveStateCurrent"
]);

export const FLOW_GROUP_CONTEXT_FIELDS = Object.freeze([
  "groupTotalCount",
  "groupDefeatedCount",
  "groupActiveCount",
  "groupRemainingCount"
]);

export const FLOW_CONDITION_MODES = Object.freeze(["all", "any"]);
export const FLOW_OPERATORS = Object.freeze(["eq", "neq", "gt", "gte", "lt", "lte", "includes"]);
export const FLOW_ACTION_TYPES = Object.freeze(["phase.transition", "objective.progress", "director.message", "effect.apply", "aura.setEnabled", "affliction.apply", "loot.createActor"]);
export const FLOW_ACTION_TIMING_MODES = Object.freeze(["immediate", "roundEnd", "turnEnd"]);
export const FLOW_TARGET_MODES = Object.freeze(["participant", "group", "all"]);

function idsOf(items = []) {
  return new Set(asArray(items).map((entry) => String(entry?.id ?? "").trim()).filter(Boolean));
}

function refsOf(trigger = {}) {
  return asArray(trigger.actions ?? trigger.actionIds).map(String).filter(Boolean);
}

function findCycles(graph) {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const path = [];
  const walk = (node) => {
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      if (start >= 0) cycles.push([...path.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    path.push(node);
    for (const next of graph.get(node) ?? []) walk(next);
    path.pop();
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of graph.keys()) walk(node);
  return cycles;
}

function numericBoundsContradict(conditions = []) {
  let min = -Infinity;
  let minInclusive = true;
  let max = Infinity;
  let maxInclusive = true;
  let equality = null;
  const notEqual = new Set();

  for (const condition of conditions) {
    if (condition?.negate) continue; // General NOT expressions are intentionally not simplified here.
    const op = String(condition?.operator ?? "eq");
    const value = Number(condition?.value);
    if (!Number.isFinite(value)) continue;
    if (op === "eq") equality = equality === null ? value : (equality === value ? equality : NaN);
    else if (op === "neq") notEqual.add(value);
    else if (op === "gt" && (value > min || (value === min && minInclusive))) { min = value; minInclusive = false; }
    else if (op === "gte" && value > min) { min = value; minInclusive = true; }
    else if (op === "lt" && (value < max || (value === max && maxInclusive))) { max = value; maxInclusive = false; }
    else if (op === "lte" && value < max) { max = value; maxInclusive = true; }
  }

  if (Number.isNaN(equality)) return true;
  if (equality !== null) {
    if (notEqual.has(equality)) return true;
    if (equality < min || equality > max) return true;
    if (equality === min && !minInclusive) return true;
    if (equality === max && !maxInclusive) return true;
  }
  if (min > max) return true;
  if (min === max && (!minInclusive || !maxInclusive)) return true;
  return false;
}

function conditionContradictions(trigger = {}) {
  if (String(trigger.conditionMode ?? "all") !== "all") return [];
  const grouped = new Map();
  for (const condition of asArray(trigger.conditions)) {
    const field = String(condition?.field ?? condition?.path ?? "").trim();
    if (!field || !FLOW_NUMERIC_CONDITION_FIELDS.includes(field)) continue;
    // Group-member conditions can intentionally be satisfied by different members
    // (for example one defender <= 50% HP and another >= 80% HP), so scalar
    // numeric-bound contradiction analysis is not valid for them.
    if (FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS.includes(field)) continue;
    const participantRef = FLOW_PARTICIPANT_CONTEXT_FIELDS.includes(field) ? String(condition?.participantId ?? "") : "";
    const key = participantRef ? `${field}::${participantRef}` : field;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(condition);
  }
  return [...grouped.entries()].filter(([, conditions]) => numericBoundsContradict(conditions)).map(([field]) => field.split("::")[0]);
}

/**
 * Performs structural validation that is useful while authoring a flow.
 * The normal blueprint validator remains the hard schema gate; this report focuses on
 * dead references, phase reachability, and suspicious transition/condition logic.
 */
export function analyzeEncounterFlow(blueprint = {}) {
  const errors = [];
  const warnings = [];
  const phases = asArray(blueprint.phases);
  const objectives = asArray(blueprint.objectives);
  const actions = asArray(blueprint.actions);
  const triggers = asArray(blueprint.triggers);
  const phaseIds = idsOf(phases);
  const objectiveIds = idsOf(objectives);
  const actionIds = idsOf(actions);
  const participantIds = idsOf(blueprint.participants);
  const groupIds = idsOf(blueprint.groups);
  const actionById = new Map(actions.map((entry) => [entry.id, entry]));

  for (const action of actions) {
    const type = String(action?.type ?? action?.kind ?? "");
    if (type && !FLOW_ACTION_TYPES.includes(type)) {
      warnings.push({ code: "FLOW_ACTION_UNSUPPORTED", path: `actions.${action.id}`, message: `Action '${action.id}' uses unsupported type '${type}'.` });
      continue;
    }
    if (type === "phase.transition") {
      const target = String(action.phaseId ?? action.targetPhaseId ?? action.target ?? "").trim();
      if (!target || !phaseIds.has(target)) errors.push({ code: "FLOW_PHASE_TARGET", path: `actions.${action.id}`, message: `Phase transition '${action.id}' references unknown phase '${target || "?"}'.` });
    }
    if (type === "objective.progress") {
      const target = String(action.objectiveId ?? action.target ?? "").trim();
      if (!target || !objectiveIds.has(target)) errors.push({ code: "FLOW_OBJECTIVE_TARGET", path: `actions.${action.id}`, message: `Objective action '${action.id}' references unknown objective '${target || "?"}'.` });
    }
    if (["effect.apply", "aura.setEnabled", "affliction.apply"].includes(type)) {
      const mode = String(action.targetMode ?? action.target?.mode ?? "participant");
      const target = String(action.targetId ?? action.target?.id ?? "").trim();
      if (!FLOW_TARGET_MODES.includes(mode)) errors.push({ code: "FLOW_ACTION_TARGET_MODE", path: `actions.${action.id}`, message: `Action '${action.id}' uses unknown target mode '${mode}'.` });
      if (mode === "participant" && (!target || !participantIds.has(target))) errors.push({ code: "FLOW_ACTION_PARTICIPANT_TARGET", path: `actions.${action.id}`, message: `Action '${action.id}' references unknown participant '${target || "?"}'.` });
      if (mode === "group" && (!target || !groupIds.has(target))) errors.push({ code: "FLOW_ACTION_GROUP_TARGET", path: `actions.${action.id}`, message: `Action '${action.id}' references unknown group '${target || "?"}'.` });
    }
    if (type === "effect.apply" && !action.definition) errors.push({ code: "FLOW_EFFECT_DEFINITION", path: `actions.${action.id}`, message: `Effect action '${action.id}' has no Effect Definition.` });
    if (type === "aura.setEnabled" && !action.definition && !action.definitionId) errors.push({ code: "FLOW_AURA_DEFINITION", path: `actions.${action.id}`, message: `Aura action '${action.id}' has no Aura Definition.` });
    if (type === "affliction.apply" && !action.definition) errors.push({ code: "FLOW_AFFLICTION_DEFINITION", path: `actions.${action.id}`, message: `Affliction action '${action.id}' has no Affliction Definition.` });
    const timingMode = String(action.timing?.mode ?? "immediate");
    const timingAmount = Number(action.timing?.amount ?? 1);
    if (!FLOW_ACTION_TIMING_MODES.includes(timingMode)) warnings.push({ code: "FLOW_ACTION_TIMING_MODE", path: `actions.${action.id}.timing`, message: `Action '${action.id}' uses unknown timing mode '${timingMode}'.` });
    if (timingMode !== "immediate" && (!Number.isInteger(timingAmount) || timingAmount < 1 || timingAmount > 999)) errors.push({ code: "FLOW_ACTION_TIMING_AMOUNT", path: `actions.${action.id}.timing`, message: `Delayed action '${action.id}' requires a timing amount from 1 to 999.` });
  }

  for (const trigger of triggers) {
    const event = String(trigger?.event ?? trigger?.eventType ?? "").trim();
    if (!event || !FLOW_EVENT_TYPES.includes(event)) warnings.push({ code: "FLOW_EVENT_UNKNOWN", path: `triggers.${trigger.id}.event`, message: `Trigger '${trigger.id}' uses unknown event '${event || "?"}'.` });
    if (trigger.activePhaseId && !phaseIds.has(trigger.activePhaseId)) errors.push({ code: "FLOW_TRIGGER_PHASE", path: `triggers.${trigger.id}.activePhaseId`, message: `Trigger '${trigger.id}' references unknown active phase '${trigger.activePhaseId}'.` });
    if (trigger.participantId && !participantIds.has(trigger.participantId)) errors.push({ code: "FLOW_TRIGGER_PARTICIPANT", path: `triggers.${trigger.id}.participantId`, message: `Trigger '${trigger.id}' references unknown participant '${trigger.participantId}'.` });
    if (trigger.objectiveId && !objectiveIds.has(trigger.objectiveId)) errors.push({ code: "FLOW_TRIGGER_OBJECTIVE", path: `triggers.${trigger.id}.objectiveId`, message: `Trigger '${trigger.id}' references unknown objective '${trigger.objectiveId}'.` });
    if (trigger.conditionObjectiveId && !objectiveIds.has(trigger.conditionObjectiveId)) errors.push({ code: "FLOW_CONDITION_OBJECTIVE_REFERENCE", path: `triggers.${trigger.id}.conditionObjectiveId`, message: `Trigger '${trigger.id}' references unknown condition objective '${trigger.conditionObjectiveId}'.` });
    if (trigger.conditionGroupId && !groupIds.has(trigger.conditionGroupId)) errors.push({ code: "FLOW_CONDITION_GROUP_REFERENCE", path: `triggers.${trigger.id}.conditionGroupId`, message: `Trigger '${trigger.id}' references unknown condition group '${trigger.conditionGroupId}'.` });
    const mode = String(trigger.conditionMode ?? "all");
    if (!FLOW_CONDITION_MODES.includes(mode)) warnings.push({ code: "FLOW_CONDITION_MODE", path: `triggers.${trigger.id}.conditionMode`, message: `Trigger '${trigger.id}' uses unknown condition combination '${mode}'.` });
    for (const actionId of refsOf(trigger)) {
      if (!actionIds.has(actionId)) errors.push({ code: "FLOW_TRIGGER_ACTION", path: `triggers.${trigger.id}`, message: `Trigger '${trigger.id}' references unknown action '${actionId}'.` });
    }
    for (const condition of asArray(trigger.conditions)) {
      const field = String(condition?.field ?? condition?.path ?? "").trim();
      const operator = String(condition?.operator ?? "eq");
      if (field && !FLOW_CONDITION_FIELDS.includes(field)) warnings.push({ code: "FLOW_CONDITION_FIELD", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' uses custom condition field '${field}'.` });
      if (!FLOW_OPERATORS.includes(operator)) warnings.push({ code: "FLOW_CONDITION_OPERATOR", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' uses unknown operator '${operator}'.` });
      if (FLOW_OBJECTIVE_CONTEXT_FIELDS.includes(field) && !(trigger.conditionObjectiveId || trigger.objectiveId)) {
        errors.push({ code: "FLOW_CONDITION_OBJECTIVE_REQUIRED", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' uses objective context '${field}' without selecting a condition objective.` });
      }
      if (FLOW_GROUP_CONTEXT_FIELDS.includes(field) && !trigger.conditionGroupId) {
        errors.push({ code: "FLOW_CONDITION_GROUP_REQUIRED", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' uses group context '${field}' without selecting a condition group.` });
      }
      if (FLOW_PARTICIPANT_CONTEXT_FIELDS.includes(field)) {
        const participantRef = String(condition?.participantId ?? "").trim();
        if (!participantRef) errors.push({ code: "FLOW_CONDITION_PARTICIPANT_REQUIRED", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' uses participant context '${field}' without selecting a participant.` });
        else if (!participantIds.has(participantRef)) errors.push({ code: "FLOW_CONDITION_PARTICIPANT_REFERENCE", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' references unknown condition participant '${participantRef}'.` });
      }
      if (FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS.includes(field)) {
        const groupRef = String(condition?.groupId ?? trigger?.conditionGroupId ?? "").trim();
        const matchMode = String(condition?.groupMatchMode ?? "any");
        const matchCount = Number(condition?.groupMatchCount ?? 1);
        if (!groupRef) errors.push({ code: "FLOW_CONDITION_GROUP_PARTICIPANT_REQUIRED", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' uses group participant context '${field}' without selecting a group.` });
        else if (!groupIds.has(groupRef)) errors.push({ code: "FLOW_CONDITION_GROUP_PARTICIPANT_REFERENCE", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' references unknown condition group '${groupRef}'.` });
        if (!FLOW_GROUP_MATCH_MODES.includes(matchMode)) warnings.push({ code: "FLOW_CONDITION_GROUP_MATCH_MODE", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' uses unknown group match mode '${matchMode}'.` });
        if (matchMode === "atLeast" && (!Number.isInteger(matchCount) || matchCount < 1)) errors.push({ code: "FLOW_CONDITION_GROUP_MATCH_COUNT", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' requires a positive group match count.` });
      }
      if (field === "currentPhaseId" && ["eq", "neq"].includes(operator) && condition.value && !phaseIds.has(String(condition.value))) {
        warnings.push({ code: "FLOW_CONDITION_PHASE_VALUE", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' compares the current phase to unknown phase '${condition.value}'.` });
      }
    }
    for (const field of conditionContradictions(trigger)) {
      warnings.push({ code: "FLOW_CONDITION_CONTRADICTION", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' contains contradictory ALL conditions for '${field}'.` });
    }
  }

  // Conservative reachability: phase 1 is the entry phase. A phase is also considered
  // reachable when a global trigger can transition to it, or when a reachable phase has
  // a phase-scoped trigger which transitions to it.
  const initialPhaseId = phases[0]?.id ?? null;
  const globalTargets = new Set();
  const graph = new Map(phases.map((phase) => [phase.id, new Set()]));
  for (const trigger of triggers) {
    for (const actionId of refsOf(trigger)) {
      const action = actionById.get(actionId);
      if ((action?.type ?? action?.kind) !== "phase.transition") continue;
      const target = String(action.phaseId ?? action.targetPhaseId ?? action.target ?? "").trim();
      if (!phaseIds.has(target)) continue;
      if (trigger.activePhaseId && phaseIds.has(trigger.activePhaseId)) graph.get(trigger.activePhaseId)?.add(target);
      else globalTargets.add(target);
    }
  }
  const reachable = new Set(initialPhaseId ? [initialPhaseId] : []);
  for (const id of globalTargets) reachable.add(id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const source of [...reachable]) {
      for (const target of graph.get(source) ?? []) {
        if (!reachable.has(target)) { reachable.add(target); changed = true; }
      }
    }
  }
  for (const phase of phases) {
    if (!reachable.has(phase.id)) warnings.push({ code: "FLOW_PHASE_UNREACHABLE", path: `phases.${phase.id}`, message: `Phase '${phase.name ?? phase.id}' is not reachable from the initial phase or a global transition.` });
  }

  const cycles = findCycles(graph);
  for (const cycle of cycles) warnings.push({ code: "FLOW_PHASE_CYCLE", path: "phases", message: `Phase transition cycle detected: ${cycle.join(" → ")}.` });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      phases: phases.length,
      objectives: objectives.length,
      triggers: triggers.length,
      actions: actions.length,
      reachablePhases: reachable.size,
      cycles: cycles.length
    }
  };
}
