import { asArray } from "../utils/data.js";

export const FLOW_EVENT_TYPES = Object.freeze([
  "combat.roundEnded",
  "combat.roundChanged",
  "combat.turnChanged",
  "participant.hpChanged",
  "participant.defeated",
  "participant.restored",
  "participant.tokenDeleted",
  "objective.progressChanged",
  "objective.completed"
]);

export const FLOW_CONDITION_FIELDS = Object.freeze([
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
  "previousObjectiveState"
]);

export const FLOW_OPERATORS = Object.freeze(["eq", "neq", "gt", "gte", "lt", "lte", "includes"]);
export const FLOW_ACTION_TYPES = Object.freeze(["phase.transition", "objective.progress", "director.message"]);

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

/**
 * Performs structural validation that is useful while authoring a flow.
 * The normal blueprint validator remains the hard schema gate; this report focuses on
 * dead references, phase reachability, and suspicious transition cycles.
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
  }

  for (const trigger of triggers) {
    const event = String(trigger?.event ?? trigger?.eventType ?? "").trim();
    if (!event || !FLOW_EVENT_TYPES.includes(event)) warnings.push({ code: "FLOW_EVENT_UNKNOWN", path: `triggers.${trigger.id}.event`, message: `Trigger '${trigger.id}' uses unknown event '${event || "?"}'.` });
    if (trigger.activePhaseId && !phaseIds.has(trigger.activePhaseId)) errors.push({ code: "FLOW_TRIGGER_PHASE", path: `triggers.${trigger.id}.activePhaseId`, message: `Trigger '${trigger.id}' references unknown active phase '${trigger.activePhaseId}'.` });
    if (trigger.participantId && !participantIds.has(trigger.participantId)) errors.push({ code: "FLOW_TRIGGER_PARTICIPANT", path: `triggers.${trigger.id}.participantId`, message: `Trigger '${trigger.id}' references unknown participant '${trigger.participantId}'.` });
    if (trigger.objectiveId && !objectiveIds.has(trigger.objectiveId)) errors.push({ code: "FLOW_TRIGGER_OBJECTIVE", path: `triggers.${trigger.id}.objectiveId`, message: `Trigger '${trigger.id}' references unknown objective '${trigger.objectiveId}'.` });
    for (const actionId of refsOf(trigger)) {
      if (!actionIds.has(actionId)) errors.push({ code: "FLOW_TRIGGER_ACTION", path: `triggers.${trigger.id}`, message: `Trigger '${trigger.id}' references unknown action '${actionId}'.` });
    }
    for (const condition of asArray(trigger.conditions)) {
      const field = String(condition?.field ?? condition?.path ?? "").trim();
      const operator = String(condition?.operator ?? "eq");
      if (field && !FLOW_CONDITION_FIELDS.includes(field)) warnings.push({ code: "FLOW_CONDITION_FIELD", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' uses custom condition field '${field}'.` });
      if (!FLOW_OPERATORS.includes(operator)) warnings.push({ code: "FLOW_CONDITION_OPERATOR", path: `triggers.${trigger.id}.conditions`, message: `Trigger '${trigger.id}' uses unknown operator '${operator}'.` });
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
