import { FLOW_GROUP_MATCH_MODES, FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS, FLOW_PARTICIPANT_CONTEXT_FIELDS, FLOW_REGION_EVENT_TYPES, FLOW_REGION_TOKEN_SCOPES } from "../engine/encounter-flow.js";
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

function zoneMatchesEvent(trigger, event, blueprint) {
  const zoneId = String(trigger?.zoneId ?? "").trim();
  if (!zoneId) return false;
  const zone = (blueprint?.zones ?? []).find((entry) => String(entry?.id ?? "") === zoneId);
  if (!zone) return false;
  const expectedUuid = String(zone?.regionUuid ?? "").trim();
  const expectedName = String(zone?.regionName ?? "").trim();
  const receivedUuid = String(event?.regionUuid ?? "").trim();
  const receivedName = String(event?.regionName ?? "").trim();
  if (expectedUuid && receivedUuid && expectedUuid === receivedUuid) return true;
  return Boolean(expectedName && receivedName && expectedName === receivedName);
}

function matchesEvent(trigger, event, blueprint = null) {
  const expected = String(trigger?.event ?? trigger?.eventType ?? trigger?.type ?? "").trim();
  if (!expected || expected !== event.type) return false;
  if (FLOW_REGION_EVENT_TYPES.includes(expected)) return zoneMatchesEvent(trigger, event, blueprint);
  return true;
}

function participantRows(instance, groupId = null) {
  const rows = Array.isArray(instance?.participants) ? instance.participants : [];
  if (!groupId) return rows;
  return rows.filter((entry) => String(entry?.groupId ?? "") === String(groupId));
}

function projectedParticipantState(entry, event = null) {
  if (String(entry?.id ?? "") !== String(event?.participantId ?? "")) return String(entry?.state ?? "");
  if (event?.type === "participant.defeated") return "defeated";
  if (event?.type === "participant.restored") return "ready";
  if (event?.type === "participant.tokenDeleted") return "removed";
  return String(entry?.state ?? "");
}

function participantCounts(instance, groupId = null, event = null) {
  const rows = participantRows(instance, groupId);
  const defeated = rows.filter((entry) => projectedParticipantState(entry, event) === "defeated").length;
  const removed = rows.filter((entry) => projectedParticipantState(entry, event) === "removed").length;
  const remaining = Math.max(0, rows.length - defeated - removed);
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
    case "regionTokenCount": return Number(event?.regionTokenCount ?? 0);
    case "regionPlayerCharacterCount": return Number(event?.regionPlayerCharacterCount ?? 0);
    case "regionEncounterParticipantCount": return Number(event?.regionEncounterParticipantCount ?? 0);
    case "regionGroupParticipantCount": {
      const id = String(trigger?.conditionGroupId ?? "").trim();
      return id ? Number(event?.regionGroupParticipantCounts?.[id] ?? 0) : null;
    }
    case "participantTotalCount": return participantCounts(instance, null, event).total;
    case "participantDefeatedCount": return participantCounts(instance, null, event).defeated;
    case "participantActiveCount": return participantCounts(instance, null, event).active;
    case "participantRemainingCount": return participantCounts(instance, null, event).remaining;
    default: return getPath(event, field);
  }
}

function participantContextValue(field, snapshot, event = null) {
  const sameParticipant = String(snapshot?.id ?? "") === String(event?.participantId ?? "");
  const eventHasHp = sameParticipant && [event?.hpValue, event?.hpMax, event?.hpPercent].some((value) => Number.isFinite(Number(value)));
  const hp = eventHasHp
    ? {
        value: Number.isFinite(Number(event?.hpValue)) ? Number(event.hpValue) : snapshot?.hp?.value ?? null,
        max: Number.isFinite(Number(event?.hpMax)) ? Number(event.hpMax) : snapshot?.hp?.max ?? null,
        percent: Number.isFinite(Number(event?.hpPercent)) ? Number(event.hpPercent) : snapshot?.hp?.percent ?? null
      }
    : (snapshot?.hp ?? {});
  let state = String(snapshot?.state ?? "");
  if (sameParticipant) {
    if (event?.type === "participant.defeated") state = "defeated";
    else if (event?.type === "participant.restored") state = "ready";
    else if (event?.type === "participant.tokenDeleted") state = "removed";
  }
  switch (field) {
    case "participantHpValue": return Number.isFinite(Number(hp?.value)) ? Number(hp.value) : null;
    case "participantHpMax": return Number.isFinite(Number(hp?.max)) ? Number(hp.max) : null;
    case "participantHpPercent": return Number.isFinite(Number(hp?.percent)) ? Number(hp.percent) : null;
    case "participantHpBelowMax": {
      const value = Number(hp?.value);
      const max = Number(hp?.max);
      return Number.isFinite(value) && Number.isFinite(max) && max > 0 ? value < max : null;
    }
    case "participantAtFullHp": {
      const value = Number(hp?.value);
      const max = Number(hp?.max);
      return Number.isFinite(value) && Number.isFinite(max) && max > 0 ? value >= max : null;
    }
    case "participantDefeated": return state === "defeated";
    case "participantActive": return !["defeated", "removed"].includes(state);
    default: return null;
  }
}

