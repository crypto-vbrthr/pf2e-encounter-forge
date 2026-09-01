import { RuntimeService } from "./base-service.js";

function getPath(object, path) {
  return String(path ?? "").split(".").filter(Boolean).reduce((value, key) => value?.[key], object);
}

function compare(left, operator, right) {
  switch (operator) {
    case "eq": return left === right;
    case "neq": return left !== right;
    case "gt": return Number(left) > Number(right);
    case "gte": return Number(left) >= Number(right);
    case "lt": return Number(left) < Number(right);
    case "lte": return Number(left) <= Number(right);
    case "includes": return Array.isArray(left) ? left.includes(right) : String(left ?? "").includes(String(right ?? ""));
    default: return left === right;
  }
}

function matchesEvent(trigger, event) {
  const expected = String(trigger?.event ?? trigger?.eventType ?? trigger?.type ?? "").trim();
  if (!expected) return false;
  return expected === event.type;
}

function participantRows(instance, groupId = null) {
  const rows = Array.isArray(instance?.participants) ? instance.participants : [];
  if (!groupId) return rows;
  return rows.filter((entry) => String(entry?.groupId ?? "") === String(groupId));
}

function participantCounts(instance, groupId = null, event = null) {
  const rows = participantRows(instance, groupId);
  const projectedState = (entry) => {
    if (String(entry?.id ?? "") !== String(event?.participantId ?? "")) return String(entry?.state ?? "");
    if (event?.type === "participant.defeated") return "defeated";
    if (event?.type === "participant.restored") return "ready";
    if (event?.type === "participant.tokenDeleted") return "removed";
    return String(entry?.state ?? "");
  };
  const defeated = rows.filter((entry) => projectedState(entry) === "defeated").length;
  const removed = rows.filter((entry) => projectedState(entry) === "removed").length;
  const remaining = Math.max(0, rows.length - defeated - removed);
  // "Active" is intentionally encounter-semantic, not a Foundry document status.
  // Restored/ready participants and any older materialized/prepared state still count
  // as available to the encounter until they are defeated or removed.
  const active = remaining;
  return { total: rows.length, defeated, removed, remaining, active };
}

function resolveConditionValue(field, { event, instance, trigger }) {
  switch (field) {
    case "currentRound": return Number(event?.round ?? instance?.runtimeVariables?.round ?? 0);
    case "currentTurn": return Number(event?.turn ?? instance?.runtimeVariables?.turn ?? 0);
    case "currentPhaseId": return instance?.currentPhaseId ?? null;
    case "objectiveProgress": {
      const id = trigger?.conditionObjectiveId ?? trigger?.objectiveId ?? null;
      return id ? Number(instance?.objectives?.[id]?.progress ?? 0) : null;
    }
    case "objectiveTarget": {
      const id = trigger?.conditionObjectiveId ?? trigger?.objectiveId ?? null;
      const value = id ? instance?.objectives?.[id]?.target : null;
      return Number.isFinite(Number(value)) ? Number(value) : null;
    }
    case "objectiveStateCurrent": {
      const id = trigger?.conditionObjectiveId ?? trigger?.objectiveId ?? null;
      return id ? String(instance?.objectives?.[id]?.state ?? "") : null;
    }
    case "groupTotalCount": return participantCounts(instance, trigger?.conditionGroupId, event).total;
    case "groupDefeatedCount": return participantCounts(instance, trigger?.conditionGroupId, event).defeated;
    case "groupActiveCount": return participantCounts(instance, trigger?.conditionGroupId, event).active;
    case "groupRemainingCount": return participantCounts(instance, trigger?.conditionGroupId, event).remaining;
    case "participantTotalCount": return participantCounts(instance, null, event).total;
    case "participantDefeatedCount": return participantCounts(instance, null, event).defeated;
    case "participantActiveCount": return participantCounts(instance, null, event).active;
    case "participantRemainingCount": return participantCounts(instance, null, event).remaining;
    default: return getPath(event, field);
  }
}

export function matchesTriggerConditions(trigger, event, instance = null) {
  if (trigger?.activePhaseId && trigger.activePhaseId !== instance?.currentPhaseId) return false;
  if (trigger?.participantId) {
    const eventParticipant = (instance?.participants ?? []).find((entry) => String(entry?.id ?? "") === String(event?.participantId ?? ""));
    const matchesParticipant = String(trigger.participantId) === String(event?.participantId ?? "")
      || String(trigger.participantId) === String(eventParticipant?.templateId ?? "");
    if (!matchesParticipant) return false;
  }
  if (trigger?.objectiveId && trigger.objectiveId !== event.objectiveId) return false;
  if (Number.isFinite(Number(trigger?.round)) && Number(event.round) < Number(trigger.round)) return false;

  const conditions = Array.isArray(trigger?.conditions) ? trigger.conditions : [];
  if (!conditions.length) return true;
  const mode = String(trigger?.conditionMode ?? "all") === "any" ? "any" : "all";
  const results = conditions.map((condition) => {
    const field = String(condition?.field ?? condition?.path ?? "").trim();
    const result = compare(resolveConditionValue(field, { event, instance, trigger }), String(condition?.operator ?? "eq"), condition?.value);
    return condition?.negate === true ? !result : result;
  });
  return mode === "any" ? results.some(Boolean) : results.every(Boolean);
}

export class TriggerService extends RuntimeService {
  constructor({ bus = null, getInstance = () => null, getBlueprint = () => null, enabled = () => true, onTrigger = null } = {}) {
    super("triggers");
    this.bus = bus;
    this.getInstance = getInstance;
    this.getBlueprint = getBlueprint;
    this.enabled = enabled;
    this.onTrigger = onTrigger;
    this.unsubscribe = null;
    this.inFlight = new Set();
  }

  async start() {
    if (this.started) return this.status();
    await super.start();
    this.unsubscribe = this.bus?.on?.("encounter.event", (event) => this.evaluate(event)) ?? null;
    return this.status();
  }

  async stop() {
    try { this.unsubscribe?.(); } catch {}
    this.unsubscribe = null;
    this.inFlight.clear();
    return super.stop();
  }

  async evaluate(event) {
    if (!this.enabled()) return [];
    const instance = this.getInstance();
    const blueprint = this.getBlueprint();
    if (!instance || !blueprint) return [];
    const fired = new Set(instance.triggeredEvents ?? []);
    const matches = [];
    for (const trigger of blueprint.triggers ?? []) {
      if (trigger?.enabled === false) continue;
      const once = trigger?.once !== false;
      if (once && (fired.has(trigger.id) || this.inFlight.has(trigger.id))) continue;
      if (!matchesEvent(trigger, event) || !matchesTriggerConditions(trigger, event, instance)) continue;
      matches.push(trigger);
      if (once) this.inFlight.add(trigger.id);
      try {
        await this.onTrigger?.(trigger, event);
      } finally {
        if (once) this.inFlight.delete(trigger.id);
      }
    }
    return matches;
  }
}