async function participantConditionMatches(condition, { event, instance, participants }) {
  const referenceId = String(condition?.participantId ?? "").trim();
  if (!referenceId) return false;
  let snapshots = [];
  if (participants?.snapshotsForReference) snapshots = await participants.snapshotsForReference(referenceId);
  else {
    const rows = (instance?.participants ?? []).filter((entry) => String(entry?.id ?? "") === referenceId || String(entry?.templateId ?? "") === referenceId);
    snapshots = rows.map((entry) => ({ ...entry, hp: entry?.hp ?? entry?.runtime?.hp ?? {} }));
  }
  if (!snapshots.length) return false;
  const field = String(condition?.field ?? condition?.path ?? "").trim();
  const operator = String(condition?.operator ?? "eq");
  return snapshots.some((snapshot) => compare(participantContextValue(field, snapshot, event), operator, condition?.value));
}

function groupParticipantField(field) {
  return String(field ?? "").replace(/^groupParticipant/, "participant");
}

async function groupParticipantConditionMatches(condition, trigger, { event, instance, participants }) {
  const groupId = String(condition?.groupId ?? trigger?.conditionGroupId ?? "").trim();
  if (!groupId) return false;
  let snapshots = [];
  if (participants?.snapshotsForGroup) snapshots = await participants.snapshotsForGroup(groupId);
  else {
    const rows = (instance?.participants ?? []).filter((entry) => String(entry?.groupId ?? "") === groupId);
    snapshots = rows.map((entry) => ({ ...entry, hp: entry?.hp ?? entry?.runtime?.hp ?? {} }));
  }
  if (!snapshots.length) return false;
  const field = groupParticipantField(condition?.field ?? condition?.path ?? "");
  const operator = String(condition?.operator ?? "eq");
  const matched = snapshots.filter((snapshot) => compare(participantContextValue(field, snapshot, event), operator, condition?.value)).length;
  const mode = FLOW_GROUP_MATCH_MODES.includes(String(condition?.groupMatchMode ?? "any")) ? String(condition?.groupMatchMode ?? "any") : "any";
  if (mode === "all") return matched === snapshots.length;
  if (mode === "atLeast") {
    const required = Math.max(1, Math.trunc(Number(condition?.groupMatchCount ?? 1) || 1));
    return matched >= required;
  }
  return matched >= 1;
}

export async function matchesTriggerConditions(trigger, event, instance = null, { participants = null } = {}) {
  if (trigger?.activePhaseId && trigger.activePhaseId !== instance?.currentPhaseId) return false;
  if (FLOW_REGION_EVENT_TYPES.includes(String(event?.type ?? ""))) {
    const scope = FLOW_REGION_TOKEN_SCOPES.includes(String(trigger?.regionTokenScope ?? "any")) ? String(trigger?.regionTokenScope ?? "any") : "any";
    if (scope === "player" && event?.isPlayerCharacter !== true) return false;
    if (scope === "encounter" && !event?.participantId) return false;
  }
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
  const results = [];
  for (const condition of conditions) {
    const field = String(condition?.field ?? condition?.path ?? "").trim();
    const result = FLOW_PARTICIPANT_CONTEXT_FIELDS.includes(field)
      ? await participantConditionMatches(condition, { event, instance, participants })
      : FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS.includes(field)
        ? await groupParticipantConditionMatches(condition, trigger, { event, instance, participants })
        : compare(resolveConditionValue(field, { event, instance, trigger }), String(condition?.operator ?? "eq"), condition?.value);
    results.push(condition?.negate === true ? !result : result);
    if (mode === "any" && results.at(-1)) return true;
    if (mode === "all" && !results.at(-1)) return false;
  }
  return mode === "any" ? results.some(Boolean) : results.every(Boolean);
}

export class TriggerService extends RuntimeService {
  constructor({ bus = null, getInstance = () => null, getBlueprint = () => null, participants = null, enabled = () => true, onTrigger = null } = {}) {
    super("triggers");
    this.bus = bus;
    this.getInstance = getInstance;
    this.getBlueprint = getBlueprint;
    this.participants = participants;
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
      if (!matchesEvent(trigger, event, blueprint)) continue;

      // Reserve one-shot triggers before any async participant snapshot lookup. Foundry can
      // deliver several document hooks for one transition in the same tick; without this
      // early reservation, each hook could pass the condition gate before the first one
      // reaches onTrigger.
      if (once) this.inFlight.add(trigger.id);
      try {
        if (!await matchesTriggerConditions(trigger, event, instance, { participants: this.participants })) continue;
        matches.push(trigger);
        await this.onTrigger?.(trigger, event);
      } finally {
        if (once) this.inFlight.delete(trigger.id);
      }
    }
    return matches;
  }
}
